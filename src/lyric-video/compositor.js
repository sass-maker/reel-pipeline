import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { BlenderAdapter } from '../adapters/blender.js';
import {
  buildLyricProductionManifest,
  normalizeLyricDetails,
} from './contracts.js';

const execFileAsync = promisify(execFile);
const DEFAULT_ARTIFACT_DIR = './artifacts/lyric-video';
const WIDTH = 540;
const HEIGHT = 960;
const FPS = 30;
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg']);

export async function renderLyricVideo(brief, options = {}) {
  if (brief?.kind !== 'lyric-video') throw new Error('lyric-video brief is required');
  if (options.confirm !== true) throw new Error('explicit confirmation is required before lyric rendering');

  const commandRunner = options.commandRunner ?? defaultCommandRunner;
  const now = options.now ?? (() => new Date());
  const taskId = `lyric_${safeSlug(brief.id)}_${now().getTime()}`;
  const runDir = path.resolve(options.artifactDir ?? DEFAULT_ARTIFACT_DIR, taskId);
  await mkdir(runDir, { recursive: true });

  const audioPath = await assertApprovedAudioPath(brief.lyric?.audioPath, options.audioRoots);
  const audioInfo = await probeMedia(audioPath, {
    commandRunner,
    ffprobePath: options.ffprobePath,
  });
  const audioDurationMs = Math.round(audioInfo.durationSeconds * 1000);
  const lyric = normalizeLyricDetails({
    ...brief.lyric,
    audioPath,
    audioDurationMs,
  });
  const blenderAdapter = options.blenderAdapter ?? new BlenderAdapter({
    artifactDir: path.join(runDir, 'blender'),
    ...(options.blender ?? {}),
  });
  const blenderCapability = lyric.useBlender
    ? await blenderAdapter.capability()
    : { ready: null, version: null, executable: null, blocker: null };
  const productionManifest = buildLyricProductionManifest({
    briefId: brief.id,
    title: brief.title,
    lyric,
    runtime: {
      blenderReady: blenderCapability.ready,
      blenderVersion: blenderCapability.version,
      blenderExecutable: blenderCapability.executable,
      blenderBlocker: blenderCapability.blocker,
    },
  });

  const audioHash = sha256(await readFile(audioPath));
  const blenderRender = lyric.useBlender
    ? await blenderAdapter.renderScenes({
      id: brief.id,
      scenes: lyric.scenePlan,
      width: options.width ?? WIDTH,
      height: options.height ?? HEIGHT,
      samples: options.samples ?? 8,
    })
    : null;
  const plates = blenderRender?.raw?.plates ?? [];

  const framesDir = path.join(runDir, 'frames');
  await mkdir(framesDir, { recursive: true });
  const frameInputs = lyric.cues.map((cue, index) => ({
    cue,
    scene: lyric.scenePlan[index],
    backgroundPath: plates[index]?.path ?? null,
    outputPath: path.join(framesDir, `cue-${String(index + 1).padStart(3, '0')}.png`),
    attribution: lyric.attribution,
    title: brief.title,
    cueNumber: index + 1,
    cueCount: lyric.cues.length,
    reducedMotion: lyric.reducedMotion,
  }));
  const frameRenderer = options.frameRenderer ?? renderLyricFrames;
  await frameRenderer(frameInputs, {
    width: options.width ?? WIDTH,
    height: options.height ?? HEIGHT,
  });

  const segmentsDir = path.join(runDir, 'segments');
  await mkdir(segmentsDir, { recursive: true });
  const segmentPaths = [];
  for (const [index, input] of frameInputs.entries()) {
    const segmentPath = path.join(segmentsDir, `segment-${String(index + 1).padStart(3, '0')}.mp4`);
    const cueDuration = (input.cue.endMs - input.cue.startMs) / 1000;
    const filter = lyric.reducedMotion
      ? `scale=${options.width ?? WIDTH}:${options.height ?? HEIGHT},format=yuv420p`
      : `scale=${options.width ?? WIDTH}:${options.height ?? HEIGHT},zoompan=z='min(zoom+0.0007,1.055)':d=1:s=${options.width ?? WIDTH}x${options.height ?? HEIGHT}:fps=${FPS},format=yuv420p`;
    await commandRunner(options.ffmpegPath ?? 'ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-loop', '1',
      '-i', input.outputPath,
      '-t', cueDuration.toFixed(3),
      '-vf', filter,
      '-r', String(FPS),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-an',
      segmentPath,
    ], { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
    segmentPaths.push(segmentPath);
  }

  const concatPath = path.join(runDir, 'segments.txt');
  await writeFile(concatPath, `${segmentPaths.map((entry) => `file '${escapeConcatPath(entry)}'`).join('\n')}\n`);
  const silentVideoPath = path.join(runDir, 'silent.mp4');
  await commandRunner(options.ffmpegPath ?? 'ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatPath,
    '-c', 'copy',
    silentVideoPath,
  ], { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });

  const videoPath = path.join(runDir, `${safeSlug(brief.title)}.mp4`);
  await commandRunner(options.ffmpegPath ?? 'ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', silentVideoPath,
    '-i', audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    videoPath,
  ], { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });

  const captionsPath = path.join(runDir, 'lyrics.srt');
  const scenePlanPath = path.join(runDir, 'literal-scene-plan.json');
  const rightsPath = path.join(runDir, 'rights.json');
  const manifestPath = path.join(runDir, 'production-manifest.json');
  const qualityPath = path.join(runDir, 'quality.json');
  await writeFile(captionsPath, buildSrt(lyric.cues));
  await writeFile(scenePlanPath, `${JSON.stringify(lyric.scenePlan, null, 2)}\n`);
  await writeFile(rightsPath, `${JSON.stringify(productionManifest.rights, null, 2)}\n`);

  const videoInfo = await probeMedia(videoPath, {
    commandRunner,
    ffprobePath: options.ffprobePath,
  });
  const artifacts = await hashArtifacts([
    ['audio', audioPath],
    ['video', videoPath],
    ['captions', captionsPath],
    ['scenePlan', scenePlanPath],
    ['rights', rightsPath],
    ...plates.map((plate, index) => [`blenderPlate${index + 1}`, plate.path]),
  ]);
  const quality = {
    schema: 'fleet.lyric-video-quality.v1',
    verdict: videoInfo.hasAudio
      && Math.abs(videoInfo.durationSeconds * 1000 - lyric.cues.at(-1).endMs) <= 350
      ? 'pass'
      : 'fail',
    durationSeconds: videoInfo.durationSeconds,
    audioPresent: videoInfo.hasAudio,
    cueCount: lyric.cues.length,
    sceneCount: lyric.scenePlan.length,
    cueCoverage: lyric.scenePlan.length / lyric.cues.length,
    exactLyricText: lyric.scenePlan.every((scene, index) => scene.lyric === lyric.cues[index].text),
    safeArea: { horizontalPx: 42, bottomPx: 74 },
    contrastBacking: true,
    reducedMotion: lyric.reducedMotion,
  };
  await writeFile(qualityPath, `${JSON.stringify(quality, null, 2)}\n`);

  const completedManifest = {
    ...productionManifest,
    generatedAt: now().toISOString(),
    audio: {
      path: audioPath,
      durationSeconds: audioInfo.durationSeconds,
      hasAudio: audioInfo.hasAudio,
      sha256: audioHash,
    },
    blender: blenderRender ? {
      provider: blenderRender.provider,
      version: blenderRender.raw.blenderVersion,
      executable: blenderRender.raw.blenderExecutable,
      builderVersion: blenderRender.raw.builderVersion,
      manifestHash: blenderRender.raw.manifestHash,
      plates: blenderRender.raw.plates,
    } : null,
    output: {
      videoPath,
      captionsPath,
      scenePlanPath,
      rightsPath,
      qualityPath,
      width: options.width ?? WIDTH,
      height: options.height ?? HEIGHT,
      fps: FPS,
    },
    artifacts,
    quality,
  };
  await writeFile(manifestPath, `${JSON.stringify(completedManifest, null, 2)}\n`);

  return {
    provider: 'lyric-video-local',
    externalTaskId: taskId,
    status: quality.verdict === 'pass' ? 'completed' : 'failed',
    videos: [videoPath],
    durationSeconds: videoInfo.durationSeconds,
    proofType: 'generated_card',
    captionText: lyric.cues[0].text,
    renderLog: [
      `cues=${lyric.cues.length}`,
      `literalScenes=${lyric.scenePlan.length}`,
      `blender=${lyric.useBlender ? blenderRender.raw.blenderVersion : 'not-requested'}`,
      `reducedMotion=${lyric.reducedMotion}`,
      `quality=${quality.verdict}`,
    ],
    raw: {
      aspect: '9:16',
      width: options.width ?? WIDTH,
      height: options.height ?? HEIGHT,
      fps: FPS,
      artifactDir: runDir,
      videoPath,
      captionsPath,
      scenePlanPath,
      rightsPath,
      qualityPath,
      manifestPath,
      artifacts,
      quality,
      blender: completedManifest.blender,
    },
  };
}

