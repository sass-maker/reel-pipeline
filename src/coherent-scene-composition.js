export const COHERENT_SCENE_SCHEMA = 'fleet.coherent-scene-film.v1';

export const NARRATIVE_ROLES = new Set([
  'setup',
  'tension',
  'analysis',
  'verdict',
  'proof',
  'close',
]);

export const PUBLICATION_TIERS = new Set([
  'review-only',
  'publishable',
  'commercial',
]);

export const ASSET_TIERS = new Set([
  'production-safe',
  'proof-only',
  'restricted',
]);

export function normalizeFilmSkillReference(input, label = 'filmSkill') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${label} must pin an id and integer version`);
  }
  const id = requiredString(input.id, `${label}.id`);
  const version = finiteNumber(input.version, `${label}.version`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`${label}.id must be a kebab-case identifier`);
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`${label}.version must be a positive integer`);
  }
  return { id, version, ref: `${id}@${version}` };
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function finiteNumber(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function optionalFiniteNumber(value, fallback, label) {
  if (value === undefined || value === null) return fallback;
  return finiteNumber(value, label);
}

function normalizeAsset(input, index) {
  const asset = {
    id: requiredString(input?.id, `assets[${index}].id`),
    kind: requiredString(input?.kind, `assets[${index}].kind`),
    source: requiredString(input?.source, `assets[${index}].source`),
    sourceType: requiredString(input?.sourceType, `assets[${index}].sourceType`),
    sourceRevision: input?.sourceRevision
      ? requiredString(input.sourceRevision, `assets[${index}].sourceRevision`)
      : null,
    license: requiredString(input?.license, `assets[${index}].license`),
    tier: requiredString(input?.tier, `assets[${index}].tier`),
    evidence: input?.evidence === true,
  };

  if (!ASSET_TIERS.has(asset.tier)) {
    throw new Error(`assets[${index}].tier must be one of ${[...ASSET_TIERS].join(', ')}`);
  }
  if (asset.sourceType === 'real-capture' && !asset.sourceRevision) {
    throw new Error(`assets[${index}] real captures require sourceRevision`);
  }
  if (asset.sourceType === 'generated-atmosphere' && asset.evidence) {
    throw new Error(`assets[${index}] generated atmosphere cannot be product evidence`);
  }
  return asset;
}

function normalizeScene(input, index, assetIds) {
  const start = finiteNumber(input?.start, `scenes[${index}].start`);
  const end = finiteNumber(input?.end, `scenes[${index}].end`);
  if (!(start >= 0 && end > start)) {
    throw new Error(`scenes[${index}] must have end greater than start`);
  }

  const role = requiredString(input?.role, `scenes[${index}].role`);
  if (!NARRATIVE_ROLES.has(role)) {
    throw new Error(`scenes[${index}].role must be one of ${[...NARRATIVE_ROLES].join(', ')}`);
  }

  const dominant = input?.dominant;
  if (!dominant || typeof dominant !== 'object') {
    throw new Error(`scenes[${index}].dominant is required`);
  }
  const dominantAssetId = requiredString(
    dominant.assetId,
    `scenes[${index}].dominant.assetId`,
  );
  if (!assetIds.has(dominantAssetId)) {
    throw new Error(`scenes[${index}] references unknown dominant asset ${dominantAssetId}`);
  }

  const supporting = Array.isArray(input.supporting) ? input.supporting : [];
  if (supporting.length > 1 && !input.visualBudgetException?.approved) {
    throw new Error(`scenes[${index}] exceeds one supporting visual layer`);
  }
  for (const [supportIndex, binding] of supporting.entries()) {
    if (!assetIds.has(binding?.assetId)) {
      throw new Error(
        `scenes[${index}].supporting[${supportIndex}] references unknown asset`,
      );
    }
  }

  return {
    id: requiredString(input?.id, `scenes[${index}].id`),
    role,
    purpose: requiredString(input?.purpose, `scenes[${index}].purpose`),
    start,
    end,
    dominant: {
      kind: requiredString(dominant.kind, `scenes[${index}].dominant.kind`),
      assetId: dominantAssetId,
      params: dominant.params && typeof dominant.params === 'object'
        ? structuredClone(dominant.params)
        : {},
    },
    supporting: supporting.map((binding, supportIndex) => ({
      kind: requiredString(
        binding?.kind,
        `scenes[${index}].supporting[${supportIndex}].kind`,
      ),
      assetId: binding.assetId,
      params: binding.params && typeof binding.params === 'object'
        ? structuredClone(binding.params)
        : {},
    })),
    principalAction: requiredString(
      input?.principalAction,
      `scenes[${index}].principalAction`,
    ),
    cameraMove: requiredString(input?.cameraMove, `scenes[${index}].cameraMove`),
    transition: requiredString(input?.transition, `scenes[${index}].transition`),
    spokenLine: typeof input?.spokenLine === 'string' ? input.spokenLine.trim() : '',
    caption: typeof input?.caption === 'string' ? input.caption.trim() : '',
    visualBudgetException: input?.visualBudgetException ?? null,
  };
}

function normalizeCaptionCue(input, index) {
  const start = finiteNumber(input?.start, `captions[${index}].start`);
  const end = finiteNumber(input?.end, `captions[${index}].end`);
  if (!(start >= 0 && end > start)) {
    throw new Error(`captions[${index}] must have end greater than start`);
  }
  return {
    start,
    end,
    text: requiredString(input?.text, `captions[${index}].text`),
    burn: input?.burn !== false,
    position: normalizeCaptionPosition(input?.position, index),
  };
}

function normalizeCaptionPosition(value, index) {
  const position = value ?? 'bottom';
  if (!['top', 'bottom'].includes(position)) {
    throw new Error(`captions[${index}].position must be top or bottom`);
  }
  return position;
}

function normalizeAudioBinding(input, label, assetIds, defaults = {}) {
  if (input === undefined || input === null) return null;
  const assetId = requiredString(input.assetId, `${label}.assetId`);
  if (!assetIds.has(assetId)) throw new Error(`${label} references unknown asset ${assetId}`);
  const binding = {
    assetId,
    start: optionalFiniteNumber(input.start, defaults.start ?? 0, `${label}.start`),
    end: input.end === undefined || input.end === null
      ? defaults.end ?? null
      : finiteNumber(input.end, `${label}.end`),
    gainDb: optionalFiniteNumber(input.gainDb, defaults.gainDb ?? 0, `${label}.gainDb`),
    duckUnderNarrationDb: optionalFiniteNumber(
      input.duckUnderNarrationDb,
      defaults.duckUnderNarrationDb ?? 0,
      `${label}.duckUnderNarrationDb`,
    ),
  };
  if (binding.start < 0) throw new Error(`${label}.start must not be negative`);
  if (binding.end !== null && binding.end <= binding.start) {
    throw new Error(`${label}.end must be greater than start`);
  }
  if (binding.duckUnderNarrationDb < 0) {
    throw new Error(`${label}.duckUnderNarrationDb must not be negative`);
  }
  return binding;
}

function normalizeAudio(input, assetIds) {
  const audio = input && typeof input === 'object' ? input : {};
  const narration = normalizeAudioBinding(
    audio.narration,
    'audio.narration',
    assetIds,
  );
  const soundBed = normalizeAudioBinding(
    audio.soundBed,
    'audio.soundBed',
    assetIds,
    { gainDb: -24, duckUnderNarrationDb: 8 },
  );
  const effects = (Array.isArray(audio.effects) ? audio.effects : []).map((effect, index) => ({
    ...normalizeAudioBinding(effect, `audio.effects[${index}]`, assetIds),
    sceneId: effect.sceneId
      ? requiredString(effect.sceneId, `audio.effects[${index}].sceneId`)
      : null,
  }));
  return { narration, soundBed, effects };
}

export function normalizeCoherentFilm(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('film manifest must be an object');
  }
  if (input.schema !== COHERENT_SCENE_SCHEMA) {
    throw new Error(`schema must be ${COHERENT_SCENE_SCHEMA}`);
  }

  const publicationTier = requiredString(input.publicationTier, 'publicationTier');
  if (!PUBLICATION_TIERS.has(publicationTier)) {
    throw new Error(`publicationTier must be one of ${[...PUBLICATION_TIERS].join(', ')}`);
  }

  const assets = (Array.isArray(input.assets) ? input.assets : []).map(normalizeAsset);
  if (assets.length === 0) throw new Error('assets must not be empty');
  const assetIds = new Set();
  for (const asset of assets) {
    if (assetIds.has(asset.id)) throw new Error(`duplicate asset id: ${asset.id}`);
    assetIds.add(asset.id);
    if (publicationTier !== 'review-only' && asset.tier !== 'production-safe') {
      throw new Error(
        `asset ${asset.id} is ${asset.tier} and cannot enter a ${publicationTier} render`,
      );
    }
  }

  const scenes = (Array.isArray(input.scenes) ? input.scenes : [])
    .map((scene, index) => normalizeScene(scene, index, assetIds));
  if (scenes.length === 0) throw new Error('scenes must not be empty');
  if (scenes[0].start !== 0) {
    throw new Error('the first scene must start at 0');
  }
  for (let index = 1; index < scenes.length; index += 1) {
    if (scenes[index].start < scenes[index - 1].end) {
      throw new Error(`scenes overlap: ${scenes[index - 1].id} and ${scenes[index].id}`);
    }
    if (scenes[index].start > scenes[index - 1].end) {
      throw new Error(`scenes have a gap: ${scenes[index - 1].id} and ${scenes[index].id}`);
    }
  }

  const format = {
    width: finiteNumber(input.format?.width, 'format.width'),
    height: finiteNumber(input.format?.height, 'format.height'),
    fps: finiteNumber(input.format?.fps, 'format.fps'),
  };
  if (!(format.width > 0 && format.height > 0 && format.fps > 0)) {
    throw new Error('format dimensions and fps must be positive');
  }

  const captions = (Array.isArray(input.captions) ? input.captions : [])
    .map(normalizeCaptionCue);
  for (let index = 1; index < captions.length; index += 1) {
    if (captions[index].start < captions[index - 1].end) {
      throw new Error(`captions overlap at index ${index}`);
    }
  }
  const audio = normalizeAudio(input.audio, assetIds);
  const totalDurationSeconds = scenes.at(-1).end;
  if (captions.some((cue) => cue.end > totalDurationSeconds)) {
    throw new Error('captions must end within the film timeline');
  }
  for (const [label, binding] of [
    ['audio.narration', audio.narration],
    ['audio.soundBed', audio.soundBed],
    ...audio.effects.map((effect, index) => [`audio.effects[${index}]`, effect]),
  ]) {
    if (binding && binding.end !== null && binding.end > totalDurationSeconds) {
      throw new Error(`${label}.end must be within the film timeline`);
    }
  }
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  for (const [index, effect] of audio.effects.entries()) {
    if (effect.sceneId && !sceneIds.has(effect.sceneId)) {
      throw new Error(`audio.effects[${index}] references unknown scene ${effect.sceneId}`);
    }
  }
  const approval = input.approval && typeof input.approval === 'object'
    ? {
      status: requiredString(input.approval.status, 'approval.status'),
      approvedBy: input.approval.approvedBy
        ? requiredString(input.approval.approvedBy, 'approval.approvedBy')
        : null,
      approvedAt: input.approval.approvedAt
        ? requiredString(input.approval.approvedAt, 'approval.approvedAt')
        : null,
    }
    : null;
  const filmSkill = input.filmSkill === undefined || input.filmSkill === null
    ? null
    : normalizeFilmSkillReference(input.filmSkill);

  return {
    schema: COHERENT_SCENE_SCHEMA,
    id: requiredString(input.id, 'id'),
    title: requiredString(input.title, 'title'),
    spine: requiredString(input.spine, 'spine'),
    directionId: requiredString(input.directionId, 'directionId'),
    publicationTier,
    format,
    style: input.style ?? {},
    assets,
    scenes,
    captions,
    audio,
    approval,
    filmSkill,
    totalDurationSeconds,
  };
}

export function coherentFilmToSrt(filmInput) {
  const film = normalizeCoherentFilm(filmInput);
  const cues = film.captions.length > 0
    ? film.captions
    : film.scenes.filter((scene) => scene.caption).map((scene) => ({
      start: scene.start,
      end: scene.end,
      text: scene.caption,
    }));
  return `${cues.map((cue, index) => [
    index + 1,
    `${srtTimestamp(cue.start)} --> ${srtTimestamp(cue.end)}`,
    cue.text,
  ].join('\n')).join('\n\n')}\n`;
}

export function coherentSceneAt(filmInput, seconds) {
  const film = normalizeCoherentFilm(filmInput);
  return film.scenes.find(
    (scene, index) => seconds >= scene.start
      && (seconds < scene.end || (index === film.scenes.length - 1 && seconds <= scene.end)),
  ) ?? film.scenes.at(-1);
}

function srtTimestamp(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}
