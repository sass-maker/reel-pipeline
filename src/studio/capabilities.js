import { evaluateLyricReadiness } from '../lyric-video/contracts.js';
import arsenalConfig from '../../config/studio-arsenal.json' with { type: 'json' };

export const STUDIO_CAPABILITIES = arsenalConfig.capabilities.map((entry) => structuredClone(entry));

export function listStudioCapabilities(brief = null, options = {}) {
  return STUDIO_CAPABILITIES.map((capability) => evaluateStudioCapability(capability.id, brief, options));
}

export function evaluateStudioCapability(kind, brief = null, options = {}) {
  const definition = STUDIO_CAPABILITIES.find((entry) => entry.id === kind);
  if (!definition) throw new Error(`unknown Studio video kind: ${kind}`);
  const action = { ...definition.action };
  if (definition.owner === 'Forge' && options.forgeUrl) action.href = options.forgeUrl;
  if (definition.owner === 'Editorial' && options.editorialUrl) action.href = options.editorialUrl;
  const missing = brief ? definition.required.filter((field) => missingField(brief, field)) : definition.required;
  const rightsBlocked = brief
    && definition.required.includes('sourceEvidence.rightsStatus')
    && brief.sourceEvidence?.rightsStatus === 'rejected';
  if (rightsBlocked) {
    return { ...definition, action, state: 'blocked', missing: [], blocker: 'Source rights are rejected.' };
  }
  if (missing.length) {
    return {
      ...definition,
      action,
      state: 'needs-input',
      missing,
      blocker: `Add ${missing.map(humanField).join(', ')} before continuing.`,
    };
  }
  if (brief && kind === 'lyric-video') {
    const lyricReadiness = evaluateLyricReadiness(brief.lyric, {
      blenderReady: options.blenderReady,
      blenderBlocker: options.blenderBlocker,
    });
    if (!lyricReadiness.ready) {
      return {
        ...definition,
        action,
        state: 'needs-input',
        missing: [],
        blocker: lyricReadiness.blockers.join(' '),
      };
    }
  }
  if (definition.owner !== 'Marketing Studio') {
    return {
      ...definition,
      action,
      state: 'external-step',
      missing: [],
      blocker: `${definition.owner} owns execution and review for this workflow.`,
    };
  }
  return {
    ...definition,
    action,
    state: 'ready',
    missing: [],
    blocker: brief?.engine && brief.engine !== 'mock'
      ? `${brief.engine} readiness is verified when the explicit render starts.`
      : null,
  };
}

export function continuationForBrief(brief, options = {}) {
  const capability = evaluateStudioCapability(brief.kind, brief, options);
  return {
    owner: capability.owner,
    state: capability.state,
    label: capability.action.label,
    href: continuationHref(capability.action.href, brief, capability.id),
    method: capability.action.kind === 'execute' ? 'POST' : 'GET',
    endpoint: capability.action.kind === 'execute' ? `/studio/briefs/${encodeURIComponent(brief.id)}/execute` : null,
    blocker: capability.blocker,
  };
}

function continuationHref(base, brief, kind) {
  if (!base) return null;
  const relative = String(base).startsWith('/');
  const url = new URL(base, 'http://studio.local');
  url.searchParams.set('studioBriefId', brief.id);
  const sourceUrl = publicHttpsUrl(brief.sourceEvidence?.canonicalUrl);
  if (kind === 'brand-reel' && sourceUrl) url.searchParams.set('url', sourceUrl);
  if (kind === 'guided-app-demo' || kind === 'coherent-film') {
    url.searchParams.set('kind', kind);
    if (brief.projectSlug) url.searchParams.set('projectName', brief.projectSlug);
    if (sourceUrl) url.searchParams.set('sourceUrl', sourceUrl);
  }
  if (kind === 'podcast-short' && sourceUrl) url.searchParams.set('sourceUrl', sourceUrl);
  return relative ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}

function publicHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function missingField(object, field) {
  const value = field.split('.').reduce((current, key) => current?.[key], object);
  if (field === 'sourceEvidence.rightsStatus') return value !== 'approved';
  return value === null || value === undefined || value === '';
}

function humanField(field) {
  return {
    projectSlug: 'a Fleet brand',
    title: 'a title',
    creativeDirection: 'creative direction',
    'sourceEvidence.canonicalUrl': 'a canonical source URL',
    'sourceEvidence.rightsStatus': 'approved source rights',
    lyric: 'music and timed lyric details',
  }[field] ?? field;
}
