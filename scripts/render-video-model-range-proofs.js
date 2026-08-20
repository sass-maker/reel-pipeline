#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  VIDEO_FORGE_RUNTIME,
  buildLtxCommand,
  checkForgeHost,
  loadForgeProject,
} from '../src/local-video-forge.js';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTPUT_ROOT = path.join(ROOT, 'fixtures/video-gallery/proofs/video-model');
const PROJECT_PATH = path.join(OUTPUT_ROOT, 'project.json');
const options = parseOptions(process.argv.slice(2));
const runtimeDir = path.resolve(options.runtimeDir ?? path.join(ROOT, '.reel-pipeline/engines/ltx-2-mlx'));
const modelDir = path.resolve(options.modelDir ?? path.join(ROOT, '.reel-pipeline/models/ltx-2.3-mlx-q4'));

await mkdir(OUTPUT_ROOT, { recursive: true });
const readiness = await checkForgeHost({
  runtimeDir,
  modelDir,
  outputDir: OUTPUT_ROOT,
  minHeadroomGb: 12,
});
if (!readiness.ok) throw new Error(`local video-model proof host is not ready: ${readiness.failures.join('; ')}`);

const project = await loadForgeProject(PROJECT_PATH);
const items = [];
for (const shot of project.shots) {
  const seed = shot.preview.seeds[0];
  const source = path.join(OUTPUT_ROOT, `${shot.id}.mp4`);
  const spec = buildLtxCommand(shot, seed, source, { runtimeDir, modelDir });
  const startedAt = new Date();
  await execFileAsync(spec.command, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, HF_HUB_DISABLE_XET: '1' },
    timeout: 30 * 60_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const bytes = await readFile(source);
  const info = await stat(source);
  items.push({
    variantId: variantIdFor(shot.id),
    shotId: shot.id,
    source: path.relative(ROOT, source),
    sha256: sha256(bytes),
    bytes: info.size,
    seed,
    prompt: shot.motionPrompt,
    negativePrompt: shot.negativePrompt,
    keyframe: path.relative(ROOT, shot.keyframePath),
    keyframeSha256: sha256(await readFile(shot.keyframePath)),
    preset: spec.preset,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
  });
  process.stdout.write(`rendered ${shot.id}\n`);
}

const evidence = {
  schema: 'fleet.local-video-model-gallery-range-proof.v1',
  renderer: 'ltx-2.3-mlx-q4',
  runtime: VIDEO_FORGE_RUNTIME,
  project: path.relative(ROOT, PROJECT_PATH),
  rights: 'Original Fleet-generated keyframes approved for local image-to-video capability proofs; no customer or commercial media.',
  disclosure: 'Synthetic image-to-video examples; not real customer footage or testimonials.',
  generatedAt: new Date().toISOString(),
  items,
};
await writeFile(path.join(OUTPUT_ROOT, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ status: 'completed', rendered: items.length, output: path.relative(ROOT, OUTPUT_ROOT) }, null, 2));

function parseOptions(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--') continue;
    if (args[index] === '--runtime-dir') result.runtimeDir = args[++index];
    else if (args[index] === '--model-dir') result.modelDir = args[++index];
    else throw new Error(`unknown option: ${args[index]}`);
  }
  return result;
}

function variantIdFor(shotId) {
  const ids = {
    'strict-continuity': 'coherent-local-film--continuity-strict',
    'balanced-object-motion': 'coherent-local-film--continuity-balanced',
    'experimental-transformation': 'coherent-local-film--continuity-experimental',
  };
  return ids[shotId];
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
