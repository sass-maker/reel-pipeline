#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTPUT_ROOT = path.join(ROOT, 'fixtures/video-gallery/proofs/blender');
const FRAME_ROOT = path.join(ROOT, 'tmp/blender-gallery-range-frames');
const BUILDER = path.join(ROOT, 'scripts/blender/gallery_range_builder.py');
const BLENDER = process.env.BLENDER_PATH ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const STYLES = [
  'cosmic-shrine',
  'brutalist-monument',
  'glass-studio',
  'low-poly-valley',
  'organic-bloom',
  'kinetic-sculpture',
  'neon-tunnel',
  'paper-diorama',
];

await mkdir(OUTPUT_ROOT, { recursive: true });
await mkdir(FRAME_ROOT, { recursive: true });
const versionResult = await execFileAsync(BLENDER, ['--version'], { maxBuffer: 1024 * 1024 });
const version = versionResult.stdout.match(/Blender\s+(\d+\.\d+\.\d+)/)?.[1];
if (!version?.startsWith('5.2.')) throw new Error(`Blender 5.2.x is required, found ${version ?? 'unknown'}`);

const renderResult = await execFileAsync(BLENDER, [
  '--background',
  '--factory-startup',
  '--disable-autoexec',
  '--python',
  BUILDER,
  '--',
  '--output',
  FRAME_ROOT,
], { timeout: 20 * 60_000, maxBuffer: 64 * 1024 * 1024 });
const renderLog = `${renderResult.stdout ?? ''}\n${renderResult.stderr ?? ''}`;
if (/Traceback \(most recent call last\):|Error: Python:/i.test(renderLog)) {
  throw new Error(`Blender range render failed: ${renderLog.replace(/\s+/g, ' ').trim().slice(-4_000)}`);
}

const items = [];
for (const visualStyle of STYLES) {
  const source = path.join(OUTPUT_ROOT, `${visualStyle}.mp4`);
  await execFileAsync(process.env.FFMPEG_PATH ?? 'ffmpeg', [
    '-y', '-loglevel', 'error',
    '-framerate', '12',
    '-i', path.join(FRAME_ROOT, visualStyle, 'frame_%04d.png'),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    source,
  ], { timeout: 5 * 60_000, maxBuffer: 16 * 1024 * 1024 });
  const bytes = await readFile(source);
  const info = await stat(source);
  if (!info.isFile() || info.size < 8) throw new Error(`Blender proof missing: ${visualStyle}`);
  items.push({
    variantId: `blender-film--visualstyle-${visualStyle}`,
    visualStyle,
    source: path.relative(ROOT, source),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: info.size,
  });
}

const evidence = {
  schema: 'fleet.blender-gallery-range-proof.v1',
  renderer: 'blender-eevee-animation@1',
  blenderVersion: version,
  builder: path.relative(ROOT, BUILDER),
  rights: 'Original deterministic procedural geometry, materials, lighting, and animation.',
  generatedAt: new Date().toISOString(),
  items,
};
await writeFile(path.join(OUTPUT_ROOT, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ status: 'completed', blenderVersion: version, rendered: items.length, output: path.relative(ROOT, OUTPUT_ROOT) }, null, 2));
