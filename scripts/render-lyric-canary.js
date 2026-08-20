#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderLyricVideo } from '../src/lyric-video/compositor.js';

if (isMain()) await main();

async function main() {
  const fixturePath = path.resolve('test/fixtures/lyrics/twinkle-literal-canary.json');
  const outputDir = path.resolve(process.argv[2] ?? 'artifacts/lyric-video-canary');
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  await mkdir(outputDir, { recursive: true });

  const audioPath = path.join(outputDir, 'twinkle-fleet-original.wav');
  const audioReceipt = synthesizeTwinkleWav(audioPath, fixture.recording);
  await writeFile(audioPath, audioReceipt.wav);
  await writeFile(path.join(outputDir, 'recording-provenance.json'), `${JSON.stringify({
    schema: 'fleet.original-recording-provenance.v1',
    fixture: fixturePath,
    generatedAt: new Date().toISOString(),
    output: audioPath,
    sampleRate: audioReceipt.sampleRate,
    sampleCount: audioReceipt.sampleCount,
    durationSeconds: audioReceipt.durationSeconds,
    sourceRecordingUsed: false,
    generator: 'scripts/render-lyric-canary.js',
    notes: audioReceipt.notes,
  }, null, 2)}\n`);

  const brief = {
    id: fixture.id,
    kind: 'lyric-video',
    projectSlug: 'reel-pipeline',
    channel: 'youtube_shorts',
    durationSeconds: fixture.durationSeconds,
    engine: 'blender',
    title: fixture.title,
    hook: fixture.timedLyrics.split('\n')[0].replace(/^\[[^\]]+\]/, ''),
    summary: 'A literal scene for every supplied public-domain lyric cue.',
    creativeDirection: 'Concrete night-sky imagery with exact lyrics and readable contrast treatment.',
    lyric: {
      audioPath,
      audioDurationMs: fixture.durationSeconds * 1000,
      timedLyrics: fixture.timedLyrics,
      timedLyricsFormat: fixture.timedLyricsFormat,
      attribution: fixture.attribution,
      rights: fixture.rights,
      visualStyle: fixture.visualStyle,
      useBlender: fixture.useBlender,
      reducedMotion: fixture.reducedMotion,
    },
  };

  const render = await renderLyricVideo(brief, {
    confirm: true,
    artifactDir: outputDir,
    audioRoots: [outputDir],
    samples: 8,
  });
  const result = {
    schema: 'fleet.lyric-video-canary-result.v1',
    status: render.status,
    provider: render.provider,
    videoPath: render.raw.videoPath,
    manifestPath: render.raw.manifestPath,
    qualityPath: render.raw.qualityPath,
    rightsPath: render.raw.rightsPath,
    captionsPath: render.raw.captionsPath,
    scenePlanPath: render.raw.scenePlanPath,
    blenderVersion: render.raw.blender?.version ?? null,
    quality: render.raw.quality,
  };
  await writeFile(path.join(outputDir, 'latest-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

export function synthesizeTwinkleWav(_outputPath, recording = {}) {
  const sampleRate = Number(recording.sampleRate ?? 44_100);
  const phrases = [
    [['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2]],
    [['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2]],
    [['G4', 1], ['G4', 1], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 2]],
    [['G4', 1], ['G4', 1], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 2]],
  ];
  const beatSeconds = 0.375;
  const notes = phrases.flat();
  const durationSeconds = notes.reduce((sum, [, beats]) => sum + beats * beatSeconds, 0);
  const sampleCount = Math.round(durationSeconds * sampleRate);
  const pcm = Buffer.alloc(sampleCount * 2);
  let cursor = 0;
  let phase = 0;
  for (const [name, beats] of notes) {
    const frequency = noteFrequency(name);
    const noteSamples = Math.round(beats * beatSeconds * sampleRate);
    for (let index = 0; index < noteSamples && cursor < sampleCount; index += 1, cursor += 1) {
      const position = index / Math.max(1, noteSamples - 1);
      const envelope = Math.min(1, position / 0.04, (1 - position) / 0.08);
      phase += (2 * Math.PI * frequency) / sampleRate;
      const signal = (Math.sin(phase) * 0.72 + Math.sin(phase * 2) * 0.18) * envelope;
      pcm.writeInt16LE(Math.round(signal * 16_000), cursor * 2);
    }
  }
  const wav = wavBuffer(pcm, sampleRate, 1, 16);
  return {
    wav,
    sampleRate,
    sampleCount,
    durationSeconds,
    notes: notes.map(([name, beats]) => ({ name, beats })),
  };
}

function noteFrequency(name) {
  return {
    C4: 261.6256,
    D4: 293.6648,
    E4: 329.6276,
    F4: 349.2282,
    G4: 391.9954,
    A4: 440,
  }[name];
}

function wavBuffer(pcm, sampleRate, channels, bitsPerSample) {
  const header = Buffer.alloc(44);
  const blockAlign = channels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function isMain() {
  return Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
