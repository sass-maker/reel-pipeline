import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { normalizeContentPackage } from '../content-package.js';
import { buildDistributionRequest, executeDistribution } from '../distribution.js';
import { PostizClient } from '../postiz-client.js';
import { evaluateLyricRights } from '../lyric-video/contracts.js';

export function buildStudioDistributionBundle(brief, options = {}) {
  assertDistributionEvidence(brief);
  const now = options.now?.() ?? new Date();
  const occurredAt = now.toISOString();
  const scheduledFor = normalizeFutureSchedule(options.scheduledFor, now);
  const variantId = `studio-${brief.id}`;
  const packageInput = {
    schema: 'fleet.content-package.v1',
    id: brief.id,
    revision: brief.revision,
    createdAt: occurredAt,
    brand: { slug: brief.projectSlug },
    source: {
      adapter: 'marketing-studio',
      sourceId: brief.id,
      canonicalUrl: brief.sourceEvidence.canonicalUrl,
      generatedAt: occurredAt,
    },
    topic: {
      title: brief.title,
      summary: brief.summary,
      audience: null,
      destinationUrl: brief.sourceEvidence.destinationUrl,
      claims: [{
        text: brief.sourceEvidence.claim,
        evidenceUrls: [brief.sourceEvidence.canonicalUrl],
      }],
    },
    approval: {
      status: 'approved',
      approvedAt: occurredAt,
      approvedBy: options.approvedBy ?? 'owner',
    },
    variants: [{
      id: variantId,
      channel: brief.channel,
      status: 'approved',
      hook: brief.hook,
      script: brief.summary,
      shotList: ['Opening hook', 'Source-backed proof', 'Visible result', 'Call to action'],
      captions: [brief.hook, brief.sourceEvidence.claim, brief.cta],
      visualDirection: brief.creativeDirection ?? 'Use the approved source as the dominant visual.',
      cta: brief.cta,
      template: brief.kind,
      durationSeconds: Math.max(10, Math.min(90, brief.durationSeconds)),
    }],
  };
  const contentPackage = normalizeContentPackage(packageInput);
  const mediaReceipt = {
    schema: 'fleet.media-receipt.v1',
    packageId: contentPackage.id,
    packageRevision: contentPackage.revision,
    variantId,
    brand: brief.projectSlug,
    channel: brief.channel,
    provider: brief.media.provider ?? brief.engine ?? 'studio',
    status: 'rendered',
    artifact: brief.media.videoPath,
    publicUrl: brief.media.publicUrl,
    recordedAt: brief.media.reviewedAt ?? occurredAt,
  };
  const request = buildDistributionRequest(contentPackage, mediaReceipt, {
    provider: 'postiz',
    scheduledFor,
    createdAt: occurredAt,
  });
  return { contentPackage, mediaReceipt, request };
}

export async function createStudioPostizDraft(brief, options = {}) {
  if (options.scheduledFor !== undefined) {
    throw new Error('createStudioPostizDraft does not accept a schedule; use submitStudioPostiz');
  }
  return submitStudioPostiz(brief, options);
}

export async function submitStudioPostiz(brief, options = {}) {
  if (options.publishNow !== undefined) {
    throw new Error('Marketing Studio does not accept immediate publication actions');
  }
  if (brief?.distribution?.receipt?.externalId) {
    throw new Error('a Postiz receipt already exists for this production; manage it in Postiz');
  }
  const approvedBy = requiredString(options.approvedBy, 'approvedBy');
  const now = options.now?.() ?? new Date();
  const scheduledFor = normalizeFutureSchedule(options.scheduledFor, now);
  const fixedNow = () => now;
  const bundle = buildStudioDistributionBundle(brief, { now: fixedNow, approvedBy, scheduledFor });
  const postizClient = options.postizClient ?? await resolveStudioPostizClient(options);
  const approvedRequest = {
    ...bundle.request,
    scheduledFor,
    approval: {
      status: 'approved',
      approvedAt: now.toISOString(),
      approvedBy,
    },
  };
  const receipt = await executeDistribution(
    bundle.contentPackage,
    bundle.mediaReceipt,
    approvedRequest,
    { postizProvider: postizClient, now: fixedNow },
  );
  return {
    request: approvedRequest,
    receipt: sanitizeDistributionReceipt(receipt, scheduledFor),
  };
}

