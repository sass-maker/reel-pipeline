import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTENT_FACTORY_BRIEF_SCHEMA_VERSION = 1;
export const CONTENT_FACTORY_MANIFEST_SCHEMA_VERSION = 1;
export const CONTENT_FACTORY_RENDERER_ADAPTER_VERSION = 'reel-pipeline-adapter-v1';

const FORMATS = new Set(['vertical_video_9_16']);
const CHANNELS = new Set(['instagram_reels', 'youtube_shorts']);
const REMOTE_ARTIFACT_MAX_BYTES = 512 * 1024 * 1024;
const REMOTE_ARTIFACT_TIMEOUT_MS = 120_000;

export function validateApprovedBrief(input) {
  const issues = [];
  if (!isRecord(input)) return invalid('brief must be an object');
  if (input.schema_version !== CONTENT_FACTORY_BRIEF_SCHEMA_VERSION)
    issues.push('schema_version must be 1');
  requiredString(input.brief_id, 'brief_id', issues);
  positiveInteger(input.brief_version, 'brief_version', issues);
  requiredString(input.project_id, 'project_id', issues);
  requiredString(input.campaign_id, 'campaign_id', issues);
  nullableString(input.experiment_id, 'experiment_id', issues);
  sha256(input.input_hash, 'input_hash', issues);
  provenance(input.source, 'source', issues);
  enumArray(input.requested_formats, FORMATS, 'requested_formats', issues);
  enumArray(input.channel_intent, CHANNELS, 'channel_intent', issues);
  if (!isRecord(input.content)) issues.push('content must be an object');
  else {
    for (const field of ['title', 'hook', 'body', 'call_to_action']) {
      requiredString(input.content[field], `content.${field}`, issues);
    }
  }
  approval(input.content_approval, 'content', 'content_approval', issues, true);
  isoDate(input.submitted_at, 'submitted_at', issues);
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: deepFreeze(structuredClone(input)) };
}

export function validateArtifactManifest(input) {
  const issues = [];
  if (!isRecord(input)) return invalid('manifest must be an object');
  if (input.schema_version !== CONTENT_FACTORY_MANIFEST_SCHEMA_VERSION)
    issues.push('schema_version must be 1');
  for (const field of ['manifest_id', 'generation_run_id', 'project_id', 'campaign_id']) {
    requiredString(input[field], field, issues);
  }
  nullableString(input.experiment_id, 'experiment_id', issues);
  sha256(input.input_hash, 'input_hash', issues);
  isoDate(input.created_at, 'created_at', issues);
  if (!isRecord(input.brief)) issues.push('brief must be an object');
  else {
    requiredString(input.brief.id, 'brief.id', issues);
    positiveInteger(input.brief.version, 'brief.version', issues);
  }
  if (!isRecord(input.renderer)) issues.push('renderer must be an object');
  else {
    requiredString(input.renderer.id, 'renderer.id', issues);
    requiredString(input.renderer.version, 'renderer.version', issues);
  }
  const variantIds = new Set();
  if (!Array.isArray(input.variants) || input.variants.length === 0)
    issues.push('variants must contain at least one variant');
  else
    input.variants.forEach((variant, index) => {
      const prefix = `variants[${index}]`;
      if (!isRecord(variant)) return issues.push(`${prefix} must be an object`);
      requiredString(variant.id, `${prefix}.id`, issues);
      if (typeof variant.id === 'string') variantIds.add(variant.id);
      if (!FORMATS.has(variant.format)) issues.push(`${prefix}.format must be vertical_video_9_16`);
      enumArray(variant.channel_intent, CHANNELS, `${prefix}.channel_intent`, issues);
    });
  if (!Array.isArray(input.assets) || input.assets.length === 0)
    issues.push('assets must contain at least one verified asset');
  else
    input.assets.forEach((asset, index) => {
      const prefix = `assets[${index}]`;
      if (!isRecord(asset)) return issues.push(`${prefix} must be an object`);
      for (const field of ['id', 'variant_id', 'media_type', 'location'])
        requiredString(asset[field], `${prefix}.${field}`, issues);
      if (typeof asset.variant_id === 'string' && !variantIds.has(asset.variant_id))
        issues.push(`${prefix}.variant_id must reference a manifest variant`);
      sha256(asset.sha256, `${prefix}.sha256`, issues);
      nonNegativeInteger(asset.size_bytes, `${prefix}.size_bytes`, issues);
    });
  quality(input.quality, issues);
  if (!Array.isArray(input.provenance) || input.provenance.length === 0)
    issues.push('provenance must contain at least one source');
  else
    input.provenance.forEach((entry, index) => provenance(entry, `provenance[${index}]`, issues));
  approval(input.review, 'artifact_review', 'review', issues, false);
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: deepFreeze(structuredClone(input)) };
}

