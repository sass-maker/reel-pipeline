import { generativeMediaBlocker } from './generation-policy.js';

export const SOUNDTRACK_SCHEMA = 'fleet.reel-soundtrack.v1';
export const SOUNDTRACK_LANES = Object.freeze(['owned-local', 'platform-sound', 'generated', 'procedural-draft']);

const LANE_SET = new Set(SOUNDTRACK_LANES);
const PLATFORM_PROVIDERS = new Set(['instagram', 'tiktok', 'youtube', 'spotify']);
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg']);

export function normalizeSoundtrack(input = {}) {
  const lane = LANE_SET.has(input.lane) ? input.lane : 'procedural-draft';
  const normalized = {
    schema: SOUNDTRACK_SCHEMA,
    lane,
    mix: normalizeMix(input.mix),
    ownedLocal: null,
    platformSound: null,
    generated: null,
    proceduralDraft: null,
  };
  if (lane === 'owned-local') normalized.ownedLocal = normalizeOwnedLocal(input.ownedLocal ?? input);
  if (lane === 'platform-sound') normalized.platformSound = normalizePlatformSound(input.platformSound ?? input);
  if (lane === 'generated') normalized.generated = normalizeGenerated(input.generated ?? input);
  if (lane === 'procedural-draft') normalized.proceduralDraft = {
    label: 'Procedural draft bed',
    bpm: boundedNumber(input.proceduralDraft?.bpm ?? input.bpm ?? 118, 40, 240, 'soundtrack.proceduralDraft.bpm'),
    finalQuality: false,
  };
  return normalized;
}

export function soundtrackReadiness(input, options = {}) {
  const soundtrack = normalizeSoundtrack(input);
  if (soundtrack.lane === 'generated') {
    return { state: 'parked', ready: false, blocker: generativeMediaBlocker('Music') };
  }
  if (soundtrack.lane === 'platform-sound') return {
    state: 'ready', ready: true, blocker: null,
    boundary: 'Exports a silent upload master; add the referenced sound in the official platform.',
  };
  if (soundtrack.lane === 'procedural-draft') return {
    state: 'draft', ready: true, blocker: null,
    boundary: 'Procedural audio is a draft fallback, not final-quality music.',
  };
  return { state: 'ready', ready: true, blocker: null };
}

export function soundtrackDistributionBlockers(input) {
  const soundtrack = normalizeSoundtrack(input);
  if (soundtrack.lane === 'procedural-draft') return ['a final-quality soundtrack selection'];
  if (soundtrack.lane === 'generated') return ['an approved imported soundtrack with rights evidence'];
  if (soundtrack.lane === 'platform-sound') return [];
  if (soundtrack.lane === 'owned-local' && !soundtrack.ownedLocal.rightsEvidence) return ['soundtrack rights evidence'];
  return [];
}

export function supportedAudioPath(value) {
  const text = requiredString(value, 'soundtrack audio path');
  const extension = text.slice(text.lastIndexOf('.')).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(extension)) throw new Error(`unsupported soundtrack audio type: ${extension || 'unknown'}`);
  return text;
}

function normalizeOwnedLocal(input = {}) {
  return {
    path: supportedAudioPath(input.path),
    rightsPosture: ['owned', 'licensed'].includes(input.rightsPosture) ? input.rightsPosture : 'unknown',
    rightsEvidence: optionalString(input.rightsEvidence),
    attribution: optionalString(input.attribution),
  };
}

function normalizePlatformSound(input = {}) {
  const provider = String(input.provider ?? '').trim().toLowerCase();
  if (!PLATFORM_PROVIDERS.has(provider)) throw new Error(`soundtrack platform provider must be one of ${[...PLATFORM_PROVIDERS].join(', ')}`);
  return {
    provider,
    url: absoluteHttpsUrl(input.url, 'soundtrack.platformSound.url'),
    title: optionalString(input.title),
    startSeconds: boundedNumber(input.startSeconds ?? 0, 0, 86_400, 'soundtrack.platformSound.startSeconds'),
  };
}