export async function renderLyricFrames(inputs, options = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: options.width ?? WIDTH, height: options.height ?? HEIGHT },
      deviceScaleFactor: 1,
    });
    for (const input of inputs) {
      const backgroundData = input.backgroundPath
        ? `data:image/png;base64,${(await readFile(input.backgroundPath)).toString('base64')}`
        : null;
      await page.setContent(frameHtml(input, backgroundData), { waitUntil: 'load' });
      await page.screenshot({ path: input.outputPath, type: 'png' });
    }
  } finally {
    await browser.close();
  }
}

export function buildSrt(cues) {
  return `${cues.map((cue, index) => [
    index + 1,
    `${srtTime(cue.startMs)} --> ${srtTime(cue.endMs)}`,
    cue.text,
  ].join('\n')).join('\n\n')}\n`;
}

function frameHtml(input, backgroundData) {
  const scene = input.scene;
  const background = backgroundData
    ? `<img class="plate" src="${backgroundData}" alt="">`
    : `<div class="native-plate"><span>${escapeHtml(scene.objects.join(' · '))}</span></div>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
  body {
    position: relative;
    color: #fffaf0;
    background: #07101e;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .plate { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .native-plate {
    position: absolute; inset: 0; display: grid; place-items: center;
    background: radial-gradient(circle at 50% 35%, #2359a2 0, #101d39 28%, #060b15 72%);
  }
  .native-plate span { color: #89bfff; font-size: 18px; max-width: 70%; text-align: center; }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgb(2 5 12 / 10%) 0%, rgb(2 5 12 / 22%) 45%, rgb(2 5 12 / 82%) 100%); }
  .progress { position: absolute; top: 28px; left: 30px; right: 30px; display: flex; gap: 5px; }
  .progress span { height: 3px; flex: 1; background: rgb(255 255 255 / 24%); border-radius: 2px; }
  .progress span.on { background: #ffd37a; }
  main { position: absolute; left: 42px; right: 42px; bottom: 74px; text-align: center; }
  h1 {
    margin: 0; padding: 22px 24px 24px; border-radius: 14px;
    background: rgb(3 8 17 / 78%); box-shadow: 0 14px 34px rgb(0 0 0 / 38%);
    font-size: clamp(38px, 9vw, 58px); line-height: 1.02; letter-spacing: -0.025em;
    text-wrap: balance;
  }
  footer { margin-top: 14px; color: #e2e9f4; font-size: 11px; line-height: 1.3; text-shadow: 0 2px 7px #000; }
</style>
</head>
<body>
  ${background}
  <div class="shade"></div>
  <div class="progress">${Array.from({ length: input.cueCount }, (_, index) => `<span class="${index < input.cueNumber ? 'on' : ''}"></span>`).join('')}</div>
  <main>
    <h1>${escapeHtml(input.cue.text)}</h1>
    <footer>${escapeHtml(input.attribution)}</footer>
  </main>
</body>
</html>`;
}