export function legacyManifestContext(brief, options = {}) {
  const channelIntent = CHANNELS.has(brief?.channel)
    ? [brief.channel]
    : (options.channelIntent ?? ['instagram_reels', 'youtube_shorts']);
  const sourceId =
    text(brief?.marketingPostId) ?? text(brief?.taskId) ?? text(brief?.id) ?? 'legacy-brief';
  const inputHash = hashCanonicalJson(brief);
  return {
    brief: { id: text(brief?.id) ?? sourceId, version: positive(brief?.briefVersion, 1) },
    projectId: text(brief?.projectSlug) ?? 'unknown-project',
    campaignId: text(brief?.campaignId) ?? text(brief?.marketingPostId) ?? `legacy:${sourceId}`,
    experimentId: text(brief?.experimentId),
    inputHash,
    channelIntent,
    provenance: [
      { kind: 'reel-pipeline-video-brief', id: sourceId, revision: text(brief?.briefVersion) },
    ],
  };
}

export function approvedBriefManifestContext(brief) {
  const validation = validateApprovedBrief(brief);
  if (!validation.ok)
    throw new Error(`invalid Content Factory brief: ${validation.issues.join('; ')}`);
  return {
    brief: { id: brief.brief_id, version: brief.brief_version },
    projectId: brief.project_id,
    campaignId: brief.campaign_id,
    experimentId: brief.experiment_id,
    inputHash: brief.input_hash,
    channelIntent: [...brief.channel_intent],
    provenance: [structuredClone(brief.source)],
  };
}

