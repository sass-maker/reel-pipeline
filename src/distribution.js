import { getBrandProfile, normalizeContentPackage } from './content-package.js';

export const DISTRIBUTION_REQUEST_SCHEMA = 'fleet.distribution-request.v1';
export const DISTRIBUTION_RECEIPT_SCHEMA = 'fleet.distribution-receipt.v1';
// `postiz` remains decodable for old persisted project files. New agent and
// Studio operations must use `internal`; no capability manifest advertises the
// legacy adapter.
const PROVIDERS = new Set(['manual', 'internal', 'postiz']);

export function buildDistributionRequest(contentInput, mediaReceipt, options = {}) {
  const contentPackage = normalizeContentPackage(contentInput);
  assertMediaMatches(contentPackage, mediaReceipt);
  const variant = contentPackage.variants.find((entry) => entry.id === mediaReceipt.variantId);
  return normalizeDistributionRequest({
    schema: DISTRIBUTION_REQUEST_SCHEMA,
    id: options.id ?? `${contentPackage.id}-r${contentPackage.revision}-${variant.id}`,
    createdAt: options.createdAt ?? new Date().toISOString(),
    packageId: contentPackage.id,
    packageRevision: contentPackage.revision,
    variantId: variant.id,
    brand: contentPackage.brand.slug,
    channel: variant.channel,
    provider: options.provider ?? 'manual',
    accountSlug: options.accountSlug ?? getBrandProfile(contentPackage.brand.slug).accountMappings?.[variant.channel] ?? null,
    scheduledFor: options.scheduledFor ?? null,
    media: {
      receiptSchema: mediaReceipt.schema,
      artifact: mediaReceipt.artifact,
      publicUrl: mediaReceipt.publicUrl ?? null,
    },
    copy: {
      title: contentPackage.topic.title,
      caption: `${variant.hook}\n\n${variant.cta}`,
      destinationUrl: contentPackage.topic.destinationUrl,
    },
    approval: { status: 'proposed', approvedAt: null, approvedBy: null },
  });
}

export function normalizeDistributionRequest(input) {
  if (input?.schema !== DISTRIBUTION_REQUEST_SCHEMA) throw new Error('unsupported distribution request schema');
  if (!PROVIDERS.has(input.provider)) throw new Error(`unsupported distribution provider: ${input.provider}`);
  if (!['instagram_reels', 'youtube_shorts', 'tiktok'].includes(input.channel)) throw new Error(`unsupported channel: ${input.channel}`);
  if (!['proposed', 'approved', 'rejected'].includes(input.approval?.status)) throw new Error('invalid distribution approval status');
  const approval = {
    status: input.approval.status,
    approvedAt: input.approval.approvedAt ? iso(input.approval.approvedAt, 'approval.approvedAt') : null,
    approvedBy: optionalString(input.approval.approvedBy),
  };
  if (approval.status === 'approved' && (!approval.approvedAt || !approval.approvedBy)) {
    throw new Error('approved distribution request requires approvedAt and approvedBy');
  }
  return {
    schema: DISTRIBUTION_REQUEST_SCHEMA,
    id: requiredString(input.id, 'id'),
    packageId: requiredString(input.packageId, 'packageId'),
    packageRevision: positiveInteger(input.packageRevision, 'packageRevision'),
    variantId: requiredString(input.variantId, 'variantId'),
    brand: requiredString(input.brand, 'brand'),
    channel: input.channel,
    provider: input.provider,
    createdAt: iso(input.createdAt, 'createdAt'),
    scheduledFor: input.scheduledFor ? iso(input.scheduledFor, 'scheduledFor') : null,
    accountSlug: optionalString(input.accountSlug),
    media: {
      receiptSchema: requiredString(input.media?.receiptSchema, 'media.receiptSchema'),
      artifact: requiredString(input.media?.artifact, 'media.artifact'),
      publicUrl: input.media?.publicUrl ? absoluteUrl(input.media.publicUrl, 'media.publicUrl') : null,
    },
    copy: {
      title: requiredString(input.copy?.title, 'copy.title'),
      caption: requiredString(input.copy?.caption, 'copy.caption'),
      destinationUrl: absoluteUrl(input.copy?.destinationUrl, 'copy.destinationUrl'),
    },
    approval,
  };
}

