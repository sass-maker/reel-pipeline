import path from 'node:path';

export const POST_READY_SCHEMA = 'fleet.post-ready-video.v1';
export const POST_READY_RECEIPT_SCHEMA = 'fleet.post-ready-video-receipt.v1';

const NARRATIVE_ROLES = new Set(['setup', 'tension', 'analysis', 'proof', 'verdict', 'close']);
const MOTIONS = new Set(['slow-push', 'slow-pull', 'focus-pull', 'mask-reveal', 'parallax', 'match-cut']);
const TRANSITIONS = new Set(['cut', 'fade', 'wipe', 'beam-wipe', 'match-cut']);
const VISUAL_KINDS = new Set(['image', 'video']);

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value.trim();
}

function finiteNumber(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function normalizeApproval(input) {
  if (input?.status !== 'approved') throw new Error('approval.status must be approved');
  return {
    status: 'approved',
    approvedBy: requiredString(input.approvedBy, 'approval.approvedBy'),
    approvedAt: requiredString(input.approvedAt, 'approval.approvedAt'),
  };
}

function normalizeSource(input, label, { allowGenerated = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${label} source provenance is required`);
  }
  const sourceType = requiredString(input.sourceType, `${label}.sourceType`);
  const tier = requiredString(input.tier, `${label}.tier`);
  if (tier !== 'production-safe') throw new Error(`${label}.tier must be production-safe`);
  const source = requiredString(input.source, `${label}.source`);
  const license = requiredString(input.license, `${label}.license`);
  if (!allowGenerated && sourceType === 'generated-recipe') {
    throw new Error(`${label}.sourceType generated-recipe is not allowed`);
  }
  if (sourceType === 'real-capture' && !input.sourceRevision) {
    throw new Error(`${label}.sourceRevision is required for real-capture sources`);
  }
  if (input.evidence === true && sourceType.startsWith('generated')) {
    throw new Error(`${label} generated sources cannot be evidence`);
  }
  return {
    source,
    sourceType,
    sourceRevision: input.sourceRevision
      ? requiredString(input.sourceRevision, `${label}.sourceRevision`)
      : null,
    license,
    tier,
    evidence: input.evidence === true,
  };
}

function normalizeNarration(input) {
  if (!input || typeof input !== 'object') throw new Error('narration is required');
  const mode = requiredString(input.mode, 'narration.mode');
  if (mode === 'kokoro') {
    const voice = requiredString(input.voice, 'narration.voice');
    if (!/^[a-z]{2}_[a-z]+$/.test(voice)) throw new Error('narration.voice must be a Kokoro voice id');
    const speed = finiteNumber(input.speed ?? 1, 'narration.speed');
    if (speed < 0.75 || speed > 1.25) throw new Error('narration.speed must be between 0.75 and 1.25');
    return { mode, voice, speed, lang: input.lang ?? 'en-us' };
  }
  if (mode === 'file') return { mode, ...normalizeSource(input, 'narration') };
  throw new Error('narration.mode must be kokoro or file');
}

function normalizeMusic(input) {
  if (!input || typeof input !== 'object') throw new Error('music is required');
  const mode = requiredString(input.mode, 'music.mode');
  if (mode === 'generated') {
    return {
      mode,
      recipe: requiredString(input.recipe ?? 'fleet-arranged-bed@1', 'music.recipe'),
      mood: requiredString(input.mood, 'music.mood'),
    };
  }
  if (mode === 'file') return { mode, ...normalizeSource(input, 'music') };
  throw new Error('music.mode must be generated or file');
}

function normalizeVisual(input, index) {
  const label = `scenes[${index}].visual`;
  if (!input || typeof input !== 'object') throw new Error(`${label} is required`);
  const kind = requiredString(input.kind, `${label}.kind`);
  if (!VISUAL_KINDS.has(kind)) throw new Error(`${label}.kind must be image or video`);
  const motion = requiredString(input.motion, `${label}.motion`);
  if (!MOTIONS.has(motion)) throw new Error(`${label}.motion is not purposeful`);
  const normalized = {
    kind,
    motion,
    ...normalizeSource(input, label),
    focusX: finiteNumber(input.focusX ?? 0.5, `${label}.focusX`),
    focusY: finiteNumber(input.focusY ?? 0.5, `${label}.focusY`),
    fallback: null,
  };
  if (normalized.focusX < 0 || normalized.focusX > 1 || normalized.focusY < 0 || normalized.focusY > 1) {
    throw new Error(`${label} focus coordinates must be between 0 and 1`);
  }
  if (input.fallback) {
    normalized.fallback = {
      kind: 'image',
      motion: requiredString(input.fallback.motion ?? 'slow-push', `${label}.fallback.motion`),
      ...normalizeSource(input.fallback, `${label}.fallback`),
      focusX: finiteNumber(input.fallback.focusX ?? normalized.focusX, `${label}.fallback.focusX`),
      focusY: finiteNumber(input.fallback.focusY ?? normalized.focusY, `${label}.fallback.focusY`),
    };
    if (!MOTIONS.has(normalized.fallback.motion)) throw new Error(`${label}.fallback.motion is not purposeful`);
  }
  return normalized;
}

function normalizeScene(input, index, start) {
  const durationSeconds = finiteNumber(input?.durationSeconds, `scenes[${index}].durationSeconds`);
  if (durationSeconds < 2 || durationSeconds > 10) {
    throw new Error(`scenes[${index}].durationSeconds must be between 2 and 10`);
  }
  const role = requiredString(input.role, `scenes[${index}].role`);
  if (!NARRATIVE_ROLES.has(role)) throw new Error(`scenes[${index}].role is invalid`);
  const transition = requiredString(input.transition, `scenes[${index}].transition`);
  if (!TRANSITIONS.has(transition)) throw new Error(`scenes[${index}].transition is invalid`);
  const scene = {
    id: requiredString(input.id, `scenes[${index}].id`),
    role,
    purpose: requiredString(input.purpose, `scenes[${index}].purpose`),
    narration: requiredString(input.narration, `scenes[${index}].narration`),
    caption: requiredString(input.caption, `scenes[${index}].caption`),
    visual: normalizeVisual(input.visual, index),
    transition,
    durationSeconds,
    start,
    end: start + durationSeconds,
  };
  return scene;
}

export function normalizePostReadyBrief(input, { sourcePath = null } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('post-ready brief must be an object');
  }
  if (input.schema !== POST_READY_SCHEMA) throw new Error(`schema must be ${POST_READY_SCHEMA}`);
  const approval = normalizeApproval(input.approval);
  const hook = requiredString(input.hook, 'hook');
  const closingBeat = requiredString(input.closingBeat, 'closingBeat');
  const musicIntent = requiredString(input.musicIntent, 'musicIntent');
  const rawScenes = Array.isArray(input.scenes) ? input.scenes : [];
  if (rawScenes.length < 4) throw new Error('scenes must contain at least four editorial beats');
  let cursor = 0;
  const scenes = rawScenes.map((scene, index) => {
    const normalized = normalizeScene(scene, index, cursor);
    cursor = normalized.end;
    return normalized;
  });
  if (cursor < 20 || cursor > 35) throw new Error('total duration must be between 20 and 35 seconds');
  if (!scenes[0].narration.includes(hook) && !scenes[0].caption.includes(hook)) {
    throw new Error('the first scene must contain the hook');
  }
  const lastScene = scenes.at(-1);
  if (!lastScene.narration.includes(closingBeat) && !lastScene.caption.includes(closingBeat)) {
    throw new Error('the last scene must contain the closingBeat');
  }
  if (lastScene.role !== 'close') throw new Error('the last scene role must be close');
  const ids = new Set();
  for (const scene of scenes) {
    if (ids.has(scene.id)) throw new Error(`duplicate scene id: ${scene.id}`);
    ids.add(scene.id);
  }
  const format = {
    width: finiteNumber(input.format?.width ?? 1080, 'format.width'),
    height: finiteNumber(input.format?.height ?? 1920, 'format.height'),
    fps: finiteNumber(input.format?.fps ?? 30, 'format.fps'),
  };
  if (format.width !== 1080 || format.height !== 1920 || format.fps !== 30) {
    throw new Error('post-ready format must be 1080x1920 at 30 fps');
  }
  return {
    schema: POST_READY_SCHEMA,
    id: requiredString(input.id, 'id'),
    title: requiredString(input.title, 'title'),
    hook,
    closingBeat,
    musicIntent,
    approval,
    format,
    style: input.style && typeof input.style === 'object' ? structuredClone(input.style) : {},
    narration: normalizeNarration(input.narration),
    music: normalizeMusic(input.music),
    scenes,
    totalDurationSeconds: cursor,
    sourcePath: sourcePath ? path.resolve(sourcePath) : null,
  };
}

function visualPrimitive(motion, kind) {
  if (kind === 'video' || motion === 'match-cut') return 'match-cut';
  if (motion === 'focus-pull') return 'focus-pull';
  if (motion === 'mask-reveal') return 'mask-zoom';
  if (motion === 'parallax') return 'parallax-depth';
  return 'full-bleed-product-capture';
}

export function buildCoherentFilmFromPlan(planInput, resolvedVisuals) {
  const plan = planInput.schema === POST_READY_SCHEMA && planInput.totalDurationSeconds
    ? planInput
    : normalizePostReadyBrief(planInput);
  const visuals = new Map(resolvedVisuals.map((entry) => [entry.sceneId, entry]));
  const assets = [];
  const scenes = plan.scenes.map((scene) => {
    const resolved = visuals.get(scene.id);
    if (!resolved) throw new Error(`resolved visual is missing for scene ${scene.id}`);
    const assetId = `visual-${scene.id}`;
    assets.push({
      id: assetId,
      kind: resolved.kind,
      source: resolved.source,
      sourceType: resolved.sourceType,
      sourceRevision: resolved.sourceRevision,
      license: resolved.license,
      tier: resolved.tier,
      evidence: resolved.evidence,
    });
    return {
      id: scene.id,
      role: scene.role,
      purpose: scene.purpose,
      start: scene.start,
      end: scene.end,
      dominant: {
        kind: visualPrimitive(resolved.motion, resolved.kind),
        assetId,
        params: {
          focusX: resolved.focusX,
          focusY: resolved.focusY,
          push: resolved.motion === 'slow-pull' ? -0.035 : 0.035,
          clipStartSeconds: resolved.clipStartSeconds ?? 0,
        },
      },
      supporting: [],
      principalAction: `${resolved.motion} supports ${scene.purpose}`,
      cameraMove: resolved.motion,
      transition: scene.transition,
      spokenLine: scene.narration,
      caption: scene.caption,
    };
  });
  return {
    schema: 'fleet.coherent-scene-film.v1',
    id: plan.id,
    title: plan.title,
    spine: `${plan.hook} ${plan.closingBeat}`,
    directionId: 'post-ready-editorial',
    publicationTier: 'publishable',
    format: plan.format,
    style: plan.style,
    assets,
    scenes,
    captions: plan.scenes.map((scene) => ({
      start: scene.start + 0.12,
      end: scene.end - 0.12,
      text: scene.caption,
      burn: true,
      position: 'bottom',
    })),
    audio: { narration: null, soundBed: null, effects: [] },
    approval: plan.approval,
  };
}

export function normalizeEditorialReview(input) {
  if (input == null) return { status: 'pending', reviewedBy: null, reviewedAt: null, categories: {}, issues: [] };
  if (!['approved', 'rejected'].includes(input.status)) throw new Error('review.status must be approved or rejected');
  const categories = Object.fromEntries(['voice', 'music', 'animation', 'captions', 'pacing', 'transitions'].map((name) => {
    const value = input.categories?.[name];
    if (!['approved', 'needs-work'].includes(value)) throw new Error(`review.categories.${name} is required`);
    return [name, value];
  }));
  const issues = (Array.isArray(input.issues) ? input.issues : []).map((issue, index) => ({
    severity: requiredString(issue.severity, `review.issues[${index}].severity`),
    note: requiredString(issue.note, `review.issues[${index}].note`),
  }));
  if (input.status === 'approved' && (issues.some((issue) => issue.severity === 'critical') || Object.values(categories).includes('needs-work'))) {
    throw new Error('approved review cannot contain critical issues or needs-work categories');
  }
  return {
    status: input.status,
    reviewedBy: requiredString(input.reviewedBy, 'review.reviewedBy'),
    reviewedAt: requiredString(input.reviewedAt, 'review.reviewedAt'),
    categories,
    issues,
  };
}

export function createProductionReceipt({ plan, runId, startedAt }) {
  return {
    schema: POST_READY_RECEIPT_SCHEMA,
    runId,
    briefId: plan.id,
    startedAt,
    completedAt: null,
    status: 'running',
    technicalStatus: 'pending',
    editorialStatus: 'pending',
    postReady: false,
    stages: {},
    blockers: [],
    engines: {},
    sources: {},
    audio: {},
    outputs: {},
    review: {},
  };
}

export function finalizeProductionReceipt(receipt, { technicalReview, editorialReview, completedAt }) {
  const technicalPassed = technicalReview?.status === 'passed';
  const editorialApproved = editorialReview?.status === 'approved';
  const hasCriticalIssue = editorialReview?.issues?.some((issue) => issue.severity === 'critical') === true;
  return {
    ...receipt,
    completedAt,
    status: technicalPassed ? 'completed' : 'failed',
    technicalStatus: technicalPassed ? 'passed' : 'failed',
    editorialStatus: editorialReview?.status ?? 'pending',
    postReady: technicalPassed && editorialApproved && !hasCriticalIssue,
    review: { technical: technicalReview, editorial: editorialReview },
  };
}