export async function buildArtifactManifest({
  brief,
  context,
  render,
  rendererVersion,
  variantId,
  variantArtifacts,
  now = new Date(),
}) {
  if (!isRecord(render) || render.status !== 'completed') {
    throw new Error('artifact manifests require a completed render result');
  }
  const resolvedContext =
    context ??
    (brief?.schema_version === 1
      ? approvedBriefManifestContext(brief)
      : legacyManifestContext(brief));
  const variant =
    text(variantId) ?? text(render.variantId) ?? `${resolvedContext.brief.id}-vertical`;
  const plannedVariants =
    Array.isArray(variantArtifacts) && variantArtifacts.length > 0
      ? variantArtifacts.map((entry) => ({
          id: text(entry.id) ?? variant,
          format: 'vertical_video_9_16',
          channel_intent: entry.channelIntent ?? resolvedContext.channelIntent,
          locations: entry.locations ?? [],
        }))
      : [
          {
            id: variant,
            format: 'vertical_video_9_16',
            channel_intent: resolvedContext.channelIntent,
            locations: artifactLocations(render),
          },
        ];
  const assets = [];
  for (const planned of plannedVariants) {
    for (const [index, location] of planned.locations.entries()) {
      const localPath = localArtifactPath(location);
      const verified = localPath
        ? await verifyLocalArtifact(localPath, location)
        : await verifyRemoteArtifact(location);
      assets.push({
        id: `${planned.id}-asset-${index + 1}`,
        variant_id: planned.id,
        media_type: verified.mediaType,
        location,
        sha256: verified.sha256,
        size_bytes: verified.sizeBytes,
      });
    }
  }
  if (assets.length === 0)
    throw new Error(
      `renderer ${render.provider ?? 'unknown'} completed without a verifiable artifact`
    );
  const createdAt = now.toISOString();
  const generationRunId =
    text(render.externalTaskId) ?? `generation-${resolvedContext.inputHash.slice(0, 16)}`;
  const rendererId = text(render.provider) ?? 'unknown-renderer';
  const manifest = {
    schema_version: CONTENT_FACTORY_MANIFEST_SCHEMA_VERSION,
    manifest_id: `manifest-${hashCanonicalJson({ generationRunId, inputHash: resolvedContext.inputHash, assets }).slice(0, 24)}`,
    generation_run_id: generationRunId,
    brief: resolvedContext.brief,
    project_id: resolvedContext.projectId,
    campaign_id: resolvedContext.campaignId,
    experiment_id: resolvedContext.experimentId ?? null,
    input_hash: resolvedContext.inputHash,
    renderer: {
      id: rendererId,
      version: rendererVersion ?? CONTENT_FACTORY_RENDERER_ADAPTER_VERSION,
    },
    variants: plannedVariants.map(({ locations: _locations, ...entry }) => entry),
    assets,
    quality: {
      status: 'review',
      checks: [
        {
          id: 'artifact-integrity',
          status: 'passed',
          observed_at: createdAt,
          evidence_ref: `sha256://${assets[0].sha256}`,
          message: 'All emitted artifacts were read locally and hashed.',
        },
      ],
    },
    provenance: resolvedContext.provenance,
    review: {
      stage: 'artifact_review',
      status: 'pending',
      decided_by: null,
      decided_at: null,
      evidence_ref: null,
    },
    created_at: createdAt,
  };
  const validation = validateArtifactManifest(manifest);
  if (!validation.ok)
    throw new Error(`invalid Content Factory artifact manifest: ${validation.issues.join('; ')}`);
  return validation.value;
}

