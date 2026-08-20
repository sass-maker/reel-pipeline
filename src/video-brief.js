const CHANNELS = new Set([
  'tiktok',
  'instagram_reels',
  'youtube_shorts',
  'blog',
  'email',
  'producthunt',
  'x',
  'reddit',
  'other',
]);

const REEL_CHANNELS = new Set(['tiktok', 'instagram_reels', 'youtube_shorts']);

const PROOF_TYPES = new Set([
  'screenshot',
  'recording',
  'changelog',
  'before_after',
  'product_artifact',
  'cockpit',
  'generated_card',
]);

export function isReelChannel(channel) {
  return REEL_CHANNELS.has(channel);
}

export function normalizeVideoBrief(input) {
  const brief = {
    id: stringOrThrow(input.id, 'id'),
    projectSlug: stringOrThrow(input.projectSlug ?? input.project_slug, 'projectSlug'),
    taskId: optionalString(input.taskId ?? input.task_id),
    marketingPostId: optionalString(input.marketingPostId ?? input.marketing_post_id),
    channel: normalizeChannel(input.channel),
    title: stringOrThrow(input.title, 'title'),
    summary: optionalString(input.summary),
    hook: stringOrThrow(input.hook, 'hook'),
    body: stringOrThrow(input.body, 'body'),
    cta: optionalString(input.cta),
    audience: optionalString(input.audience),
    productUrl: optionalString(input.productUrl ?? input.product_url),
    proofUrl: optionalString(input.proofUrl ?? input.proof_url),
    targetRoute: optionalString(input.targetRoute ?? input.target_route),
    recordingUrl: optionalString(input.recordingUrl ?? input.recording_url),
    changelogEntryId: optionalString(input.changelogEntryId ?? input.changelog_entry_id),
    brandTone: optionalString(input.brandTone ?? input.brand_tone),
    creativeDirection: optionalString(input.creativeDirection ?? input.creative_direction),
    proofType: normalizeProofType(input.proofType ?? input.proof_type),
    template: optionalString(input.template),
    screenshots: normalizeScreenshots(input.screenshots),
    demoSteps: normalizeDemoSteps(input.demoSteps ?? input.demo_steps),
    literalScenes: normalizeLiteralScenes(input.literalScenes ?? input.literal_scenes),
    renderOptions: normalizeRenderOptions(input.renderOptions ?? input.render_options),
    renderMode: normalizeRenderMode(input.renderMode ?? input.render_mode),
    durationSeconds: normalizeDuration(input.durationSeconds ?? input.duration_seconds),
    themePackId: optionalString(input.themePackId ?? input.theme_pack_id) ?? 'auto',
    modelProfileId: optionalString(input.modelProfileId ?? input.model_profile_id) ?? 'auto',
    modelPriorities: normalizeModelPriorities(input.modelPriorities ?? input.model_priorities),
    contentScope: normalizeContentScope(input.contentScope ?? input.content_scope),
    themeRightsEvidence: optionalString(input.themeRightsEvidence ?? input.theme_rights_evidence),
    cast: normalizeCast(input.cast),
    soundtrack: normalizeSoundtrack(input.soundtrack),
    matureAssertions: normalizeMatureAssertions(input.matureAssertions ?? input.mature_assertions),
  };

  if (isReelChannel(brief.channel) && !looksLikeVideoBrief(brief.body)) {
    throw new Error('reel channel body must include script, shot list, captions, and asset prompts');
  }

  return brief;
}

function normalizeProofType(value) {
  const proof = optionalString(value);
  if (!proof) return undefined;
  if (!PROOF_TYPES.has(proof)) throw new Error(`unsupported proofType: ${proof}`);
  return proof;
}

function normalizeScreenshots(value) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error('screenshots must be an array');
  const list = value
    .map((entry) => optionalString(entry))
    .filter(Boolean);
  return list.length ? list : undefined;
}

function normalizeDemoSteps(value) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error('demoSteps must be an array');
  const steps = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const action = optionalString(entry.action) ?? optionalString(entry.type);
    if (!action) continue;
    const step = { action };
    const route = optionalString(entry.route ?? entry.path ?? entry.url);
    if (route) step.route = route;
    const selector = optionalString(entry.selector);
    if (selector) step.selector = selector;
    const value = optionalString(entry.value ?? entry.text);
    if (value) step.value = value;
    const caption = optionalString(entry.caption);
    if (caption) step.caption = caption;
    const waitMs = Number.isFinite(Number(entry.waitMs ?? entry.wait_ms))
      ? Math.max(0, Math.min(10_000, Number(entry.waitMs ?? entry.wait_ms)))
      : undefined;
    if (waitMs !== undefined) step.waitMs = waitMs;
    steps.push(step);
  }
  return steps.length ? steps : undefined;
}

