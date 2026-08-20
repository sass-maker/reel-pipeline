import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { KokoroTts } from './adapters/kokoro.js';
import { compileCastPrompt, createCastInstance } from './studio/character-directory.js';
import { deterministicHash } from './local-video-workflow-recipes.js';
import { normalizeSoundtrack, soundtrackDistributionBlockers } from './studio/soundtrack.js';

const execFileAsync = promisify(execFile);
export const LOCAL_EPISODE_SCHEMA = 'fleet.local-video-episode.v1';
export const LOCAL_EPISODE_RUN_SCHEMA = 'fleet.local-video-episode-run.v1';
const REVIEW_STATES = new Set(['needs-review', 'accepted', 'rejected']);

export function createEpisodeDraft(input = {}) {
  const targetDurationSeconds = boundedNumber(input.targetDurationSeconds ?? 120, 120, 180, 'targetDurationSeconds');
  const shotDurationSeconds = boundedNumber(input.shotDurationSeconds ?? 6, 3, 8, 'shotDurationSeconds');
  const shotCount = Math.ceil(targetDurationSeconds / shotDurationSeconds);
  if (shotCount < 20 || shotCount > 60) throw new Error('episode draft must contain between 20 and 60 short shots');
  const concept = requiredString(input.concept, 'concept');
  const cast = Array.isArray(input.cast) ? input.cast : [];
  const angles = ['wide establishing shot', 'full-body tracking shot', 'medium two-shot', 'low hero angle', 'over-the-shoulder shot', 'close reaction shot'];
  return normalizeLocalEpisode({
    schema: LOCAL_EPISODE_SCHEMA,
    id: input.id ?? `episode-${deterministicHash({ concept, targetDurationSeconds }).slice(0, 12)}`,
    title: input.title ?? concept.slice(0, 80),
    concept,
    targetDurationSeconds,
    cast,
    shots: Array.from({ length: shotCount }, (_, index) => ({
      id: `shot-${String(index + 1).padStart(2, '0')}`,
      order: index + 1,
      durationSeconds: index === shotCount - 1
        ? targetDurationSeconds - shotDurationSeconds * (shotCount - 1)
        : shotDurationSeconds,
      prompt: `${angles[index % angles.length]}. ${concept} Beat ${index + 1} of ${shotCount}; advance the action clearly while preserving cast identity, wardrobe, location, lighting, and screen direction.`,
      castIds: cast.map((entry) => entry.characterId),
      continuity: cast.length ? 'strict' : 'flexible',
      previewRecipeId: 'ltx-2b-comfy-i2v-preview',
      finalRecipeId: 'ltx-2.3-mlx-q4-final',
      seed: (Number(input.seed ?? 2307) + index * 7919) >>> 0,
      referenceImage: input.referenceImage ?? null,
    })),
    dialogue: input.dialogue ?? [],
    soundtrack: input.soundtrack,
    assembly: input.assembly,
  });
}

export function normalizeLocalEpisode(input = {}) {
  if (input.schema !== LOCAL_EPISODE_SCHEMA) throw new Error(`episode must use ${LOCAL_EPISODE_SCHEMA}`);
  const targetDurationSeconds = boundedNumber(input.targetDurationSeconds, 120, 180, 'episode.targetDurationSeconds');
  const cast = normalizeCast(input.cast);
  const castIds = new Set(cast.map((entry) => entry.characterId));
  const shots = normalizeShots(input.shots, castIds);
  const plannedDurationSeconds = shots.reduce((total, shot) => total + shot.durationSeconds, 0);
  if (Math.abs(plannedDurationSeconds - targetDurationSeconds) > 0.25) {
    throw new Error(`episode shots total ${plannedDurationSeconds}s but target is ${targetDurationSeconds}s`);
  }
  const shotIds = new Set(shots.map((shot) => shot.id));
  const dialogue = normalizeDialogue(input.dialogue, shotIds, castIds);
  return {
    schema: LOCAL_EPISODE_SCHEMA,
    id: requiredString(input.id, 'episode.id'),
    title: requiredString(input.title, 'episode.title'),
    concept: requiredString(input.concept, 'episode.concept'),
    targetDurationSeconds,
    plannedDurationSeconds,
    cast,
    shots,
    dialogue,
    soundtrack: input.soundtrack ? normalizeSoundtrack(input.soundtrack) : null,
    assembly: {
      width: boundedInteger(input.assembly?.width ?? 1080, 320, 3840, 'episode.assembly.width'),
      height: boundedInteger(input.assembly?.height ?? 1920, 320, 3840, 'episode.assembly.height'),
      fps: boundedInteger(input.assembly?.fps ?? 24, 12, 60, 'episode.assembly.fps'),
      videoCodec: input.assembly?.videoCodec ?? 'libx264',
      audioCodec: input.assembly?.audioCodec ?? 'aac',
      audioBitrate: input.assembly?.audioBitrate ?? '192k',
    },
  };
}

