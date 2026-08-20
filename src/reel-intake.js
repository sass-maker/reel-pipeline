import { normalizeVideoBrief } from './video-brief.js';

const REEL_STATUSES = new Set([
  'generated',
  'approved',
  'rejected',
  'rendering',
  'video_ready',
  'needs_review',
  'ready_to_post',
  'video_rejected',
  'posted',
]);

export class R2ReelStore {
  constructor(bucket, options = {}) {
    if (!bucket) throw new Error('missing REEL_ARTIFACTS binding');
    this.bucket = bucket;
    this.prefix = options.prefix ?? 'reel-requests/';
  }

  async save(record) {
    const now = new Date().toISOString();
    const next = {
      ...record,
      updatedAt: now,
      createdAt: record.createdAt ?? now,
    };
    await this.bucket.put(this.pathFor(record.id), JSON.stringify(next, null, 2), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });
    return next;
  }

  async get(id) {
    const object = await this.bucket.get(this.pathFor(id));
    if (!object) return null;
    return object.json();
  }

  async list() {
    const listed = await this.bucket.list({ prefix: this.prefix });
    const objects = await Promise.all((listed.objects ?? []).map((object) => this.bucket.get(object.key)));
    const records = [];
    for (const object of objects) {
      if (object) records.push(await object.json());
    }
    return records.sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')));
  }

  pathFor(id) {
    return `${this.prefix}${safeId(id)}.json`;
  }
}

export async function createReelDraft(input, options = {}) {
  const store = requiredStore(options.reelStore);
  const record = normalizeReelDraftInput(input, options);
  return store.save(record);
}

export async function listReelDrafts(filters = {}, options = {}) {
  const store = requiredStore(options.reelStore);
  const records = await store.list();
  return records.filter((record) => {
    if (filters.status && record.status !== filters.status) return false;
    if (filters.projectSlug && record.projectSlug !== filters.projectSlug) return false;
    if (filters.project_slug && record.projectSlug !== filters.project_slug) return false;
    if (filters.channel && record.channel !== filters.channel) return false;
    return true;
  });
}

export async function decideReelDraft(id, decision, options = {}) {
  const store = requiredStore(options.reelStore);
  const record = await store.get(id);
  if (!record) return null;
  const normalizedDecision = normalizeDecision(decision);
  return store.save({
    ...record,
    status: normalizedDecision === 'approve' ? 'approved' : 'rejected',
    decision: normalizedDecision,
    decidedAt: new Date().toISOString(),
  });
}

export async function decideRenderedReel(id, decision, options = {}) {
  const store = requiredStore(options.reelStore);
  const record = await store.get(id);
  if (!record) return null;
  const allowed = ['video_ready', 'ready_to_post', 'video_rejected', 'needs_review'];
  if (!allowed.includes(record.status)) {
    throw new Error('reel video must be rendered before video decision');
  }
  const normalizedDecision = normalizeDecision(decision);
  const variantId = typeof decision === 'object' ? optionalString(decision.variantId) : undefined;

  const variants = Array.isArray(record.variants) ? record.variants.slice() : [];
  let targetVariant = null;
  if (variantId) {
    const index = variants.findIndex((variant) => variant.variantId === variantId);
    if (index === -1) throw new Error(`variant not found: ${variantId}`);
    targetVariant = {
      ...variants[index],
      status: normalizedDecision === 'approve' ? 'ready_to_post' : 'video_rejected',
      decidedAt: new Date().toISOString(),
    };
    variants[index] = targetVariant;
  }

  const acceptedVariant = variants.find((variant) => variant.status === 'ready_to_post');
  const remainingReviewable = variants.some((variant) => variant.status === 'video_ready' || variant.status === 'needs_review');

  let nextStatus = record.status;
  let nextAssetUrl = record.assetUrl ?? null;
  if (variantId) {
    if (acceptedVariant) {
      nextStatus = 'ready_to_post';
      nextAssetUrl = acceptedVariant.assetUrl ?? nextAssetUrl;
    } else if (remainingReviewable) {
      nextStatus = 'video_ready';
    } else {
      nextStatus = 'video_rejected';
    }
  } else {
    nextStatus = normalizedDecision === 'approve' ? 'ready_to_post' : 'video_rejected';
  }

  return store.save({
    ...record,
    status: nextStatus,
    assetUrl: nextAssetUrl,
    videoDecision: normalizedDecision,
    videoDecidedAt: new Date().toISOString(),
    variants,
  });
}

