import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { isKokoroReady, KokoroTts } from '../adapters/kokoro.js';

const execFileAsync = promisify(execFile);

async function run(command, args, options = {}) {
  return execFileAsync(command, args, { maxBuffer: 1024 * 1024 * 32, ...options });
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function requireFile(filePath, label) {
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile() || info.size === 0) throw new Error(`${label} is missing or empty: ${filePath}`);
  return info;
}

export async function probeAudio(filePath, { ffmpegPath = 'ffmpeg', ffprobePath = 'ffprobe' } = {}) {
  const { stdout } = await run(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const durationSeconds = Number.parseFloat(stdout.trim());
  const { stderr } = await run(ffmpegPath, [
    '-hide_banner', '-nostats',
    '-i', filePath,
    '-af', 'volumedetect',
    '-f', 'null', '-',
  ]);
  const meanDb = Number.parseFloat(stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1] ?? 'NaN');
  const peakDb = Number.parseFloat(stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1] ?? 'NaN');
  return {
    durationSeconds,
    meanDb: Number.isFinite(meanDb) ? meanDb : null,
    peakDb: Number.isFinite(peakDb) ? peakDb : null,
    bytes: (await stat(filePath)).size,
    sha256: await sha256(filePath),
  };
}

async function masterSpeech(inputPath, outputPath, durationSeconds, runtime) {
  const fadeOutStart = Math.max(0, durationSeconds - 0.08);
  await run(runtime.ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', inputPath,
    '-af', `highpass=f=75,acompressor=threshold=-20dB:ratio=2.2:attack=12:release=120:makeup=1.4,alimiter=limit=0.93,apad,atrim=0:${durationSeconds},afade=t=out:st=${fadeOutStart}:d=0.08,aresample=48000`,
    '-ac', '2',
    '-c:a', 'pcm_s24le',
    outputPath,
  ]);
}

async function assembleNarrationScenes(sceneFiles, plan, outputPath, runtime) {
  const inputs = [];
  const filters = [];
  const labels = [];
  for (const [index, scene] of plan.scenes.entries()) {
    const sceneFile = sceneFiles[index].path;
    const metrics = await probeAudio(sceneFile, runtime);
    const available = scene.durationSeconds - 0.2;
    if (metrics.durationSeconds > available) {
      throw new Error(`narration for scene ${scene.id} is ${metrics.durationSeconds.toFixed(2)}s but only ${available.toFixed(2)}s is available`);
    }
    inputs.push('-i', sceneFile);
    const label = `voice${index}`;
    filters.push(
      `[${index}:a]atrim=0:${available},asetpts=N/SR/TB,apad=pad_dur=${scene.durationSeconds},atrim=0:${scene.durationSeconds},adelay=${Math.round(scene.start * 1000)}:all=1[${label}]`,
    );
    labels.push(`[${label}]`);
  }
  filters.push(
    `${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0,atrim=0:${plan.totalDurationSeconds},highpass=f=75,acompressor=threshold=-20dB:ratio=2.2:attack=12:release=120:makeup=1.4,alimiter=limit=0.93,aresample=48000[narration]`,
  );
  await run(runtime.ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[narration]',
    '-ac', '2',
    '-c:a', 'pcm_s24le',
    outputPath,
  ]);
}

