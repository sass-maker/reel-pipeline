import {
  ASSET_TIERS,
  NARRATIVE_ROLES,
  normalizeCoherentFilm,
  normalizeFilmSkillReference,
} from './coherent-scene-composition.js';

export const FILM_SKILL_SCHEMA = 'fleet.film-skill.v1';

const EVIDENCE_BEAM_V1 = {
  schema: FILM_SKILL_SCHEMA,
  id: 'evidence-beam',
  version: 1,
  title: 'Evidence beam',
  description: 'Turn uncertainty into one qualified verdict through a continuous evidence path.',
  narrative: {
    spine: 'Uncertain output is isolated, connected to real evidence, and resolved into one qualified verdict.',
    roleSequence: ['setup', 'tension', 'analysis', 'analysis', 'verdict', 'close'],
  },
  assetRequirements: [
    {
      id: 'product-evidence',
      required: true,
      minimum: 1,
      kinds: ['image', 'video'],
      sourceTypes: ['real-capture'],
      tiers: ['production-safe'],
      evidence: true,
    },
    {
      id: 'brand-close',
      required: true,
      minimum: 1,
      kinds: ['image'],
      sourceTypes: ['fleet-authored-graphic'],
      tiers: ['production-safe'],
      evidence: false,
    },
    {
      id: 'generated-atmosphere',
      required: false,
      minimum: 0,
      kinds: ['image', 'video'],
      sourceTypes: ['generated-atmosphere'],
      tiers: ['production-safe', 'proof-only'],
      evidence: false,
    },
    {
      id: 'voice-track',
      required: true,
      minimum: 1,
      kinds: ['audio'],
      sourceTypes: ['local-synthesis', 'operator-recording'],
      tiers: ['production-safe', 'proof-only'],
      evidence: false,
    },
    {
      id: 'supporting-audio',
      required: false,
      minimum: 0,
      kinds: ['audio'],
      sourceTypes: ['procedural-audio'],
      tiers: ['production-safe', 'proof-only'],
      evidence: false,
    },
  ],
  scenePrimitives: [
    'full-bleed-product-capture',
    'mask-zoom',
    'focus-pull',
    'evidence-path',
  ],
  defaults: {
    visual: {
      dominantSubjectsPerScene: 1,
      supportingLayersPerScene: 1,
      palette: 'single restrained dark palette with one evidence accent',
      typography: 'mobile-readable editorial sans',
    },
    motion: {
      principalActionsPerScene: 1,
      cameraMovesPerScene: 1,
      pace: 'controlled',
      continuity: 'one continuous evidence path',
    },
    captions: {
      style: 'phrase-timed',
      maximumLines: 2,
      safeArea: 'vertical-mobile',
    },
    voice: {
      delivery: 'measured, confident, non-presenter narration',
      lipSyncRequired: false,
    },
    audio: {
      narrationLed: true,
      duckSoundBedDb: 8,
      effects: 'only at evidence transitions and verdict resolution',
    },
  },
  qualityGates: [
    {
      id: 'single-story',
      description: 'Every scene advances the same uncertainty-to-verdict story.',
    },
    {
      id: 'real-evidence',
      description: 'Every visible product claim is supported by a revisioned real capture.',
    },
    {
      id: 'mobile-legibility',
      description: 'Captions and the dominant evidence remain readable at phone size.',
    },
    {
      id: 'publication-rights',
      description: 'Every bound asset is allowed by the requested publication tier.',
    },
  ],
  reference: {
    manifest: 'examples/coherent-films/codevetter-evidence-beam.json',
    frames: [
      {
        path: 'assets/coherent-films/codevetter-evidence-close.svg',
        purpose: 'tracked evidence-path closing frame',
      },
    ],
  },
  knownFailureModes: [
    {
      symptom: 'The film becomes a capability montage.',
      response: 'Remove techniques that do not advance the evidence path.',
    },
    {
      symptom: 'Generated interface detail is treated as proof.',
      response: 'Return to a revisioned real product capture before the claim.',
    },
    {
      symptom: 'The evidence path competes with the product.',
      response: 'Reduce the path to one supporting layer and one principal action.',
    },
  ],
  notWhen: [
    'The story has no evidence-backed verdict.',
    'The primary subject must be a synchronized talking presenter.',
    'The operator needs freeform timeline editing.',
  ],
};

