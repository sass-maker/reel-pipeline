#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, stat, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import sample from '../config/studio-episode-sample.json' with { type: 'json' };
import { runGuardedCommand } from '../src/adapters/ltx-mlx-final.js';
import {
  LOCAL_EPISODE_RUN_SCHEMA,
  assembleLocalEpisode,
  createEpisodeDraft,
  renderEpisodeShots,
  setEpisodeShotReview,
} from '../src/local-video-episode.js';
import { VIDEO_FORGE_RUNTIME, checkForgeHost } from '../src/local-video-forge.js';

const execFileAsync = promisify(execFile);
const outputDir = path.resolve('.reel-pipeline/projects', sample.id);
const shotDir = path.join(outputDir, 'shots');
const runPath = path.join(outputDir, 'episode-run.json');
const scorePath = path.join(outputDir, 'original-score.wav');
const shotReviewPath = path.join(outputDir, 'shot-review.png');
const finalReviewPath = path.join(outputDir, 'final-review.png');
const acceptShots = process.argv.includes('--accept-shots');
const acceptFinal = process.argv.includes('--accept-final');
const rejectShots = process.argv.includes('--reject-shots');
const referencePath = path.resolve(sample.character.referenceImage);
const environmentReferencePath = path.resolve(sample.environment.referenceImage);
const POSTPROCESS_REVISION = 'text-safe-overscan-v2';

await mkdir(shotDir, { recursive: true });

if (acceptFinal) {
  await acceptFinalReview();
  process.exit(0);
}

if (rejectShots) {
  await rejectShotReview();
  process.exit(0);
}

const episode = createSampleEpisode();
if (acceptShots) {
  await acceptShotReviewAndAssemble(episode);
  process.exit(0);
}

await assertRuntimeReady();
await ensureOriginalScore();
const previousRun = await readJson(runPath);
const resolvedCast = await resolveSampleCast();
const run = await renderEpisodeShots(episode, {
  outputDir,
  previousRun,
  resolvedCast,
  phase: 'final',
  executeShot: renderShot,
});
await buildShotReview(run.shots);
console.log(JSON.stringify({
  status: 'shots-need-review',
  episodeId: episode.id,
  completedShots: run.shots.length,
  runPath,
  reviewSheet: shotReviewPath,
  next: 'Review the contact sheet, then rerun with --accept-shots.',
}, null, 2));

function createSampleEpisode() {
  if (sample.schema !== 'fleet.studio-episode-sample.v1') throw new Error('unsupported episode sample schema');
  if (!Array.isArray(sample.beats) || sample.beats.length !== 20) throw new Error('episode sample must declare exactly 20 beats');
  if (!sample.character?.shotIds?.length) throw new Error('episode sample must declare character reference shots');
  if (!sample.environment?.shotIds?.length) throw new Error('episode sample must declare environment reference shots');
  const cast = [{
    characterId: sample.character.id,
    characterRevision: sample.character.revision,
    voiceId: 'af_heart',
    referenceImage: referencePath,
    wardrobe: ['plain mustard-yellow rain suit', 'brown work boots'],
    continuityNotes: sample.character.description,
  }];
  const draft = createEpisodeDraft({
    id: sample.id,
    title: sample.title,
    concept: sample.concept,
    targetDurationSeconds: sample.targetDurationSeconds,
    shotDurationSeconds: 6,
    seed: sample.seed,
    cast,
    soundtrack: {
      lane: 'owned-local',
      path: scorePath,
      rightsPosture: 'owned',
      rightsEvidence: 'Deterministic original score synthesized locally by the repository episode sample runner.',
      attribution: 'Original procedural composition for Signal After Midnight.',
      mix: { gainDb: -12, fadeInSeconds: 1.5, fadeOutSeconds: 3 },
    },
  });
  return {
    ...draft,
    shots: draft.shots.map((shot, index) => ({
      ...shot,
      prompt: [
        sample.beats[index],
        sample.character.shotIds.includes(shot.id) ? sample.character.description : '',
        'One coherent polished hand-painted 2D cinematic animation cel with mature realistic proportions, restrained linework, subtle texture, and the same stormy navy, slate, mustard, and amber palette in every shot.',
        'This is an adult animated drama scene, never comic art, never a storyboard, never a poster, and never a book illustration.',
        'One clear action, stable anatomy, purposeful camera movement, no cuts within the shot, no extra characters, no panels, no speech bubbles, no captions, no title cards, no interface overlays, no typography, no letters, no numbers, no symbols, no signature, no logo, no watermark.',
      ].filter(Boolean).join(' '),
      castIds: sample.character.shotIds.includes(shot.id) ? [sample.character.id] : [],
      continuity: sample.character.shotIds.includes(shot.id) ? 'strict' : 'flexible',
      referenceImage: sample.character.shotIds.includes(shot.id)
        ? referencePath
        : sample.environment.shotIds.includes(shot.id)
          ? environmentReferencePath
          : null,
    })),
  };
}