export async function resolveEpisodeCast(episode, characterStore) {
  const normalized = normalizeLocalEpisode(episode);
  if (!characterStore?.get) throw new Error('character directory store is required');
  const cast = [];
  for (const entry of normalized.cast) {
    const character = await characterStore.get(entry.characterId, entry.characterRevision);
    if (!character) throw new Error(`character directory is missing ${entry.characterId}`);
    const instance = createCastInstance(character, { id: entry.castInstanceId, wardrobe: entry.wardrobe, continuityNotes: entry.continuityNotes });
    const [compiled] = await compileCastPrompt([instance]);
    const overrideReference = entry.referenceImage ? [{
      path: path.resolve(entry.referenceImage),
      sha256: await sha256File(entry.referenceImage),
      label: 'episode override',
    }] : [];
    cast.push({
      ...compiled,
      references: overrideReference.length ? overrideReference : compiled.references,
      voiceId: entry.voiceId,
      voiceSpeed: entry.voiceSpeed,
    });
  }
  for (const shot of normalized.shots.filter((entry) => entry.continuity === 'strict')) {
    for (const characterId of shot.castIds) {
      const resolved = cast.find((entry) => entry.characterId === characterId);
      if (!resolved?.references.length) throw new Error(`shot ${shot.id} requires an approved reference for ${characterId}`);
    }
  }
  return cast;
}

export function episodeShotSignature(shot, resolvedCast, options = {}) {
  const cast = shot.castIds.map((characterId) => {
    const entry = resolvedCast.find((candidate) => candidate.characterId === characterId);
    if (!entry) throw new Error(`shot ${shot.id} cannot resolve cast member ${characterId}`);
    return {
      characterId: entry.characterId,
      characterRevision: entry.characterRevision,
      identity: entry.identity,
      references: entry.references.map(({ sha256 }) => sha256),
    };
  });
  return deterministicHash({
    shot,
    cast,
    referenceImageSha256: options.referenceImageSha256 ?? null,
    phase: options.phase ?? 'final',
    recipeId: options.phase === 'preview' ? shot.previewRecipeId : shot.finalRecipeId,
  });
}