export async function executeDistribution(contentInput, mediaReceipt, requestInput, options = {}) {
  const contentPackage = normalizeContentPackage(contentInput);
  const request = normalizeDistributionRequest(requestInput);
  assertMediaMatches(contentPackage, mediaReceipt);
  assertRequestMatches(contentPackage, mediaReceipt, request);
  if (request.approval.status !== 'approved') throw new Error('distribution request must be approved before posting');

  if (request.provider === 'manual') return distributionReceipt(request, {
    status: 'prepared',
    provider: 'manual',
    externalId: null,
    externalUrl: null,
  }, options.now);

  if (!request.accountSlug) throw new Error(`no ${request.channel} account mapping configured for ${request.brand}`);
  if (request.provider === 'internal') {
    if (!options.internalProvider) throw new Error('Fleet internal publishing is not configured for this channel');
    const result = await options.internalProvider.post(toMarketingPost(contentPackage, mediaReceipt, request));
    return distributionReceipt(request, result, options.now);
  }
  if (request.provider === 'postiz') {
    if (!options.postizProvider) throw new Error('legacy Postiz adapter is not configured');
    const result = await options.postizProvider.post(toMarketingPost(contentPackage, mediaReceipt, request));
    return distributionReceipt(request, result, options.now);
  }
}

export function toMarketingPost(contentPackage, mediaReceipt, request) {
  return {
    id: request.id,
    project_slug: contentPackage.brand.slug,
    account_slug: request.accountSlug,
    channel: request.channel,
    title: request.copy.title,
    body: request.copy.caption,
    cta: request.copy.destinationUrl,
    status: 'accepted',
    scheduled_for: request.scheduledFor,
    local_path: mediaReceipt.artifact,
    result_url: request.media.publicUrl,
    result_path: mediaReceipt.artifact,
  };
}

function assertMediaMatches(contentPackage, receipt) {
  if (receipt?.schema !== 'fleet.media-receipt.v1') throw new Error('invalid media receipt');
  if (receipt.status !== 'rendered') throw new Error('media receipt must be rendered');
  if (receipt.packageId !== contentPackage.id || receipt.packageRevision !== contentPackage.revision) {
    throw new Error('media receipt does not match package revision');
  }
  const variant = contentPackage.variants.find((entry) => entry.id === receipt.variantId);
  if (!variant || variant.channel !== receipt.channel || contentPackage.brand.slug !== receipt.brand) {
    throw new Error('media receipt does not match brand, variant, and channel');
  }
}

function assertRequestMatches(contentPackage, receipt, request) {
  if (request.packageId !== contentPackage.id || request.packageRevision !== contentPackage.revision || request.variantId !== receipt.variantId) {
    throw new Error('distribution request does not match package revision and media');
  }
  if (request.brand !== contentPackage.brand.slug || request.channel !== receipt.channel || request.media?.artifact !== receipt.artifact) {
    throw new Error('distribution request does not match brand, channel, and artifact');
  }
  const mappedAccount = getBrandProfile(request.brand).accountMappings?.[request.channel] ?? null;
  if (request.provider !== 'manual' && mappedAccount !== request.accountSlug) {
    throw new Error(`account mapping mismatch for ${request.brand}/${request.channel}`);
  }
}

function distributionReceipt(request, result, now = () => new Date()) {
  return {
    schema: DISTRIBUTION_RECEIPT_SCHEMA,
    requestId: request.id,
    packageId: request.packageId,
    packageRevision: request.packageRevision,
    brand: request.brand,
    channel: request.channel,
    provider: result.provider ?? request.provider,
    accountSlug: request.accountSlug,
    status: result.status,
    externalId: result.externalId ?? null,
    externalUrl: result.externalUrl ?? null,
    scheduledFor: request.scheduledFor,
    recordedAt: now().toISOString(),
  };
}

function positiveInteger(value, field) { const number = Number(value); if (!Number.isInteger(number) || number < 1) throw new Error(`${field} must be a positive integer`); return number; }
function iso(value, field) { if (!Number.isFinite(Date.parse(value))) throw new Error(`${field} must be an ISO date`); return new Date(value).toISOString(); }
function optionalString(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function requiredString(value, field) { const text = optionalString(value); if (!text) throw new Error(`${field} is required`); return text; }
function absoluteUrl(value, field) { const text = requiredString(value, field); let url; try { url = new URL(text); } catch { throw new Error(`${field} must be an absolute URL`); } if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${field} must use http or https`); return url.toString(); }
