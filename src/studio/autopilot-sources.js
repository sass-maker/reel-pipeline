import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import brandConfig from '../../config/brand-channels.json' with { type: 'json' };

import { extractContentPackages } from '../content-extractors.js';

const MAJOR_CHANGE = /\b(?:add(?:ed|s)?|built|connect(?:ed|s)?|enable(?:d|s)?|introduc(?:ed|es)|launch(?:ed|es)?|made|new|redesign(?:ed|s)?|release(?:d|s)?|rework(?:ed|s)?|ship(?:ped|s)?|unif(?:ied|ies))\b/i;
const MAINTENANCE_ONLY = /\b(?:bug\s*fix|cleanup|chore|ci|copy\s+edit|dependenc(?:y|ies)|docs?|internal|lint|migration only|refactor|seo|test(?:s|ing)?|typo)\b/i;
const INTERNAL_IMPLEMENTATION = /\b(?:adapter|build route|gazetteer|runtime hook|seed corpus|seed data|source mapping|workflow repaired)\b/i;
const PUBLIC_IMPACT = /\b(?:customer|dashboard|export|feature|journal|page|profile|public|publish|share|timeline|upload|user|viewer|workspace)\b/i;

export function defaultFleetRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

export async function discoverAutomationSources(policy, options = {}) {
  if (policy.source.adapter === 'major-project-changelog') {
    return discoverMajorProjectChangelogs(policy, options);
  }
  return discoverContentPackages(policy, options);
}

export async function discoverContentPackages(policy, options = {}) {
  const extractor = options.extractor ?? extractContentPackages;
  const packages = await extractor(policy.source.adapter, {
    fleetRoot: options.fleetRoot ?? defaultFleetRoot(),
    limit: options.limit ?? policy.maxItemsPerRun,
    now: options.now,
  });
  return packages.map((contentPackage) => sourceFromContentPackage(contentPackage, policy));
}