export async function emitArtifactManifest(options) {
  const manifest = await buildArtifactManifest(options);
  const firstPath = localArtifactPath(manifest.assets[0].location);
  const manifestDirectory = firstPath
    ? path.dirname(firstPath)
    : path.resolve('.content-factory/manifests');
  await mkdir(manifestDirectory, { recursive: true });
  const manifestPath = path.join(
    manifestDirectory,
    `${safeFileName(manifest.generation_run_id)}.content-factory-manifest.v1.json`
  );
  try {
    const existing = JSON.parse(await readFile(manifestPath, 'utf8'));
    const validation = validateArtifactManifest(existing);
    if (!validation.ok)
      throw new Error(`existing manifest is invalid: ${validation.issues.join('; ')}`);
    if (
      existing.generation_run_id !== manifest.generation_run_id ||
      existing.input_hash !== manifest.input_hash
    ) {
      throw new Error(`immutable manifest collision at ${manifestPath}`);
    }
    return { manifest: validation.value, manifestPath };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return { manifest, manifestPath };
}

export async function decorateRenderResult({ brief, context, render, rendererVersion, variantId }) {
  if (render?.status !== 'completed') return render;
  const { manifest, manifestPath } = await emitArtifactManifest({
    brief,
    context,
    render,
    rendererVersion,
    variantId,
  });
  return { ...render, artifactManifest: manifest, artifactManifestPath: manifestPath };
}

export function wrapLegacyRenderer(renderer, options = {}) {
  if (!renderer || typeof renderer.createVideo !== 'function' || renderer.__contentFactoryWrapped)
    return renderer;
  const createVideo = renderer.createVideo.bind(renderer);
  const getStatus =
    typeof renderer.getStatus === 'function' ? renderer.getStatus.bind(renderer) : null;
  const contexts = new Map();
  renderer.createVideo = async (brief, renderOptions = {}) => {
    const render = await createVideo(brief, renderOptions);
    const context = legacyManifestContext(brief, options);
    if (render?.externalTaskId)
      contexts.set(render.externalTaskId, { brief, context, variantId: renderOptions.variantId });
    return decorateRenderResult({
      brief,
      context,
      render,
      rendererVersion: options.rendererVersion,
      variantId: renderOptions.variantId,
    });
  };
  if (getStatus)
    renderer.getStatus = async (externalTaskId, statusOptions = {}) => {
      const render = await getStatus(externalTaskId, statusOptions);
      const cached = contexts.get(externalTaskId);
      const brief = statusOptions.brief ?? cached?.brief;
      if (render?.status === 'completed' && !brief)
        throw new Error(`cannot manifest completed render ${externalTaskId} without its brief`);
      return decorateRenderResult({
        brief,
        context: cached?.context,
        render,
        rendererVersion: options.rendererVersion,
        variantId: cached?.variantId,
      });
    };
  Object.defineProperty(renderer, '__contentFactoryWrapped', { value: true });
  return renderer;
}

export function contentFactoryRenderer(renderer, options = {}) {
  return {
    async createVideo(brief, renderOptions = {}) {
      const context = approvedBriefManifestContext(brief);
      const legacyBrief = {
        id: brief.brief_id,
        projectSlug: brief.project_id,
        channel: brief.channel_intent[0],
        title: brief.content.title,
        hook: brief.content.hook,
        body: brief.content.body,
        cta: brief.content.call_to_action,
        durationSeconds: renderOptions.durationSeconds ?? 20,
      };
      const render = await renderer.createVideo(legacyBrief, renderOptions);
      return decorateRenderResult({
        brief,
        context,
        render,
        rendererVersion: options.rendererVersion,
        variantId: renderOptions.variantId,
      });
    },
  };
}

export function hashCanonicalJson(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function artifactLocations(render) {
  const primary = [
    ...(Array.isArray(render.videos) ? render.videos : []),
    ...(Array.isArray(render.combinedVideos) ? render.combinedVideos : []),
    ...(Array.isArray(render.artifacts) ? render.artifacts : []),
    render.videoUrl,
    render.outputPath,
    render.artifact,
  ];
  const primaryLocations = uniqueLocations(primary);
  if (primaryLocations.length > 0) return primaryLocations;
  return uniqueLocations([
    render.thumbnail,
    render.raw?.previewHtmlPath,
    render.raw?.timelinePath,
    render.raw?.captionsPath,
  ]);
}

function uniqueLocations(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))];
}

function localArtifactPath(location) {
  if (location.startsWith('file://')) return fileURLToPath(location);
  if (/^https?:\/\//i.test(location)) return null;
  return path.resolve(location);
}

async function hashFile(filePath) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest('hex');
}

async function verifyLocalArtifact(localPath, location) {
  const info = await stat(localPath);
  if (!info.isFile()) throw new Error(`artifact is not a file: ${location}`);
  return {
    mediaType: mediaType(localPath),
    sha256: await hashFile(localPath),
    sizeBytes: info.size,
  };
}

async function verifyRemoteArtifact(location) {
  const response = await fetch(location, {
    signal: AbortSignal.timeout(REMOTE_ARTIFACT_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(`cannot verify remote artifact ${location}: HTTP ${response.status}`);
  const advertisedSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(advertisedSize) && advertisedSize > REMOTE_ARTIFACT_MAX_BYTES) {
    throw new Error(`remote artifact exceeds ${REMOTE_ARTIFACT_MAX_BYTES} bytes: ${location}`);
  }
  if (!response.body) throw new Error(`remote artifact has no response body: ${location}`);
  const digest = createHash('sha256');
  let sizeBytes = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    sizeBytes += bytes.length;
    if (sizeBytes > REMOTE_ARTIFACT_MAX_BYTES) {
      await response.body.cancel().catch(() => {});
      throw new Error(`remote artifact exceeds ${REMOTE_ARTIFACT_MAX_BYTES} bytes: ${location}`);
    }
    digest.update(bytes);
  }
  return {
    mediaType:
      response.headers.get('content-type')?.split(';')[0] || mediaType(new URL(location).pathname),
    sha256: digest.digest('hex'),
    sizeBytes,
  };
}

function mediaType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return (
    {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.html': 'text/html',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
    }[extension] ?? 'application/octet-stream'
  );
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value ?? null);
}