const GUIDED_APP_DEMO_V1 = {
  schema: FILM_SKILL_SCHEMA,
  id: 'guided-app-demo',
  version: 1,
  title: 'Guided app demo',
  description: 'Record a real application with an optional same-session presenter anchored at bottom right.',
  narrative: {
    spine: 'A presenter guides one focused journey through a real application and ends on a verified outcome.',
    roleSequence: ['setup', 'analysis', 'analysis', 'proof', 'verdict', 'close'],
  },
  assetRequirements: [
    {
      id: 'product-evidence',
      required: true,
      minimum: 1,
      kinds: ['video'],
      sourceTypes: ['real-capture'],
      tiers: ['production-safe'],
      evidence: true,
    },
    {
      id: 'same-session-presenter',
      required: false,
      minimum: 0,
      kinds: ['video'],
      sourceTypes: ['operator-recording'],
      tiers: ['production-safe'],
      evidence: false,
    },
    {
      id: 'brand-close',
      required: false,
      minimum: 0,
      kinds: ['image'],
      sourceTypes: ['fleet-authored-graphic'],
      tiers: ['production-safe'],
      evidence: false,
    },
    {
      id: 'supporting-audio',
      required: false,
      minimum: 0,
      kinds: ['audio'],
      sourceTypes: ['procedural-audio', 'operator-recording'],
      tiers: ['production-safe'],
      evidence: false,
    },
  ],
  scenePrimitives: [
    'full-bleed-product-capture',
    'presenter-pip',
    'focus-pull',
    'mask-zoom',
  ],
  defaults: {
    visual: {
      dominantSubjectsPerScene: 1,
      supportingLayersPerScene: 1,
      appCapture: 'real application remains the dominant full-frame subject',
      presenter: {
        position: 'bottom-right',
        widthFraction: 0.24,
        safeMarginFraction: 0.06,
        shape: 'rounded-rectangle',
      },
      typography: 'mobile-readable editorial sans',
    },
    motion: {
      principalActionsPerScene: 1,
      cameraMovesPerScene: 1,
      pace: 'operator-led',
      continuity: 'preserve the captured app journey',
    },
    captions: {
      style: 'phrase-timed',
      maximumLines: 2,
      safeArea: 'avoid bottom-right presenter',
    },
    voice: {
      delivery: 'natural product walkthrough',
      lipSyncRequired: true,
      acceptedSync: ['same-session', 'timestamped-receipt'],
    },
    audio: {
      narrationLed: true,
      appAudioGainDb: -12,
      duckAppAudioDb: 8,
      loudnessTargetLufs: -16,
    },
  },
  qualityGates: [
    {
      id: 'real-app-capture',
      description: 'The application shown is an approved revisioned real capture.',
    },
    {
      id: 'authentic-presenter-sync',
      description: 'Any visible speaking presenter was recorded in the same session or has a timestamped sync receipt.',
    },
    {
      id: 'presenter-safe-area',
      description: 'The bottom-right presenter does not obscure the demonstrated action or captions.',
    },
    {
      id: 'mobile-legibility',
      description: 'The demonstrated action and captions remain readable at phone size.',
    },
    {
      id: 'publication-rights',
      description: 'The app and presenter capture have explicit production-safe rights approval.',
    },
  ],
  reference: {
    manifest: 'examples/coherent-films/guided-app-demo.template.json',
    frames: [
      {
        path: 'artifacts/design/after-1440.png',
        purpose: 'operator workflow and bottom-right presenter contract',
      },
    ],
  },
  knownFailureModes: [
    {
      symptom: 'The presenter covers the interaction being explained.',
      response: 'Retake with the demonstrated action outside the bottom-right safe area.',
    },
    {
      symptom: 'The mouth and voice do not align.',
      response: 'Use the same-session camera and microphone capture or provide a timestamped sync receipt.',
    },
    {
      symptom: 'The app becomes unreadable after portrait cropping.',
      response: 'Record a tighter app window or move the action into the portrait-safe capture region.',
    },
  ],
  notWhen: [
    'The application cannot be captured with explicit operator permission.',
    'The presenter source has unrelated or generated mouth motion.',
    'The demonstrated action must occupy the bottom-right safe area.',
  ],
};