export async function discoverMajorProjectChangelogs(policy, options = {}) {
  const fleetRoot = path.resolve(options.fleetRoot ?? defaultFleetRoot());
  const catalogPath = path.resolve(options.catalogPath ?? path.join(fleetRoot, 'foundry/ops/config/projects.json'));
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const configuredBrands = new Set(options.configuredBrands ?? Object.keys(brandConfig.brands ?? {}));
  const results = [];

  for (const project of catalog.projects ?? []) {
    if (!isMaintainedPublicProject(project)) continue;
    if (policy.scope.projectSlug !== '*' && policy.scope.projectSlug !== project.id) continue;
    if (!configuredBrands.has(project.id)) {
      results.push(excludedProject(project, 'missing-channel-mapping'));
      continue;
    }

    const statusPath = path.join(fleetRoot, project.repo, 'PROJECT_STATUS.md');
    let markdown;
    try {
      markdown = await readFile(statusPath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      results.push(excludedProject(project, 'missing-project-status'));
      continue;
    }

    const entries = parseProjectTimeline(markdown);
    if (!entries.length) {
      results.push(excludedProject(project, 'missing-timeline-entry'));
      continue;
    }
    const canonicalUrl = `https://${project.domains[0]}/changelog`;
    const projectEntries = [];
    for (const entry of entries) {
      const eligibility = classifyMajorChange(entry.text);
      projectEntries.push({
        sourceAdapter: 'major-project-changelog',
        sourceId: `${project.id}:${entry.date}:${fingerprint(entry.text).slice(0, 12)}`,
        revision: 1,
        fingerprint: fingerprint({ project: project.id, date: entry.date, text: entry.text }),
        projectSlug: project.id,
        title: entry.title ?? `${project.name ?? project.id} update`,
        summary: entry.text,
        audience: `People following ${project.name ?? project.id}`,
        canonicalUrl,
        destinationUrl: canonicalUrl,
        claim: entry.text,
        hook: entry.title ?? `What changed in ${project.name ?? project.id}?`,
        cta: `See the ${project.name ?? project.id} changelog.`,
        generatedAt: `${entry.date}T00:00:00.000Z`,
        eligibility,
        contentPackage: null,
      });
    }
    let selectedMajor = false;
    for (const entry of projectEntries) {
      if (entry.eligibility.eligible && !selectedMajor) selectedMajor = true;
      else if (entry.eligibility.eligible) entry.eligibility = { eligible: false, reason: 'superseded-by-newer-change' };
      results.push(entry);
    }
  }
  return results.sort((a, b) => {
    if (a.eligibility.eligible !== b.eligibility.eligible) return a.eligibility.eligible ? -1 : 1;
    return String(b.generatedAt ?? '').localeCompare(String(a.generatedAt ?? ''));
  });
}

export function parseProjectTimeline(markdown) {
  const document = String(markdown);
  const start = document.search(/^## Timeline\s*$/m);
  if (start === -1) return [];
  const afterHeading = document.indexOf('\n', start);
  const tail = afterHeading === -1 ? '' : document.slice(afterHeading + 1);
  const nextHeading = tail.search(/^##\s/m);
  const timeline = nextHeading === -1 ? tail : tail.slice(0, nextHeading);
  const entries = [];
  let current = null;
  for (const line of timeline.split('\n')) {
    const start = line.match(/^- \*\*(\d{4}-\d{2}-\d{2})(?:\s+[—-]\s+([^*]+))?:?\*\*:?\s*(.*)$/);
    if (start) {
      if (current) entries.push(finishTimelineEntry(current));
      current = { date: start[1], title: cleanText(start[2])?.replace(/:$/, '') ?? null, lines: [start[3]] };
      continue;
    }
    if (current && /^\s{2,}\S/.test(line)) current.lines.push(line.trim());
    else if (current && line.trim()) {
      entries.push(finishTimelineEntry(current));
      current = null;
    }
  }
  if (current) entries.push(finishTimelineEntry(current));
  return entries;
}

export function classifyMajorChange(text) {
  const value = cleanText(text) ?? '';
  if (!value) return { eligible: false, reason: 'empty-change' };
  if (INTERNAL_IMPLEMENTATION.test(value)) return { eligible: false, reason: 'maintenance-only' };
  if (MAINTENANCE_ONLY.test(value) && !PUBLIC_IMPACT.test(value)) {
    return { eligible: false, reason: 'maintenance-only' };
  }
  if (!MAJOR_CHANGE.test(value)) return { eligible: false, reason: 'ambiguous-impact' };
  return { eligible: true, reason: 'major-user-visible-change' };
}

export function automationIdempotencyKey(policy, source, channel) {
  return [
    'studio-autopilot',
    policy.id,
    `r${policy.revision}`,
    source.sourceAdapter,
    source.sourceId,
    source.fingerprint,
    channel,
  ].join(':');
}

function sourceFromContentPackage(contentPackage, policy) {
  const variantChannels = new Set(contentPackage.variants.map((variant) => variant.channel));
  const missingChannel = policy.channels.find((channel) => !variantChannels.has(channel));
  return {
    sourceAdapter: contentPackage.source.adapter,
    sourceId: contentPackage.source.sourceId,
    revision: contentPackage.revision,
    fingerprint: fingerprint({
      id: contentPackage.id,
      revision: contentPackage.revision,
      source: {
        adapter: contentPackage.source.adapter,
        sourceId: contentPackage.source.sourceId,
        canonicalUrl: contentPackage.source.canonicalUrl,
      },
      topic: contentPackage.topic,
      variants: contentPackage.variants,
    }),
    projectSlug: contentPackage.brand.slug,
    title: contentPackage.topic.title,
    summary: contentPackage.topic.summary,
    audience: contentPackage.topic.audience,
    canonicalUrl: contentPackage.source.canonicalUrl,
    destinationUrl: contentPackage.topic.destinationUrl,
    claim: contentPackage.topic.claims.map((claim) => claim.text).join(' '),
    hook: contentPackage.variants[0]?.hook ?? contentPackage.topic.title,
    cta: contentPackage.variants[0]?.cta ?? null,
    generatedAt: contentPackage.source.generatedAt,
    eligibility: missingChannel
      ? { eligible: false, reason: `missing-${missingChannel}-variant` }
      : { eligible: true, reason: 'source-backed-content-package' },
    contentPackage: structuredClone(contentPackage),
  };
}

function isMaintainedPublicProject(project) {
  return project?.public?.listing === 'maintained'
    && project.lifecycle === 'maintained'
    && typeof project.repo === 'string'
    && Array.isArray(project.domains)
    && project.domains.length > 0;
}

function excludedProject(project, reason) {
  return {
    sourceAdapter: 'major-project-changelog',
    sourceId: project.id,
    revision: 1,
    fingerprint: fingerprint({ project: project.id, reason }),
    projectSlug: project.id,
    title: project.name ?? project.id,
    summary: null,
    canonicalUrl: project.domains?.[0] ? `https://${project.domains[0]}/changelog` : null,
    destinationUrl: null,
    claim: null,
    hook: null,
    cta: null,
    generatedAt: null,
    eligibility: { eligible: false, reason },
    contentPackage: null,
  };
}

function finishTimelineEntry(entry) {
  const body = cleanText(entry.lines.join(' ')) ?? '';
  return {
    date: entry.date,
    title: entry.title,
    text: entry.title ? `${entry.title}: ${body}` : body,
  };
}

function fingerprint(value) {
  const serialized = typeof value === 'string' ? value : stableStringify(value);
  return createHash('sha256').update(serialized).digest('hex');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function cleanText(value) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text || null;
}