async function assertApprovedAudioPath(value, roots) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('an approved local audio file is required');
  const resolved = path.resolve(value);
  const allowedRoots = (roots ?? [process.cwd()]).map((root) => path.resolve(root));
  if (!allowedRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error('audio path is outside approved roots');
  }
  if (!AUDIO_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    throw new Error('audio must be WAV, MP3, M4A, AAC, FLAC, or OGG');
  }
  const info = await stat(resolved).catch(() => null);
  if (!info?.isFile() || info.size < 44) throw new Error('approved audio file is missing or empty');
  return resolved;
}

async function probeMedia(filePath, options) {
  const result = await options.commandRunner(options.ffprobePath ?? 'ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type',
    '-of', 'json',
    filePath,
  ], { timeout: 30_000, maxBuffer: 1024 * 1024 });
  const parsed = JSON.parse(String(result.stdout ?? '{}'));
  const durationSeconds = Number(parsed.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`ffprobe could not determine media duration for ${path.basename(filePath)}`);
  }
  return {
    durationSeconds,
    hasAudio: parsed.streams?.some((stream) => stream.codec_type === 'audio') ?? false,
  };
}

async function hashArtifacts(entries) {
  const result = {};
  for (const [name, filePath] of entries) {
    const info = await stat(filePath);
    result[name] = { path: filePath, bytes: info.size, sha256: sha256(await readFile(filePath)) };
  }
  return result;
}

function escapeConcatPath(value) {
  return path.resolve(value).replaceAll("'", "'\\''");
}

function srtTime(milliseconds) {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${String(millis).padStart(3, '0')}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeSlug(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'lyric-video';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function defaultCommandRunner(binary, args, options) {
  return execFileAsync(binary, args, { ...options, shell: false });
}

export function lyricVideoArtifactUrl(filePath) {
  return pathToFileURL(filePath).href;
}