async function resolveSampleCast() {
  const sha256 = await sha256File(referencePath);
  if (sha256 !== sample.character.referenceSha256) throw new Error('episode character reference hash does not match the pinned sample');
  const environmentSha256 = await sha256File(environmentReferencePath);
  if (environmentSha256 !== sample.environment.referenceSha256) throw new Error('episode environment reference hash does not match the pinned sample');
  return [{
    characterId: sample.character.id,
    characterRevision: sample.character.revision,
    identity: sample.character.description,
    references: [{ path: referencePath, sha256, label: 'approved episode canary reference' }],
    wardrobe: ['plain mustard-yellow rain suit', 'brown work boots'],
    continuityNotes: sample.character.description,
    voiceId: 'af_heart',
    voiceSpeed: 1,
  }];
}

async function renderShot({ shot, inputSignature, cast }) {
  const videoPath = path.join(shotDir, `${shot.id}.mp4`);
  const receiptPath = path.join(shotDir, `${shot.id}.json`);
  if (await fileExists(videoPath) && await fileExists(receiptPath)) {
    const receipt = await readJson(receiptPath);
    if (receipt?.inputSignature === inputSignature) {
      if (receipt.postprocessRevision !== POSTPROCESS_REVISION) {
        await applyTextSafeOverscan(videoPath);
        receipt.postprocessRevision = POSTPROCESS_REVISION;
        receipt.output.sha256 = await sha256File(videoPath);
        receipt.output.bytes = (await stat(videoPath)).size;
        receipt.output.metadata = await probeVideo(videoPath);
        await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
      }
      console.log(`reuse ${shot.id}`);
      return { videoPath, receiptPath, sha256: receipt.output.sha256 };
    }
  }
  await assertResourceEnvelope();
  console.log(`render ${shot.id} (${shot.order}/20)`);
  const startedAt = new Date();
  const generationArgs = [
    'run', '--no-sync', 'ltx-2-mlx', 'generate', '--distilled', '--low-ram',
    '--model', path.resolve('.reel-pipeline/models/ltx-2.3-mlx-q4'),
    '--gemma', VIDEO_FORGE_RUNTIME.gemmaRepository,
    '--prompt', shot.prompt,
    '--height', '1024', '--width', '576', '--frames', '145', '--frame-rate', '24',
    '--seed', String(shot.seed), '--output', videoPath,
  ];
  const castReference = cast[0]?.references?.[0];
  const shotReference = shot.referenceImage
    ? { path: path.resolve(shot.referenceImage), sha256: await sha256File(shot.referenceImage) }
    : null;
  const reference = castReference ?? shotReference;
  const referenceStrength = castReference ? 0.65 : 0.45;
  const finalReferenceStrength = castReference ? 0.55 : 0.45;
  if (reference) {
    generationArgs.push(
      '--image', reference.path, '0', String(referenceStrength),
      '--image', reference.path, '144', String(finalReferenceStrength),
    );
  }
  const execution = await runGuardedCommand('uv', generationArgs, {
    cwd: path.resolve('.reel-pipeline/engines/ltx-2-mlx'),
    maxRamPercent: 90,
    timeoutMs: 6 * 60 * 60 * 1000,
  });
  await applyTextSafeOverscan(videoPath);
  const metadata = await probeVideo(videoPath);
  const sha256 = await sha256File(videoPath);
  const receipt = {
    schema: 'fleet.ltx-mlx-episode-shot.v1',
    status: 'completed',
    episodeId: sample.id,
    shotId: shot.id,
    inputSignature,
    postprocessRevision: POSTPROCESS_REVISION,
    reference: reference ? {
      path: reference.path,
      sha256: reference.sha256,
      anchors: [
        { frame: 0, strength: referenceStrength },
        { frame: 144, strength: finalReferenceStrength },
      ],
    } : null,
    prompt: shot.prompt,
    seed: shot.seed,
    model: 'ltx-2.3-mlx-q4',
    runtime: VIDEO_FORGE_RUNTIME,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    peakRamPercent: execution.peakRamPercent,
    output: { path: videoPath, sha256, bytes: (await stat(videoPath)).size, metadata },
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { videoPath, receiptPath, sha256 };
}

async function applyTextSafeOverscan(videoPath) {
  const temporaryPath = `${videoPath}.overscan.mp4`;
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', videoPath,
    '-vf', 'crop=504:896:36:0,scale=576:1024:flags=lanczos,setsar=1',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'copy', temporaryPath,
  ], { timeout: 10 * 60 * 1000 });
  await rename(temporaryPath, videoPath);
}