function normalizeLiteralScenes(value) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error('literalScenes must be an array');
  return value.slice(0, 60).map((scene, index) => ({
    id: optionalString(scene?.id) ?? `scene-${index + 1}`,
    lyric: optionalString(scene?.lyric) ?? '',
    objects: Array.isArray(scene?.objects) ? scene.objects.map(optionalString).filter(Boolean).slice(0, 8) : ['subject'],
    camera: optionalString(scene?.camera),
    palette: optionalString(scene?.palette),
    visualStyle: optionalString(scene?.visualStyle ?? scene?.visual_style),
  }));
}

function normalizeRenderOptions(value) {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('renderOptions must be an object');
  const entries = Object.entries(value).slice(0, 20).map(([key, candidate]) => {
    if (!/^[a-z][a-zA-Z0-9]{0,39}$/.test(key)) throw new Error(`unsupported render option key: ${key}`);
    if (typeof candidate === 'boolean') return [key, candidate];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return [key, candidate];
    if (typeof candidate === 'string') return [key, candidate.trim().slice(0, 160)];
    throw new Error(`render option ${key} must be a string, number, or boolean`);
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function normalizeCast(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('cast must be an array');
  return value.slice(0, 24).map(normalizeCastInstance);
}

function normalizeMatureAssertions(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('matureAssertions must be an array');
  return value.slice(0, 24).map((entry, index) => ({
    characterId: stringOrThrow(entry?.characterId, `matureAssertions[${index}].characterId`),
    revision: Number(entry?.revision),
    fictional: entry?.fictional === true,
    age: Number(entry?.age),
    consent: entry?.consent === 'affirmative' ? 'affirmative' : 'unknown',
    realPersonLikeness: entry?.realPersonLikeness === true,
  }));
}

export function briefFromMarketingPost(post) {
  return normalizeVideoBrief({
    id: `brief_${post.id}`,
    projectSlug: post.project_slug,
    taskId: post.task_id,
    marketingPostId: post.id,
    channel: post.channel,
    title: post.title,
    hook: post.hook ?? post.title,
    body: post.body,
    cta: post.cta,
    renderMode: 'html-composition',
  });
}

function looksLikeVideoBrief(body) {
  const text = body.toLowerCase();
  return (
    text.includes('script') &&
    (text.includes('shot') || text.includes('scene')) &&
    text.includes('caption') &&
    (text.includes('asset') || text.includes('visual'))
  );
}

function normalizeChannel(channel) {
  const value = stringOrThrow(channel, 'channel');
  if (!CHANNELS.has(value)) throw new Error(`unsupported channel: ${value}`);
  return value;
}

function normalizeRenderMode(mode) {
  const value = optionalString(mode) ?? 'html-composition';
  if (![
    'mock',
    'grok',
    'grok-video',
    'grok-videos',
    'ascii',
    'ascii-animation',
    'ascii-fable',
    'askai',
    'html',
    'html-composition',
    'web-composition',
    'night-out-carousel',
    'kokoro',
    'kokoro-compose',
    'brand-video',
    'blender',
  ].includes(value)) {
    throw new Error(`unsupported renderMode: ${value}`);
  }
  return value;
}

function normalizeDuration(value) {
  const duration = Number(value ?? 20);
  if (!Number.isFinite(duration) || duration < 5 || duration > 90) {
    throw new Error('durationSeconds must be between 5 and 90');
  }
  return duration;
}

function normalizeModelPriorities(input) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    speed: priority(value.speed ?? 3),
    quality: priority(value.quality ?? 3),
    nativeAudio: priority(value.nativeAudio ?? 1),
  };
}

function priority(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : 3;
}

function normalizeContentScope(value) {
  return value === 'mature-enabled' ? value : 'general';
}

function stringOrThrow(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
import { normalizeCastInstance } from './studio/character-directory.js';
import { normalizeSoundtrack } from './studio/soundtrack.js';