export async function renderEpisodeShots(episode, options = {}) {
  const normalized = normalizeLocalEpisode(episode);
  const resolvedCast = options.resolvedCast ?? await resolveEpisodeCast(normalized, options.characterStore);
  const outputDir = path.resolve(options.outputDir ?? path.join('tmp/studio/episodes', normalized.id));
  const receiptPath = path.join(outputDir, 'episode-run.json');
  await mkdir(outputDir, { recursive: true });
  const previous = options.previousRun ?? await readJson(receiptPath);
  const phase = options.phase ?? 'preview';
  const run = {
    schema: LOCAL_EPISODE_RUN_SCHEMA,
    episodeId: normalized.id,
    episodeSignature: deterministicHash(normalized),
    phase,
    status: 'rendering',
    manifest: normalized,
    cast: resolvedCast,
    shots: [],
    createdAt: previous?.createdAt ?? new Date(options.now?.() ?? Date.now()).toISOString(),
    updatedAt: new Date(options.now?.() ?? Date.now()).toISOString(),
  };
  const executeShot = options.executeShot;
  if (typeof executeShot !== 'function') throw new Error('episode executeShot adapter is required');
  for (const shot of normalized.shots) {
    const referenceImageSha256 = shot.referenceImage
      ? await sha256File(shot.referenceImage)
      : null;
    const inputSignature = episodeShotSignature(shot, resolvedCast, {
      phase,
      referenceImageSha256,
    });
    const existing = previous?.shots?.find((entry) => entry.id === shot.id && entry.inputSignature === inputSignature);
    if (options.onlyShotIds?.length && !options.onlyShotIds.includes(shot.id)) {
      run.shots.push(existing ? { ...existing, reused: true } : {
        id: shot.id,
        order: shot.order,
        inputSignature,
        recipeId: phase === 'preview' ? shot.previewRecipeId : shot.finalRecipeId,
        videoPath: null,
        receiptPath: null,
        sha256: null,
        reviewState: 'needs-review',
        status: 'pending',
        reused: false,
      });
      continue;
    }
    if (existing?.reviewState === 'accepted' && await fileExists(existing.videoPath)) {
      run.shots.push({ ...existing, reused: true });
      await writeJson(receiptPath, run);
      continue;
    }
    const result = await executeShot({
      episode: normalized,
      shot,
      phase,
      recipeId: phase === 'preview' ? shot.previewRecipeId : shot.finalRecipeId,
      inputSignature,
      cast: resolvedCast.filter((entry) => shot.castIds.includes(entry.characterId)),
    });
    if (!result?.videoPath) throw new Error(`shot ${shot.id} returned no video`);
    run.shots.push({
      id: shot.id,
      order: shot.order,
      inputSignature,
      recipeId: phase === 'preview' ? shot.previewRecipeId : shot.finalRecipeId,
      videoPath: path.resolve(result.videoPath),
      receiptPath: result.receiptPath ?? result.ownerManifestPath ?? null,
      sha256: result.sha256 ?? null,
      reviewState: 'needs-review',
      status: 'completed',
      reused: false,
    });
    await writeJson(receiptPath, run);
  }
  run.status = run.shots.every((shot) => shot.reviewState === 'accepted') ? 'shots-accepted' : 'needs-review';
  run.updatedAt = new Date(options.now?.() ?? Date.now()).toISOString();
  await writeJson(receiptPath, run);
  return { ...run, receiptPath };
}

export async function saveLocalEpisode(episode, options = {}) {
  const normalized = normalizeLocalEpisode(episode);
  const rootDir = path.resolve(options.rootDir ?? 'tmp/studio/episodes');
  const episodeDir = path.join(rootDir, normalized.id);
  const manifestPath = path.join(episodeDir, 'episode.json');
  await mkdir(episodeDir, { recursive: true });
  await writeJson(manifestPath, normalized);
  return { ...normalized, manifestPath, episodeDir };
}

export async function loadLocalEpisode(id, options = {}) {
  const rootDir = path.resolve(options.rootDir ?? 'tmp/studio/episodes');
  const manifestPath = path.join(rootDir, requiredString(id, 'episode id'), 'episode.json');
  const input = await readJson(manifestPath);
  if (!input) return null;
  const episode = normalizeLocalEpisode(input);
  const runPath = path.join(rootDir, episode.id, 'episode-run.json');
  const assemblyPath = path.join(rootDir, episode.id, 'assembly-receipt.json');
  const assembly = await readJson(assemblyPath);
  return {
    ...episode,
    manifestPath,
    episodeDir: path.dirname(manifestPath),
    run: await readJson(runPath),
    assembly: assembly ? { ...assembly, receiptPath: assemblyPath } : null,
  };
}

export async function listLocalEpisodes(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? 'tmp/studio/episodes');
  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const episodes = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const episode = await loadLocalEpisode(entry.name, { rootDir });
    if (episode) episodes.push(episode);
  }
  return episodes.sort((a, b) => a.title.localeCompare(b.title));
}

export async function setEpisodeShotReview(run, shotId, reviewState, options = {}) {
  if (!REVIEW_STATES.has(reviewState)) throw new Error(`unsupported shot review state: ${reviewState}`);
  const next = structuredClone(run);
  const shot = next.shots?.find((entry) => entry.id === shotId);
  if (!shot) throw new Error(`episode run does not contain shot ${shotId}`);
  shot.reviewState = reviewState;
  shot.reviewedAt = new Date(options.now?.() ?? Date.now()).toISOString();
  next.status = next.shots.every((entry) => entry.reviewState === 'accepted') ? 'shots-accepted' : 'needs-review';
  next.updatedAt = shot.reviewedAt;
  if (options.receiptPath) await writeJson(path.resolve(options.receiptPath), next);
  return next;
}