export async function attachReelRender(id, renderResult, options = {}) {
  const store = requiredStore(options.reelStore);
  const record = await store.get(id);
  if (!record) return null;
  const job = renderResult.job ?? renderResult;
  const variants = Array.isArray(renderResult.variants) ? renderResult.variants : null;

  if (variants && variants.length) {
    const variantStatus = variants.some((variant) => variant.status === 'video_ready' || variant.status === 'needs_review')
      ? variants.some((variant) => variant.status === 'video_ready') ? 'video_ready' : 'needs_review'
      : 'video_rejected';
    return store.save({
      ...record,
      status: variantStatus,
      renderJobId: job.id ?? null,
      render: job.render ?? null,
      assetUrl: firstVariantUrl(variants),
      thumbnailUrl: firstVariantThumbnail(variants),
      renderedAt: new Date().toISOString(),
      variants,
      renderLog: renderResult.renderLog ?? null,
    });
  }

  return store.save({
    ...record,
    status: job.status === 'video_ready' ? 'video_ready' : job.status ?? 'rendering',
    renderJobId: job.id,
    render: job.render ?? null,
    assetUrl: firstVideoUrl(job),
    renderedAt: job.status === 'video_ready' ? new Date().toISOString() : record.renderedAt ?? null,
  });
}

function firstVariantUrl(variants) {
  const ready = variants.find((variant) => variant.status === 'video_ready' || variant.status === 'needs_review');
  return ready?.assetUrl ?? variants[0]?.assetUrl ?? null;
}

function firstVariantThumbnail(variants) {
  const ready = variants.find((variant) => variant.thumbnailUrl);
  return ready?.thumbnailUrl ?? null;
}

export function assertRenderableReel(record, options = {}) {
  if (!record) throw new Error('reel not found');
  if (!options.allowUnapproved && record.status !== 'approved') {
    throw new Error('reel must be approved before rendering');
  }
  if (record.renderJobId && !options.force) {
    throw new Error('reel already has a render job');
  }
}

export function normalizeReelDraftInput(input, options = {}) {
  const id = optionalString(input.id) ?? makeReelId(options.now?.() ?? new Date());
  const projectId = optionalString(input.projectId ?? input.project_id);
  const projectSlug = optionalString(input.projectSlug ?? input.project_slug) ?? projectId;
  if (!projectSlug) throw new Error('projectSlug or projectId is required');

  const details = input.realDetails ?? input.real_details ?? input.productDetails ?? input.product_details ?? input.details;
  const title = optionalString(input.title) ?? titleFrom(projectSlug, input.goal);
  const hook = optionalString(input.hook) ?? hookFrom(input.goal, details, title);
  const body = optionalString(input.body) ?? buildVideoBriefBody({ ...input, details, title, hook });
  const channel = optionalString(input.channel) ?? 'tiktok';
  const brief = normalizeVideoBrief({
    id: `brief_${id}`,
    projectSlug,
    taskId: input.taskId ?? input.task_id,
    marketingPostId: input.marketingPostId ?? input.marketing_post_id,
    channel,
    title,
    hook,
    body,
    cta: input.cta,
    audience: input.audience,
    productUrl: input.productUrl ?? input.product_url,
    proofUrl: input.proofUrl ?? input.proof_url,
    targetRoute: input.targetRoute ?? input.target_route,
    recordingUrl: input.recordingUrl ?? input.recording_url,
    changelogEntryId: input.changelogEntryId ?? input.changelog_entry_id,
    brandTone: input.brandTone ?? input.brand_tone,
    proofType: input.proofType ?? input.proof_type,
    template: input.template,
    screenshots: input.screenshots,
    demoSteps: input.demoSteps ?? input.demo_steps,
    renderMode: input.renderMode ?? input.render_mode ?? 'html-composition',
    durationSeconds: input.durationSeconds ?? input.duration_seconds,
  });

  const status = optionalString(input.status) ?? 'generated';
  if (!REEL_STATUSES.has(status)) throw new Error(`unsupported reel status: ${status}`);

  return {
    id,
    status,
    projectId,
    projectSlug,
    channel: brief.channel,
    title: brief.title,
    hook: brief.hook,
    body: brief.body,
    cta: brief.cta,
    audience: brief.audience,
    productUrl: brief.productUrl,
    proofUrl: brief.proofUrl,
    targetRoute: brief.targetRoute,
    demoSteps: brief.demoSteps ?? null,
    screenshots: brief.screenshots ?? null,
    template: brief.template ?? null,
    proofType: brief.proofType ?? null,
    brandTone: brief.brandTone ?? null,
    source: optionalString(input.source) ?? 'api',
    sourceDetails: details ?? null,
    brief,
    decision: null,
    renderJobId: null,
    variants: [],
  };
}