export async function prepareNarration({ plan, runDir, sourceRoot, runtime }) {
  const audioDir = path.join(runDir, 'audio');
  const sceneDir = path.join(audioDir, 'voice-scenes');
  await mkdir(sceneDir, { recursive: true });
  const outputPath = path.join(audioDir, 'narration.wav');
  let source;
  if (plan.narration.mode === 'kokoro') {
    if (!isKokoroReady(runtime.kokoroDir)) {
      throw new Error(`Kokoro narration is required but unavailable under ${runtime.kokoroDir}`);
    }
    const tts = new KokoroTts({
      kokoroDir: runtime.kokoroDir,
      voice: plan.narration.voice,
      speed: plan.narration.speed,
      lang: plan.narration.lang,
    });
    const sceneFiles = await tts.synthesizeScenes(
      plan.scenes.map((scene) => ({ narration: scene.narration })),
      { outputDir: sceneDir },
    );
    await assembleNarrationScenes(sceneFiles, plan, outputPath, runtime);
    source = {
      mode: 'kokoro',
      engine: 'kokoro-onnx-v1.0',
      voice: plan.narration.voice,
      speed: plan.narration.speed,
      language: plan.narration.lang,
      sceneHashes: Object.fromEntries(await Promise.all(sceneFiles.map(async (entry, index) => [
        plan.scenes[index].id,
        await sha256(entry.path),
      ]))),
    };
  } else {
    const sourcePath = path.resolve(sourceRoot, plan.narration.source);
    await requireFile(sourcePath, 'narration source');
    const copiedSource = path.join(audioDir, `narration-source${path.extname(sourcePath)}`);
    await copyFile(sourcePath, copiedSource);
    await masterSpeech(copiedSource, outputPath, plan.totalDurationSeconds, runtime);
    source = {
      mode: 'file',
      source: plan.narration.source,
      sourceType: plan.narration.sourceType,
      license: plan.narration.license,
      sourceSha256: await sha256(copiedSource),
    };
  }
  return { path: outputPath, source, metrics: await probeAudio(outputPath, runtime) };
}

const CHORDS = [
  [130.81, 261.63, 329.63, 392.00],
  [110.00, 220.00, 261.63, 329.63],
  [87.31, 174.61, 220.00, 261.63],
  [98.00, 196.00, 246.94, 293.66],
];

async function renderMusicSegment({ frequencies, duration, index, outputPath, runtime, energy }) {
  const inputs = frequencies.flatMap((frequency) => [
    '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=${duration}`,
  ]);
  inputs.push('-f', 'lavfi', '-i', `anoisesrc=color=pink:sample_rate=48000:duration=${duration}`);
  const noiseIndex = frequencies.length;
  const fadeOut = Math.max(0, duration - 0.12);
  const filters = [
    `[0:a]lowpass=f=240,volume=${(0.12 * energy).toFixed(3)}[bass]`,
    `[1:a]lowpass=f=1800,tremolo=f=0.24:d=0.36,volume=${(0.075 * energy).toFixed(3)}[root]`,
    `[2:a]lowpass=f=2200,tremolo=f=0.20:d=0.31,volume=${(0.055 * energy).toFixed(3)}[third]`,
    `[3:a]lowpass=f=2500,tremolo=f=0.17:d=0.28,volume=${(0.045 * energy).toFixed(3)}[fifth]`,
    `[${noiseIndex}:a]highpass=f=5200,lowpass=f=10500,tremolo=f=${index < 2 ? 2 : 4}:d=0.92,volume=${(0.012 * energy).toFixed(3)}[air]`,
    `[bass][root][third][fifth][air]amix=inputs=5:normalize=0,aecho=0.75:0.32:55|110:0.16|0.08,afade=t=in:st=0:d=0.12,afade=t=out:st=${fadeOut}:d=0.12,pan=stereo|c0=c0|c1=c0[segment]`,
  ];
  await run(runtime.ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[segment]',
    '-c:a', 'pcm_s24le',
    outputPath,
  ]);
}

