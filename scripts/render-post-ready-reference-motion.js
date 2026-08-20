#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  VIDEO_FORGE_RUNTIME,
  buildLtxCommand,
  checkForgeHost,
  loadForgeProject,
  selectForgeShot,
} from '../src/local-video-forge.js';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_PATH = path.join(ROOT, 'fixtures/post-ready/reference-protected-hour/video-project.json');
const OUTPUT_PATH = path.join(ROOT, 'fixtures/post-ready/reference-protected-hour/assets/scene-03-motion.mp4');

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--runtime-dir') options.runtimeDir = path.resolve(argv[++index]);
    else if (argv[index] === '--model-dir') options.modelDir = path.resolve(argv[++index]);
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const runtimeDir = options.runtimeDir ?? path.join(ROOT, '.reel-pipeline/engines/ltx-2-mlx');
const modelDir = options.modelDir ?? path.join(ROOT, '.reel-pipeline/models/ltx-2.3-mlx-q4');
const readiness = await checkForgeHost({ runtimeDir, modelDir, outputDir: path.dirname(OUTPUT_PATH), minHeadroomGb: 12 });
if (!readiness.ok) throw new Error(`reference motion runtime is not ready: ${readiness.failures.join('; ')}`);

const project = await loadForgeProject(PROJECT_PATH);
const shot = selectForgeShot(project, 'watercolor-stroke');
const seed = shot.preview.seeds[0];
const spec = buildLtxCommand(shot, seed, OUTPUT_PATH, { runtimeDir, modelDir });
const startedAt = new Date();
await execFileAsync(spec.command, spec.args, {
  cwd: spec.cwd,
  env: { ...process.env, HF_HUB_DISABLE_XET: '1' },
  timeout: 30 * 60_000,
  maxBuffer: 64 * 1024 * 1024,
});
const bytes = await readFile(OUTPUT_PATH);
const evidence = {
  schema: 'fleet.post-ready-reference-motion.v1',
  renderer: 'ltx-2.3-mlx-q4',
  runtime: VIDEO_FORGE_RUNTIME,
  project: path.relative(ROOT, PROJECT_PATH),
  output: path.relative(ROOT, OUTPUT_PATH),
  outputSha256: createHash('sha256').update(bytes).digest('hex'),
  outputBytes: (await stat(OUTPUT_PATH)).size,
  seed,
  prompt: shot.motionPrompt,
  negativePrompt: shot.negativePrompt,
  keyframe: path.relative(ROOT, shot.keyframePath),
  keyframeSha256: createHash('sha256').update(await readFile(shot.keyframePath)).digest('hex'),
  preset: spec.preset,
  rights: 'Fleet-owned motion generated locally from a Fleet-owned approved image.',
  startedAt: startedAt.toISOString(),
  completedAt: new Date().toISOString()
};
await writeFile(path.join(path.dirname(OUTPUT_PATH), 'scene-03-motion.evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