const RAW_SKILLS = [EVIDENCE_BEAM_V1, GUIDED_APP_DEMO_V1];
const FILM_SKILL_REGISTRY = new Map(
  RAW_SKILLS.map((skill) => {
    const normalized = normalizeFilmSkill(skill);
    return [normalized.ref, normalized];
  }),
);

export function normalizeFilmSkill(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('film skill must be an object');
  }
  if (input.schema !== FILM_SKILL_SCHEMA) {
    throw new Error(`film skill schema must be ${FILM_SKILL_SCHEMA}`);
  }

  const identity = normalizeFilmSkillReference(input, 'filmSkill');
  const roleSequence = requiredArray(input.narrative?.roleSequence, 'filmSkill.narrative.roleSequence')
    .map((role, index) => {
      const normalized = requiredString(role, `filmSkill.narrative.roleSequence[${index}]`);
      if (!NARRATIVE_ROLES.has(normalized)) {
        throw new Error(`filmSkill.narrative.roleSequence[${index}] has unsupported role ${normalized}`);
      }
      return normalized;
    });

  const requirements = requiredArray(input.assetRequirements, 'filmSkill.assetRequirements')
    .map(normalizeAssetRequirement);
  assertUnique(requirements.map((requirement) => requirement.id), 'film skill asset requirement');

  const scenePrimitives = requiredArray(input.scenePrimitives, 'filmSkill.scenePrimitives')
    .map((primitive, index) => requiredString(
      primitive,
      `filmSkill.scenePrimitives[${index}]`,
    ));
  assertUnique(scenePrimitives, 'film skill scene primitive');

  const defaults = requiredObject(input.defaults, 'filmSkill.defaults');
  for (const section of ['visual', 'motion', 'captions', 'voice', 'audio']) {
    requiredObject(defaults[section], `filmSkill.defaults.${section}`);
  }

  const qualityGates = requiredArray(input.qualityGates, 'filmSkill.qualityGates')
    .map((gate, index) => ({
      id: requiredString(gate?.id, `filmSkill.qualityGates[${index}].id`),
      description: requiredString(
        gate?.description,
        `filmSkill.qualityGates[${index}].description`,
      ),
    }));
  assertUnique(qualityGates.map((gate) => gate.id), 'film skill quality gate');

  const reference = requiredObject(input.reference, 'filmSkill.reference');
  const frames = requiredArray(reference.frames, 'filmSkill.reference.frames')
    .map((frame, index) => ({
      path: requiredString(frame?.path, `filmSkill.reference.frames[${index}].path`),
      purpose: requiredString(
        frame?.purpose,
        `filmSkill.reference.frames[${index}].purpose`,
      ),
    }));

  const knownFailureModes = requiredArray(
    input.knownFailureModes,
    'filmSkill.knownFailureModes',
  ).map((failure, index) => ({
    symptom: requiredString(
      failure?.symptom,
      `filmSkill.knownFailureModes[${index}].symptom`,
    ),
    response: requiredString(
      failure?.response,
      `filmSkill.knownFailureModes[${index}].response`,
    ),
  }));
  const notWhen = requiredArray(input.notWhen, 'filmSkill.notWhen')
    .map((condition, index) => requiredString(condition, `filmSkill.notWhen[${index}]`));

  return {
    schema: FILM_SKILL_SCHEMA,
    ...identity,
    title: requiredString(input.title, 'filmSkill.title'),
    description: requiredString(input.description, 'filmSkill.description'),
    narrative: {
      spine: requiredString(input.narrative?.spine, 'filmSkill.narrative.spine'),
      roleSequence,
    },
    assetRequirements: requirements,
    scenePrimitives,
    defaults: structuredClone(defaults),
    qualityGates,
    reference: {
      manifest: requiredString(reference.manifest, 'filmSkill.reference.manifest'),
      frames,
    },
    knownFailureModes,
    notWhen,
  };
}