export function normalizeFutureSchedule(value, now = new Date()) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('scheduledFor must be an ISO date');
  if (date.getTime() <= now.getTime()) throw new Error('scheduledFor must be in the future');
  return date.toISOString();
}

export async function resolveStudioPostizClient(options = {}) {
  if (options.postizClient) return options.postizClient;
  const configPath = path.resolve(
    options.integrationsPath
      ?? process.env.POSTIZ_INTEGRATIONS_CONFIG
      ?? 'config/postiz-integrations.json',
  );
  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    throw new Error('Postiz integration mapping is not configured on this machine');
  }
  return new PostizClient({
    integrations: config.integrations,
    baseUrl: options.postizBaseUrl,
    apiKey: options.postizApiKey,
    fetchImpl: options.fetchImpl,
  });
}

export function studioPostizReadiness(options = {}) {
  const baseUrl = options.postizBaseUrl ?? process.env.POSTIZ_BASE_URL ?? null;
  const apiKeyPresent = Boolean(options.postizClient || options.postizApiKey || process.env.POSTIZ_API_KEY);
  const integrationsPath = path.resolve(
    options.integrationsPath
      ?? process.env.POSTIZ_INTEGRATIONS_CONFIG
      ?? 'config/postiz-integrations.json',
  );
  const mappingConfigured = Boolean(
    options.postizClient
    || options.integrationsConfigured
    || existsSync(integrationsPath),
  );
  return {
    state: apiKeyPresent && mappingConfigured ? 'ready-for-submission' : 'not-configured',
    apiConfigured: apiKeyPresent,
    mappingConfigured,
    appUrl: normalizePostizAppUrl(options.postizAppUrl ?? process.env.POSTIZ_APP_URL ?? baseUrl),
    schedulingOwner: 'Postiz',
    boundary: 'Marketing Studio can create drafts or schedule future posts through Postiz. Postiz owns credentials, publication state, calendar lifecycle, and analytics.',
  };
}

function assertDistributionEvidence(brief) {
  const missing = [];
  if (brief?.kind === 'lyric-video') {
    const lyricRights = evaluateLyricRights(brief.lyric);
    if (!lyricRights.ready) missing.push(...lyricRights.blockers);
    if (!brief?.media?.rightsPath) missing.push('lyric rights manifest');
    if (!brief?.media?.scenePlanPath) missing.push('literal lyric scene plan');
  }
  if (!brief?.projectSlug) missing.push('Fleet brand');
  if (!brief?.sourceEvidence?.canonicalUrl) missing.push('canonical source URL');
  if (!brief?.sourceEvidence?.claim) missing.push('source-backed claim');
  if (!brief?.sourceEvidence?.destinationUrl) missing.push('destination URL');
  if (brief?.sourceEvidence?.rightsStatus !== 'approved') missing.push('approved source rights');
  if (brief?.approval?.creativeStatus !== 'approved') missing.push('creative approval');
  const qualityPassed = brief?.media?.quality?.verdict === 'pass' || brief?.approval?.qualityAccepted === true;
  if (!qualityPassed) missing.push('passing or explicitly accepted quality evidence');
  if (!brief?.cta) missing.push('call to action');
  if (!brief?.media?.videoPath) missing.push('rendered video');
  if (!brief?.media?.publicUrl || !isPublicHttps(brief.media.publicUrl)) missing.push('stable public HTTPS media URL');
  if (missing.length) throw new Error(`distribution evidence incomplete: ${missing.join(', ')}`);
}

function isPublicHttps(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return !['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function sanitizeDistributionReceipt(receipt, scheduledFor) {
  return {
    schema: receipt.schema,
    requestId: receipt.requestId,
    packageId: receipt.packageId,
    packageRevision: receipt.packageRevision,
    brand: receipt.brand,
    channel: receipt.channel,
    provider: receipt.provider,
    status: receipt.status,
    externalId: receipt.externalId,
    externalUrl: receipt.externalUrl,
    scheduledFor,
    recordedAt: receipt.recordedAt,
  };
}

function normalizePostizAppUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/public\/v1\/?$/, '/');
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}