export async function assembleLocalEpisode(run, options = {}) {
  if (run?.schema !== LOCAL_EPISODE_RUN_SCHEMA) throw new Error(`episode run must use ${LOCAL_EPISODE_RUN_SCHEMA}`);
  if (run.phase !== 'final') throw new Error('final assembly requires an accepted final-phase episode run');
  if (!run.shots?.length || run.shots.some((shot) => shot.reviewState !== 'accepted')) throw new Error('accept every episode shot before final assembly');
  for (const shot of run.shots) await access(shot.videoPath);
  const soundtrack = requireFinalSoundtrack(run.manifest.soundtrack);
  const outputDir = path.resolve(options.outputDir ?? path.dirname(options.receiptPath ?? run.receiptPath ?? 'tmp/studio/episodes'));
  await mkdir(outputDir, { recursive: true });
  const concatPath = path.join(outputDir, 'shots.txt');
  const silentPath = path.join(outputDir, 'episode-silent.mp4');
  const videoPath = path.join(outputDir, 'episode-final.mp4');
  await writeFile(concatPath, `${run.shots.sort((a, b) => a.order - b.order).map((shot) => `file '${escapeConcatPath(shot.videoPath)}'`).join('\n')}\n`);
  const commandRunner = options.commandRunner ?? defaultCommandRunner;
  await commandRunner(options.ffmpegPath ?? 'ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concatPath,
    '-vf', `scale=${run.manifest.assembly.width}:${run.manifest.assembly.height}:force_original_aspect_ratio=decrease,pad=${run.manifest.assembly.width}:${run.manifest.assembly.height}:(ow-iw)/2:(oh-ih)/2`,
    '-r', String(run.manifest.assembly.fps), '-c:v', run.manifest.assembly.videoCodec, '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', silentPath,
  ]);
  const voiceAssets = await renderDialogue(run, outputDir, options);
  const mix = buildAudioMix(run, soundtrack, voiceAssets);
  await commandRunner(options.ffmpegPath ?? 'ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', silentPath,
    '-stream_loop', '-1', '-i', soundtrack.path,
    ...voiceAssets.flatMap((asset) => ['-i', asset.path]),
    '-filter_complex', mix.filter,
    '-map', '0:v:0', '-map', '[mix]', '-c:v', 'copy', '-c:a', run.manifest.assembly.audioCodec,
    '-b:a', run.manifest.assembly.audioBitrate, '-t', String(run.manifest.targetDurationSeconds), '-movflags', '+faststart', videoPath,
  ]);
  const artifacts = await hashEpisodeArtifacts([
    ['video', videoPath],
    ['soundtrack', soundtrack.path],
    ...run.shots.map((shot) => [`shot:${shot.id}`, shot.videoPath]),
    ...voiceAssets.map((asset) => [`dialogue:${asset.id}`, asset.path]),
  ], options.hashFile);
  const receipt = {
    schema: 'fleet.local-video-episode-assembly.v1',
    status: 'completed',
    episodeId: run.episodeId,
    episodeSignature: run.episodeSignature,
    timeline: timelineFor(run.manifest),
    shots: run.shots,
    dialogue: voiceAssets,
    soundtrack,
    mix,
    assembly: run.manifest.assembly,
    artifacts,
    output: { videoPath, sha256: artifacts.find((entry) => entry.id === 'video').sha256 },
    completedAt: new Date(options.now?.() ?? Date.now()).toISOString(),
    reviewState: 'needs-review',
  };
  const assemblyReceiptPath = path.join(outputDir, 'assembly-receipt.json');
  await writeJson(assemblyReceiptPath, receipt);
  return { ...receipt, receiptPath: assemblyReceiptPath };
}

