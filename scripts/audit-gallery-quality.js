#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(root, 'config/explore-gallery-representatives.json');
const reviewPath = path.join(root, 'config/explore-gallery-quality-review.json');
const outputRoot = path.resolve(process.argv[2] ?? path.join(root, 'artifacts/gallery-quality-audit'));
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const review = JSON.parse(await readFile(reviewPath, 'utf8'));
const reviewsById = new Map(review.reviews.map((item) => [item.id, item]));

await mkdir(outputRoot, { recursive: true });
const results = [];

for (const item of registry.items) {
  const qualityReview = reviewsById.get(item.id);
  if (!qualityReview) throw new Error(`${item.id}: missing quality review`);
  if (qualityReview.decision === 'removed') throw new Error(`${item.id}: removed proof cannot remain visible`);
  const source = path.resolve(root, item.source);
  const itemRoot = path.join(outputRoot, item.id);
  await mkdir(itemRoot, { recursive: true });
  const probe = await probeMedia(source);
  const framePattern = path.join(itemRoot, 'frame-%02d.jpg');
  const contactPath = path.join(itemRoot, 'contact.jpg');

  await execFileAsync('ffmpeg', ['-v', 'error', '-i', source, '-f', 'null', '-']);
  await execFileAsync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', source,
    '-vf', 'fps=1,scale=360:-2:flags=lanczos',
    '-q:v', '3', framePattern,
  ]);
  await execFileAsync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', source,
    '-vf', 'fps=1,scale=270:-2:flags=lanczos,tile=4x3:padding=4:margin=4:color=0x090b0c',
    '-frames:v', '1', '-q:v', '3', contactPath,
  ]);

  results.push({
    id: item.id,
    family: item.family,
    title: item.title,
    source: path.relative(root, source),
    durationSeconds: probe.durationSeconds,
    width: probe.width,
    height: probe.height,
    frameRate: probe.frameRate,
    fullDecodePassed: true,
    sampledFrames: Math.max(1, Math.floor(probe.durationSeconds)),
    framePattern: path.relative(outputRoot, framePattern),
    contactSheet: path.relative(outputRoot, contactPath),
    review: {
      score: qualityReview.score,
      decision: qualityReview.decision,
      reason: qualityReview.reason,
    },
  });
  process.stdout.write(`${item.id}: ${results.at(-1).sampledFrames} frames\n`);
}

const summary = {
  schema: 'fleet.gallery-quality-frame-audit.v1',
  cadenceSeconds: 1,
  generatedAt: new Date().toISOString(),
  proofCount: results.length,
  items: results,
};
await writeFile(path.join(outputRoot, 'frame-audit.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ status: 'completed', proofCount: results.length, output: outputRoot }, null, 2));

async function probeMedia(source) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
    '-of', 'json', source,
  ]);
  const data = JSON.parse(stdout);
  const stream = data.streams?.[0] ?? {};
  return {
    durationSeconds: Number(data.format?.duration ?? 0),
    width: Number(stream.width ?? 0),
    height: Number(stream.height ?? 0),
    frameRate: stream.r_frame_rate ?? null,
  };
}