function quality(value, issues) {
  if (!isRecord(value)) return issues.push('quality must be an object');
  if (!['passed', 'failed', 'review'].includes(value.status))
    issues.push('quality.status must be passed, failed, or review');
  if (!Array.isArray(value.checks) || value.checks.length === 0)
    return issues.push('quality.checks must contain at least one check');
  value.checks.forEach((check, index) => {
    const prefix = `quality.checks[${index}]`;
    if (!isRecord(check)) return issues.push(`${prefix} must be an object`);
    requiredString(check.id, `${prefix}.id`, issues);
    if (!['passed', 'failed', 'unavailable'].includes(check.status))
      issues.push(`${prefix}.status must be passed, failed, or unavailable`);
    isoDate(check.observed_at, `${prefix}.observed_at`, issues);
    nullableString(check.evidence_ref, `${prefix}.evidence_ref`, issues);
    nullableString(check.message, `${prefix}.message`, issues);
  });
}

function approval(value, stage, label, issues, approved) {
  if (!isRecord(value)) return issues.push(`${label} must be an object`);
  if (value.stage !== stage) issues.push(`${label}.stage must be ${stage}`);
  if (!['pending', 'approved', 'rejected'].includes(value.status))
    issues.push(`${label}.status must be pending, approved, or rejected`);
  nullableString(value.decided_by, `${label}.decided_by`, issues);
  if (value.decided_at !== null) isoDate(value.decided_at, `${label}.decided_at`, issues);
  nullableString(value.evidence_ref, `${label}.evidence_ref`, issues);
  if (approved && value.status !== 'approved')
    issues.push(`${label}.status must be approved before generation`);
  if (
    value.status === 'approved' &&
    (typeof value.decided_by !== 'string' || Number.isNaN(Date.parse(value.decided_at)))
  )
    issues.push(`${label} approval requires decided_by and decided_at`);
}

function provenance(value, label, issues) {
  if (!isRecord(value)) return issues.push(`${label} must be an object`);
  requiredString(value.kind, `${label}.kind`, issues);
  requiredString(value.id, `${label}.id`, issues);
  nullableString(value.revision, `${label}.revision`, issues);
}
function requiredString(value, label, issues) {
  if (typeof value !== 'string' || !value.trim())
    issues.push(`${label} must be a non-empty string`);
}
function nullableString(value, label, issues) {
  if (value !== null && typeof value !== 'string') issues.push(`${label} must be a string or null`);
}
function positiveInteger(value, label, issues) {
  if (!Number.isInteger(value) || value < 1) issues.push(`${label} must be a positive integer`);
}
function nonNegativeInteger(value, label, issues) {
  if (!Number.isInteger(value) || value < 0) issues.push(`${label} must be a non-negative integer`);
}
function sha256(value, label, issues) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value))
    issues.push(`${label} must be a hexadecimal SHA-256 digest`);
}
function isoDate(value, label, issues) {
  if (typeof value !== 'string' || !value.trim() || Number.isNaN(Date.parse(value)))
    issues.push(`${label} must be an ISO-8601 timestamp`);
}
function enumArray(value, allowed, label, issues) {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => !allowed.has(entry)))
    issues.push(`${label} must contain only: ${[...allowed].join(', ')}`);
}
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function invalid(issue) {
  return { ok: false, issues: [issue] };
}
function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function positive(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function safeFileName(value) {
  return (
    String(value)
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 140) || 'generation'
  );
}
function deepFreeze(value) {
  if (!isRecord(value) && !Array.isArray(value)) return value;
  if (Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