export function listFilmSkills() {
  return [...FILM_SKILL_REGISTRY.values()].map((skill) => structuredClone(skill));
}

export function resolveFilmSkill(reference) {
  const parsed = parseFilmSkillReference(reference);
  const skill = FILM_SKILL_REGISTRY.get(parsed.ref);
  if (!skill) throw new Error(`unknown film skill version: ${parsed.ref}`);
  return structuredClone(skill);
}

export function filmSkillExecutionContract(reference) {
  const skill = resolveFilmSkill(reference);
  return {
    schema: 'fleet.film-skill-execution.v1',
    ref: skill.ref,
    narrative: skill.narrative,
    assetRequirements: skill.assetRequirements,
    scenePrimitives: skill.scenePrimitives,
    defaults: skill.defaults,
    qualityGates: skill.qualityGates,
    knownFailureModes: skill.knownFailureModes,
  };
}

export function assertForgeJobFilmSkill(job, options = {}) {
  if (!job?.filmSkill?.ref) {
    throw new Error('forge job must pin an exact film skill version');
  }
  const expected = filmSkillExecutionContract(job.filmSkill.ref);
  if (stableJson(job.filmSkill.contract) !== stableJson(expected)) {
    throw new Error(`forge job film skill contract drifted from ${job.filmSkill.ref}`);
  }
  if (!requiredText(job.brief?.prompt) || !requiredText(job.brief?.context)) {
    throw new Error(`forge job ${job.filmSkill.ref} requires prompt and context`);
  }
  if (job.project?.aspectRatio !== '9:16') {
    throw new Error(`forge job ${job.filmSkill.ref} requires a 9:16 mobile composition`);
  }
  if (expected.ref === 'guided-app-demo@1') {
    return assertGuidedAppDemoJob(job, expected, options);
  }
  if (job.shot?.keyframeApproved !== true) {
    throw new Error(`forge job ${job.filmSkill.ref} requires an approved keyframe`);
  }

  const provenance = job.keyframe?.provenance;
  const productEvidence = expected.assetRequirements.find(
    (requirement) => requirement.id === 'product-evidence',
  );
  if (
    !productEvidence
    || !productEvidence.sourceTypes.includes(provenance?.sourceType)
    || !productEvidence.tiers.includes(provenance?.rights?.tier)
    || provenance?.rights?.approved !== true
    || !requiredText(provenance?.sourceRevision)
  ) {
    throw new Error(
      `forge job ${job.filmSkill.ref} fails the real-evidence and publication-rights quality gates`,
    );
  }

  const previewSeeds = job.shot?.preview?.seeds;
  if (
    !Array.isArray(previewSeeds)
    || previewSeeds.length !== 3
    || new Set(previewSeeds.map(Number)).size !== 3
    || previewSeeds.some((seed) => !Number.isInteger(Number(seed)))
  ) {
    throw new Error(`forge job ${job.filmSkill.ref} requires three distinct preview seeds`);
  }

  const renderKind = options.renderKind ?? 'preview';
  if (renderKind === 'final') {
    const selectedSeed = job.finalRender?.seed;
    if (
      !job.review?.selection?.variantId
      || !Number.isInteger(Number(selectedSeed))
      || Number(selectedSeed) !== Number(job.review.selection.seed)
    ) {
      throw new Error(`forge job ${job.filmSkill.ref} final render must use the accepted preview seed`);
    }
    if (
      !requiredText(job.keyframe?.sha256)
      || job.review.selection.sourceSha256 !== job.keyframe.sha256
      || job.finalRender?.sourceSha256 !== job.keyframe.sha256
    ) {
      throw new Error(`forge job ${job.filmSkill.ref} final render must preserve the approved keyframe hash`);
    }
  } else if (renderKind !== 'preview') {
    throw new Error(`unsupported forge render kind: ${renderKind}`);
  }

  return {
    ref: expected.ref,
    renderKind,
    preset: renderKind === 'final' ? 'final' : job.shot.preview.preset,
    seeds: renderKind === 'final' ? [Number(job.finalRender.seed)] : previewSeeds.map(Number),
    qualityGateIds: expected.qualityGates.map((gate) => gate.id),
  };
}