async function rejectShotReview() {
  let run = await readJson(runPath);
  if (run?.schema !== LOCAL_EPISODE_RUN_SCHEMA || run.shots?.length !== 20) throw new Error('a complete 20-shot run is required before review rejection');
  await access(shotReviewPath);
  for (const shot of run.shots) {
    run = await setEpisodeShotReview(run, shot.id, 'rejected', { receiptPath: runPath });
  }
  const receiptPath = path.join(outputDir, 'shot-review-receipt.json');
  const receipt = {
    schema: 'fleet.studio-episode-shot-review.v1',
    status: 'rejected',
    episodeId: sample.id,
    reviewedAt: new Date().toISOString(),
    reviewSheet: shotReviewPath,
    findings: [
      'Character identity and wardrobe drift across the sequence.',
      'Visual treatment changes between animation styles and realistic imagery.',
      'Several frames contain unwanted pseudo-text despite the no-text direction.',
    ],
    next: 'Revise the prompt and reference-image contract, then render a new versioned proof.',
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ ...receipt, receiptPath }, null, 2));
}

async function acceptShotReviewAndAssemble(episode) {
  let run = await readJson(runPath);
  if (run?.schema !== LOCAL_EPISODE_RUN_SCHEMA || run.shots?.length !== 20) throw new Error('a complete 20-shot run is required before review acceptance');
  await access(shotReviewPath);
  for (const shot of run.shots) {
    run = await setEpisodeShotReview(run, shot.id, 'accepted', { receiptPath: runPath });
  }
  const result = await assembleLocalEpisode(run, { outputDir });
  await buildFinalReview(result.output.videoPath);
  console.log(JSON.stringify({
    status: 'final-needs-review',
    videoPath: result.output.videoPath,
    receiptPath: result.receiptPath,
    reviewSheet: finalReviewPath,
    next: 'Review the final video and contact sheet, then rerun with --accept-final.',
  }, null, 2));
}

async function acceptFinalReview() {
  const receiptPath = path.join(outputDir, 'assembly-receipt.json');
  const receipt = await readJson(receiptPath);
  if (receipt?.status !== 'completed') throw new Error('a completed assembly receipt is required');
  await access(receipt.output.videoPath);
  await access(finalReviewPath);
  const accepted = { ...receipt, reviewState: 'accepted', reviewedAt: new Date().toISOString() };
  await writeFile(receiptPath, `${JSON.stringify(accepted, null, 2)}\n`);
  console.log(JSON.stringify({ status: 'accepted', videoPath: receipt.output.videoPath, receiptPath, reviewSheet: finalReviewPath }, null, 2));
}

async function ensureOriginalScore() {
  if (await fileExists(scorePath)) return;
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `sine=frequency=73:sample_rate=48000:duration=${sample.targetDurationSeconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=110:sample_rate=48000:duration=${sample.targetDurationSeconds}`,
    '-filter_complex', '[0:a]volume=0.16,lowpass=f=900[a0];[1:a]volume=0.08,tremolo=f=0.15:d=0.65[a1];[a0][a1]amix=inputs=2:normalize=0,afade=t=in:st=0:d=2,afade=t=out:st=116:d=4[a]',
    '-map', '[a]', '-c:a', 'pcm_s16le', scorePath,
  ], { timeout: 10 * 60 * 1000 });
}

async function buildShotReview(shots) {
  const concatPath = path.join(outputDir, 'review-shots.txt');
  await writeFile(concatPath, `${shots.sort((a, b) => a.order - b.order).map((shot) => `file '${escapeConcatPath(shot.videoPath)}'`).join('\n')}\n`);
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concatPath,
    '-vf', 'fps=1/6,scale=216:384,tile=5x4:padding=8:margin=8:color=0x10131a', '-frames:v', '1', shotReviewPath,
  ], { timeout: 30 * 60 * 1000 });
}

async function buildFinalReview(videoPath) {
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', videoPath,
    '-vf', 'fps=1/10,scale=216:384,tile=4x3:padding=8:margin=8:color=0x10131a', '-frames:v', '1', finalReviewPath,
  ], { timeout: 30 * 60 * 1000 });
}

async function assertRuntimeReady() {
  const readiness = await checkForgeHost({ outputDir, minHeadroomGb: 14, minDiskGb: 20 });
  if (!readiness.ok) throw new Error(`LTX 2.3 episode runtime is not ready: ${readiness.failures.join('; ')}`);
}

async function assertResourceEnvelope() {
  const disk = await statfs(outputDir);
  const usedPercent = (1 - Number(disk.bavail) / Number(disk.blocks)) * 100;
  if (usedPercent >= 85) throw new Error(`episode render refused at ${usedPercent.toFixed(2)} percent disk use`);
}

async function probeVideo(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,r_frame_rate', '-of', 'json', filePath,
  ]);
  const payload = JSON.parse(stdout);
  if (!payload.streams?.some((stream) => stream.codec_name && stream.width > 0 && stream.height > 0)) throw new Error(`${filePath} has no decodable video stream`);
  return payload;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function fileExists(filePath) {
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