function normalizeCast(input) {
  if (!Array.isArray(input)) throw new Error('episode.cast must be an array');
  const ids = new Set();
  return input.map((entry, index) => {
    const characterId = requiredString(entry?.characterId, `episode.cast[${index}].characterId`);
    if (ids.has(characterId)) throw new Error(`duplicate episode cast member: ${characterId}`);
    ids.add(characterId);
    return {
      characterId,
      characterRevision: entry.characterRevision == null ? null : boundedInteger(entry.characterRevision, 1, Number.MAX_SAFE_INTEGER, `episode.cast[${index}].characterRevision`),
      castInstanceId: entry.castInstanceId ?? `cast_${characterId}`,
      voiceId: requiredString(entry.voiceId, `episode.cast[${index}].voiceId`),
      voiceSpeed: boundedNumber(entry.voiceSpeed ?? 1, 0.5, 2, `episode.cast[${index}].voiceSpeed`),
      referenceImage: entry.referenceImage ? path.resolve(entry.referenceImage) : null,
      wardrobe: Array.isArray(entry.wardrobe) ? entry.wardrobe.map(String) : [],
      continuityNotes: entry.continuityNotes ?? null,
    };
  });
}

function normalizeShots(input, castIds) {
  if (!Array.isArray(input) || input.length === 0) throw new Error('episode.shots must contain at least one shot');
  const ids = new Set();
  return input.map((entry, index) => {
    const id = requiredString(entry?.id, `episode.shots[${index}].id`);
    if (ids.has(id)) throw new Error(`duplicate episode shot: ${id}`);
    ids.add(id);
    const shotCast = Array.isArray(entry.castIds) ? entry.castIds.map(String) : [];
    const missing = shotCast.filter((characterId) => !castIds.has(characterId));
    if (missing.length) throw new Error(`shot ${id} references unknown cast: ${missing.join(', ')}`);
    return {
      id,
      order: boundedInteger(entry.order ?? index + 1, 1, 10_000, `shot ${id}.order`),
      durationSeconds: boundedNumber(entry.durationSeconds, 1, 8, `shot ${id}.durationSeconds`),
      prompt: requiredString(entry.prompt, `shot ${id}.prompt`),
      negativePrompt: entry.negativePrompt ?? '',
      castIds: shotCast,
      continuity: ['strict', 'flexible'].includes(entry.continuity) ? entry.continuity : 'strict',
      referenceImage: entry.referenceImage ?? null,
      previewRecipeId: entry.previewRecipeId ?? 'ltx-2b-comfy-i2v-preview',
      finalRecipeId: entry.finalRecipeId ?? 'ltx-2.3-mlx-q4-final',
      seed: boundedInteger(entry.seed, 0, 4294967295, `shot ${id}.seed`),
    };
  }).sort((a, b) => a.order - b.order);
}

function normalizeDialogue(input = [], shotIds, castIds) {
  if (!Array.isArray(input)) throw new Error('episode.dialogue must be an array');
  return input.map((entry, index) => {
    const shotId = requiredString(entry?.shotId, `dialogue[${index}].shotId`);
    const characterId = requiredString(entry?.characterId, `dialogue[${index}].characterId`);
    if (!shotIds.has(shotId)) throw new Error(`dialogue references unknown shot ${shotId}`);
    if (!castIds.has(characterId)) throw new Error(`dialogue references unknown character ${characterId}`);
    return {
      id: entry.id ?? `line-${index + 1}`,
      shotId,
      characterId,
      text: requiredString(entry.text, `dialogue[${index}].text`),
      offsetSeconds: boundedNumber(entry.offsetSeconds ?? 0, 0, 8, `dialogue[${index}].offsetSeconds`),
      gainDb: boundedNumber(entry.gainDb ?? 0, -24, 12, `dialogue[${index}].gainDb`),
    };
  });
}