export function prepareFilmSkillForgeExecution(job, options = {}) {
  if (job?.filmSkill?.ref === 'guided-app-demo@1') {
    throw new Error('guided-app-demo@1 uses the approved capture encoder, not image-to-video execution');
  }
  const execution = assertForgeJobFilmSkill(job, options);
  const keyframePath = requiredText(options.keyframePath)
    ? options.keyframePath.trim()
    : job.shot?.keyframe;
  if (!requiredText(keyframePath)) {
    throw new Error(`forge job ${job.filmSkill.ref} requires a keyframe path for execution`);
  }
  return {
    execution,
    shot: {
      ...job.shot,
      keyframePath,
      keyframe: keyframePath,
      keyframeApproved: true,
      preview: {
        ...job.shot.preview,
        preset: execution.preset,
        seeds: execution.seeds,
      },
    },
  };
}

function assertGuidedAppDemoJob(job, expected, options) {
  const capture = job.sourceCapture;
  if (
    capture?.approval?.approved !== true
    || capture?.provenance?.sourceType !== 'real-capture'
    || capture?.provenance?.rights?.approved !== true
    || capture?.provenance?.rights?.tier !== 'production-safe'
    || !requiredText(capture?.provenance?.sourceRevision)
    || !requiredText(capture?.sha256)
    || !requiredText(capture?.assetKey)
  ) {
    throw new Error(
      `forge job ${expected.ref} fails the real-app-capture and publication-rights quality gates`,
    );
  }
  if (
    capture.presenter?.mode === 'same-session'
    && capture.presenter?.sync !== 'same-session'
  ) {
    throw new Error(`forge job ${expected.ref} fails the authentic-presenter-sync quality gate`);
  }
  if (!['none', 'same-session'].includes(capture.presenter?.mode)) {
    throw new Error(`forge job ${expected.ref} has an unsupported presenter mode`);
  }

  const renderKind = options.renderKind ?? 'preview';
  if (!['preview', 'final'].includes(renderKind)) {
    throw new Error(`unsupported forge render kind: ${renderKind}`);
  }
  if (renderKind === 'final') {
    if (!job.review?.selection?.variantId) {
      throw new Error(`forge job ${expected.ref} final render requires an accepted preview`);
    }
    if (
      job.finalRender?.sourceSha256 !== capture.sha256
      || job.review.selection.sourceSha256 !== capture.sha256
    ) {
      throw new Error(`forge job ${expected.ref} final render must preserve the accepted source hash`);
    }
  }
  return {
    ref: expected.ref,
    renderKind,
    preset: renderKind === 'final' ? 'guided-final' : 'guided-preview',
    seeds: [],
    sourceSha256: capture.sha256,
    qualityGateIds: expected.qualityGates.map((gate) => gate.id),
  };
}

export function bindFilmManifestToSkill(manifestInput, reference = manifestInput?.filmSkill) {
  const requested = parseFilmSkillReference(reference);
  if (manifestInput?.filmSkill) {
    const declared = parseFilmSkillReference(manifestInput.filmSkill);
    if (declared.ref !== requested.ref) {
      throw new Error(
        `manifest pins ${declared.ref} but binding requested ${requested.ref}`,
      );
    }
  }

  const skill = resolveFilmSkill(requested);
  const film = normalizeCoherentFilm({
    ...manifestInput,
    filmSkill: { id: skill.id, version: skill.version },
  });
  validateRoleSequence(film, skill);
  validateScenePrimitives(film, skill);
  validateAssetRequirements(film, skill);
  return film;
}