export async function generateArrangedMusicBed({ durationSeconds, outputPath, recipePath, runtime }) {
  const segmentDir = path.join(path.dirname(outputPath), 'music-segments');
  await mkdir(segmentDir, { recursive: true });
  const segmentDuration = 4;
  const segmentCount = Math.ceil(durationSeconds / segmentDuration);
  const segmentPaths = [];
  const arrangement = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const duration = Math.min(segmentDuration, durationSeconds - index * segmentDuration);
    const frequencies = CHORDS[index % CHORDS.length];
    const energy = 0.78 + (index / Math.max(1, segmentCount - 1)) * 0.32;
    const segmentPath = path.join(segmentDir, `segment-${String(index + 1).padStart(2, '0')}.wav`);
    await renderMusicSegment({ frequencies, duration, index, outputPath: segmentPath, runtime, energy });
    segmentPaths.push(segmentPath);
    arrangement.push({ index, start: index * segmentDuration, duration, frequencies, energy });
  }
  const inputs = segmentPaths.flatMap((segmentPath) => ['-i', segmentPath]);
  const labels = segmentPaths.map((_, index) => `[${index}:a]`).join('');
  const fadeOutStart = Math.max(0, durationSeconds - 1.4);
  await run(runtime.ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...inputs,
    '-filter_complex', `${labels}concat=n=${segmentPaths.length}:v=0:a=1,atrim=0:${durationSeconds},afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutStart}:d=1.4,loudnorm=I=-23:TP=-3:LRA=8[music]`,
    '-map', '[music]',
    '-ac', '2',
    '-c:a', 'pcm_s24le',
    outputPath,
  ]);
  const recipe = {
    schema: 'fleet.procedural-music-bed.v1',
    recipe: 'fleet-arranged-bed@1',
    license: 'Fleet-authored procedural audio',
    durationSeconds,
    arrangement,
    synthesis: ['four-note chord voicing', 'bass', 'pulsed pink-noise air', 'echo space', 'energy ramp', 'resolved fade'],
  };
  await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`);
  return recipe;
}

export async function prepareMusic({ plan, runDir, sourceRoot, runtime }) {
  const audioDir = path.join(runDir, 'audio');
  await mkdir(audioDir, { recursive: true });
  const outputPath = path.join(audioDir, 'music.wav');
  let source;
  if (plan.music.mode === 'generated') {
    const recipePath = path.join(audioDir, 'music-recipe.json');
    const recipe = await generateArrangedMusicBed({
      durationSeconds: plan.totalDurationSeconds,
      outputPath,
      recipePath,
      runtime,
    });
    source = { mode: 'generated', recipe: plan.music.recipe, mood: plan.music.mood, recipePath, license: recipe.license };
  } else {
    const sourcePath = path.resolve(sourceRoot, plan.music.source);
    await requireFile(sourcePath, 'music source');
    const copiedSource = path.join(audioDir, `music-source${path.extname(sourcePath)}`);
    await copyFile(sourcePath, copiedSource);
    const fadeOutStart = Math.max(0, plan.totalDurationSeconds - 1.4);
    await run(runtime.ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-stream_loop', '-1', '-i', copiedSource,
      '-af', `atrim=0:${plan.totalDurationSeconds},afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOutStart}:d=1.4,loudnorm=I=-23:TP=-3:LRA=8,aresample=48000`,
      '-ac', '2',
      '-c:a', 'pcm_s24le',
      outputPath,
    ]);
    source = {
      mode: 'file',
      source: plan.music.source,
      sourceType: plan.music.sourceType,
      license: plan.music.license,
      sourceSha256: await sha256(copiedSource),
    };
  }
  return { path: outputPath, source, metrics: await probeAudio(outputPath, runtime) };
}

export async function masterPostReadyVideo({ picturePath, narrationPath, musicPath, outputPath, mixPath, durationSeconds, runtime }) {
  const fadeOutStart = Math.max(0, durationSeconds - 1.2);
  const mixFilter = [
    `[1:a]highpass=f=75,acompressor=threshold=-20dB:ratio=2.2:attack=12:release=120:makeup=1.4,alimiter=limit=0.93,asplit=2[voice][sidechain]`,
    `[2:a]afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOutStart}:d=1.2,volume=0.95[bed]`,
    `[bed][sidechain]sidechaincompress=threshold=0.025:ratio=8:attack=18:release=360:makeup=1[ducked]`,
    `[voice][ducked]amix=inputs=2:duration=longest:normalize=0,atrim=0:${durationSeconds},loudnorm=I=-14:TP=-1.5:LRA=9[mix]`,
  ].join(';');
  await run(runtime.ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', picturePath,
    '-i', narrationPath,
    '-i', musicPath,
    '-filter_complex', mixFilter,
    '-map', '0:v:0',
    '-map', '[mix]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '256k',
    '-t', String(durationSeconds),
    '-movflags', '+faststart',
    outputPath,
  ]);
  await run(runtime.ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', outputPath,
    '-vn', '-c:a', 'pcm_s24le',
    mixPath,
  ]);
  return {
    filter: mixFilter,
    metrics: await probeAudio(mixPath, runtime),
  };
}