function requireFinalSoundtrack(input) {
  if (!input) throw new Error('final episode assembly requires a soundtrack');
  const blockers = soundtrackDistributionBlockers(input);
  if (blockers.length) throw new Error(`final episode assembly requires ${blockers.join(', ')}`);
  if (input.lane === 'platform-sound') throw new Error('platform playback cannot be embedded in a local final episode');
  if (input.lane === 'owned-local') {
    if (!input.ownedLocal.rightsEvidence) throw new Error('owned local soundtrack requires rights evidence');
    return { path: path.resolve(input.ownedLocal.path), lane: input.lane, evidence: input.ownedLocal.rightsEvidence, mix: input.mix };
  }
  if (input.lane === 'generated') {
    const selected = input.generated.variations.find((entry) => entry.id === input.generated.selectedVariationId);
    if (!selected?.audioPath || !selected.evidence) throw new Error('generated soundtrack requires a selected variation with runtime evidence');
    return { path: path.resolve(selected.audioPath), lane: input.lane, evidence: selected.evidence, seed: selected.seed, runtimeId: input.generated.runtimeId, mix: input.mix };
  }
  throw new Error('procedural draft music cannot be used for final episode assembly');
}

async function renderDialogue(run, outputDir, options) {
  const assets = [];
  const renderVoice = options.voiceRenderer ?? defaultVoiceRenderer;
  const timeline = timelineFor(run.manifest);
  for (const line of run.manifest.dialogue) {
    const cast = run.cast.find((entry) => entry.characterId === line.characterId);
    const shot = timeline.find((entry) => entry.shotId === line.shotId);
    const asset = await renderVoice(line, cast, { outputDir: path.join(outputDir, 'dialogue') });
    assets.push({
      id: line.id,
      characterId: line.characterId,
      voiceId: cast.voiceId,
      voiceSpeed: cast.voiceSpeed,
      text: line.text,
      path: path.resolve(asset.path),
      startSeconds: shot.startSeconds + line.offsetSeconds,
      gainDb: line.gainDb,
      sha256: asset.sha256 ?? await sha256File(asset.path),
    });
  }
  return assets;
}

async function defaultVoiceRenderer(line, cast, options) {
  const outputDir = path.join(options.outputDir, line.id);
  const tts = new KokoroTts({ voice: cast.voiceId, speed: cast.voiceSpeed });
  const [asset] = await tts.synthesizeScenes([{ narration: line.text }], { outputDir, voice: cast.voiceId, speed: cast.voiceSpeed });
  return asset;
}

function buildAudioMix(run, soundtrack, voiceAssets) {
  const duration = run.manifest.targetDurationSeconds;
  const gain = Math.pow(10, soundtrack.mix.gainDb / 20).toFixed(6);
  const filters = [`[1:a]atrim=0:${duration},asetpts=N/SR/TB,volume=${gain},afade=t=in:st=0:d=${soundtrack.mix.fadeInSeconds},afade=t=out:st=${Math.max(0, duration - soundtrack.mix.fadeOutSeconds)}:d=${soundtrack.mix.fadeOutSeconds}[music]`];
  const labels = ['[music]'];
  voiceAssets.forEach((asset, index) => {
    const label = `voice${index}`;
    const delay = Math.round(asset.startSeconds * 1000);
    const voiceGain = Math.pow(10, asset.gainDb / 20).toFixed(6);
    filters.push(`[${index + 2}:a]adelay=${delay}|${delay},volume=${voiceGain}[${label}]`);
    labels.push(`[${label}]`);
  });
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[mix]`);
  return { filter: filters.join(';'), inputs: labels.length, durationSeconds: duration };
}

function timelineFor(manifest) {
  let cursor = 0;
  return manifest.shots.map((shot) => {
    const entry = { shotId: shot.id, startSeconds: cursor, endSeconds: cursor + shot.durationSeconds, durationSeconds: shot.durationSeconds };
    cursor = entry.endSeconds;
    return entry;
  });
}

async function hashEpisodeArtifacts(entries, hashFile = sha256File) {
  return Promise.all(entries.map(async ([id, filePath]) => ({
    id,
    path: path.resolve(filePath),
    bytes: (await stat(filePath)).size,
    sha256: await hashFile(filePath),
  })));
}

async function defaultCommandRunner(command, args) {
  return execFileAsync(command, args, { timeout: 30 * 60 * 1000, maxBuffer: 32 * 1024 * 1024 });
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function fileExists(filePath) {
  if (!filePath) return false;
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function escapeConcatPath(value) {
  return path.resolve(value).replaceAll("'", "'\\''");
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

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}