function buildVideoBriefBody(input) {
  const details = stringifyDetails(input.details);
  const audience = optionalString(input.audience) ?? 'people with this problem';
  const goal = optionalString(input.goal) ?? 'show the product value quickly';
  const proof = optionalString(input.proof) ?? 'use the product screen or concrete output as proof';
  const cta = optionalString(input.cta) ?? 'try the product';
  return [
    `Script: Open with "${input.hook}". Show the user pain, then show ${input.title} solving it with a real product moment. End with "${cta}".`,
    `Shot list: first-frame pain shot; product UI or artifact proof; before/after contrast; final result screen; simple end card.`,
    `Captions: "${input.hook}" / "${proof}" / "${cta}".`,
    `Asset prompts: vertical phone or laptop footage, product UI close-up, realistic creator desk, no generic AI stock montage.`,
    `Edit notes: 9:16, fast first cut, direct voiceover, keep it specific to ${input.title}, avoid vague hype.`,
    `Audience: ${audience}.`,
    `Goal: ${goal}.`,
    details ? `Real details: ${details}` : 'Real details: none supplied.',
  ].join('\n');
}

function normalizeDecision(value) {
  const decision = typeof value === 'string' ? value : value?.decision;
  if (decision === 'approve' || decision === 'approved') return 'approve';
  if (decision === 'reject' || decision === 'rejected') return 'reject';
  throw new Error('decision must be approve or reject');
}

function titleFrom(projectSlug, goal) {
  const cleanGoal = optionalString(goal);
  if (cleanGoal) return cleanGoal.length > 80 ? cleanGoal.slice(0, 77).trimEnd() + '...' : cleanGoal;
  return `${projectSlug} reel draft`;
}

function hookFrom(goal, details, title) {
  const detailHook = typeof details === 'object' && details
    ? optionalString(details.pain) ?? optionalString(details.proof) ?? optionalString(details.product)
    : undefined;
  const text = optionalString(goal) || detailHook || stringifyDetails(details) || title;
  return text.length > 90 ? text.slice(0, 87).trimEnd() + '...' : text;
}

function stringifyDetails(details) {
  if (!details) return '';
  if (typeof details === 'string') return details.trim();
  return Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([key, value]) => `${key}: ${String(value).trim()}`)
    .join('; ');
}

function makeReelId(now) {
  return `reel_${now.toISOString().replace(/[^0-9]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`;
}

function requiredStore(store) {
  if (!store) throw new Error('reelStore is required');
  return store;
}

function firstVideoUrl(job) {
  return job?.render?.videos?.[0] ?? job?.render?.combinedVideos?.[0] ?? job?.render?.videoUrl ?? null;
}

function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