function parseFilmSkillReference(input) {
  if (typeof input === 'string') {
    const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)@([1-9]\d*)$/.exec(input);
    if (!match) {
      throw new Error('film skill reference must pin an exact version like evidence-beam@1');
    }
    return normalizeFilmSkillReference({ id: match[1], version: Number(match[2]) });
  }
  return normalizeFilmSkillReference(input);
}

function stableJson(value) {
  return JSON.stringify(sortObject(value));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortObject(value[key])]),
  );
}

function requiredText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validateRoleSequence(film, skill) {
  const actual = film.scenes.map((scene) => scene.role);
  const expected = skill.narrative.roleSequence;
  if (actual.length !== expected.length || actual.some((role, index) => role !== expected[index])) {
    throw new Error(
      `film skill ${skill.ref} requires role sequence ${expected.join(' > ')}; received ${actual.join(' > ')}`,
    );
  }
}

function validateScenePrimitives(film, skill) {
  const allowed = new Set(skill.scenePrimitives);
  for (const scene of film.scenes) {
    for (const binding of [scene.dominant, ...scene.supporting]) {
      if (!allowed.has(binding.kind)) {
        throw new Error(
          `film skill ${skill.ref} does not allow scene primitive ${binding.kind}`,
        );
      }
    }
  }
}

function validateAssetRequirements(film, skill) {
  for (const requirement of skill.assetRequirements) {
    const matches = film.assets.filter((asset) => assetMatchesRequirement(asset, requirement));
    if (requirement.required && matches.length < requirement.minimum) {
      throw new Error(
        `film skill ${skill.ref} requires at least ${requirement.minimum} ${requirement.id} asset`,
      );
    }
  }
  for (const asset of film.assets) {
    if (!skill.assetRequirements.some((requirement) => (
      assetMatchesRequirement(asset, requirement)
    ))) {
      throw new Error(
        `film skill ${skill.ref} does not permit asset ${asset.id} (${asset.kind}/${asset.sourceType}/${asset.tier})`,
      );
    }
  }
}

function assetMatchesRequirement(asset, requirement) {
  return (
    requirement.kinds.includes(asset.kind)
    && requirement.sourceTypes.includes(asset.sourceType)
    && requirement.tiers.includes(asset.tier)
    && (requirement.evidence === null || asset.evidence === requirement.evidence)
  );
}

function normalizeAssetRequirement(input, index) {
  const id = requiredString(input?.id, `filmSkill.assetRequirements[${index}].id`);
  const required = input?.required === true;
  const minimum = input?.minimum ?? (required ? 1 : 0);
  if (!Number.isInteger(minimum) || minimum < 0 || (required && minimum < 1)) {
    throw new Error(`filmSkill.assetRequirements[${index}].minimum is invalid`);
  }
  const tiers = requiredArray(
    input?.tiers,
    `filmSkill.assetRequirements[${index}].tiers`,
  ).map((tier, tierIndex) => {
    const normalized = requiredString(
      tier,
      `filmSkill.assetRequirements[${index}].tiers[${tierIndex}]`,
    );
    if (!ASSET_TIERS.has(normalized)) {
      throw new Error(`filmSkill.assetRequirements[${index}] has unsupported tier ${normalized}`);
    }
    return normalized;
  });
  return {
    id,
    required,
    minimum,
    kinds: requiredArray(
      input?.kinds,
      `filmSkill.assetRequirements[${index}].kinds`,
    ).map((kind, kindIndex) => requiredString(
      kind,
      `filmSkill.assetRequirements[${index}].kinds[${kindIndex}]`,
    )),
    sourceTypes: requiredArray(
      input?.sourceTypes,
      `filmSkill.assetRequirements[${index}].sourceTypes`,
    ).map((sourceType, sourceIndex) => requiredString(
      sourceType,
      `filmSkill.assetRequirements[${index}].sourceTypes[${sourceIndex}]`,
    )),
    tiers,
    evidence: typeof input?.evidence === 'boolean' ? input.evidence : null,
  };
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function requiredArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  return value;
}

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Error(`duplicate ${label}`);
  }
}