function normalizeGenerated(input = {}) {
  const durationSeconds = boundedNumber(input.durationSeconds ?? 15, 1, 600, 'soundtrack.generated.durationSeconds');
  const variations = normalizeVariations(input.variations);
  const selectedVariationId = optionalString(input.selectedVariationId);
  if (selectedVariationId && !variations.some((variation) => variation.id === selectedVariationId)) {
    throw new Error(`selected soundtrack variation is unavailable: ${selectedVariationId}`);
  }
  return {
    runtimeId: optionalString(input.runtimeId) ?? 'ace-step-native',
    prompt: requiredString(input.prompt, 'soundtrack.generated.prompt'),
    durationSeconds,
    instrumental: input.instrumental !== false,
    controls: {
      bpm: (input.bpm ?? input.controls?.bpm) == null
        ? null
        : boundedNumber(input.bpm ?? input.controls?.bpm, 40, 240, 'soundtrack.generated.bpm'),
      key: optionalString(input.key ?? input.controls?.key),
      meter: optionalString(input.meter ?? input.controls?.meter),
      referenceAudioPath: input.referenceAudioPath ?? input.controls?.referenceAudioPath
        ? supportedAudioPath(input.referenceAudioPath ?? input.controls.referenceAudioPath)
        : null,
    },
    variationCount: boundedInteger(input.variationCount ?? 2, 1, 4, 'soundtrack.generated.variationCount'),
    selectedVariationId,
    variations,
  };
}

function normalizeVariations(input) {
  if (!Array.isArray(input)) return [];
  const ids = new Set();
  return input.slice(0, 4).map((entry, index) => {
    const id = optionalString(entry?.id) ?? `variation-${index + 1}`;
    if (ids.has(id)) throw new Error(`duplicate soundtrack variation: ${id}`);
    ids.add(id);
    return {
      id,
      audioPath: supportedAudioPath(entry?.audioPath),
      seed: Number.isInteger(Number(entry?.seed)) ? Number(entry.seed) : null,
      evidence: entry?.evidence && typeof entry.evidence === 'object' ? structuredClone(entry.evidence) : null,
    };
  });
}

function normalizeMix(input = {}) {
  return {
    trimStartSeconds: boundedNumber(input.trimStartSeconds ?? 0, 0, 86_400, 'soundtrack.mix.trimStartSeconds'),
    offsetSeconds: boundedNumber(input.offsetSeconds ?? 0, 0, 600, 'soundtrack.mix.offsetSeconds'),
    loop: input.loop !== false,
    fadeInSeconds: boundedNumber(input.fadeInSeconds ?? 0.2, 0, 30, 'soundtrack.mix.fadeInSeconds'),
    fadeOutSeconds: boundedNumber(input.fadeOutSeconds ?? 0.5, 0, 30, 'soundtrack.mix.fadeOutSeconds'),
    gainDb: boundedNumber(input.gainDb ?? -8, -60, 12, 'soundtrack.mix.gainDb'),
    ducking: {
      enabled: input.ducking?.enabled === true,
      threshold: boundedNumber(input.ducking?.threshold ?? 0.08, 0.001, 1, 'soundtrack.mix.ducking.threshold'),
      ratio: boundedNumber(input.ducking?.ratio ?? 8, 1, 30, 'soundtrack.mix.ducking.ratio'),
    },
  };
}

function absoluteHttpsUrl(value, field) {
  let url;
  try {
    url = new URL(requiredString(value, field));
  } catch {
    throw new Error(`${field} must be an absolute HTTPS URL`);
  }
  if (url.protocol !== 'https:') throw new Error(`${field} must be an absolute HTTPS URL`);
  return url.toString();
}

function boundedInteger(value, min, max, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${field} must be an integer between ${min} and ${max}`);
  return number;
}

function boundedNumber(value, min, max, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${field} must be between ${min} and ${max}`);
  return number;
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredString(value, field) {
  const text = optionalString(value);
  if (!text) throw new Error(`${field} is required`);
  return text;
}
