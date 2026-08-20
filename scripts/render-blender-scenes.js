#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

import { BlenderAdapter } from '../src/adapters/blender.js';
import { normalizeVideoBrief } from '../src/video-brief.js';
import { decorateRenderResult } from '../content-factory/src/manifest.js';

const args = parseArgs(process.argv.slice(2));
if (!args.brief) {
  console.error('usage: node scripts/render-blender-scenes.js --brief <brief.json> [--artifact-dir <dir>]');
  process.exit(2);
}

try {
  const brief = normalizeVideoBrief(JSON.parse(await readFile(args.brief, 'utf8')));
  const adapter = new BlenderAdapter({ artifactDir: args.artifactDir });
  const render = await decorateRenderResult({
    brief,
    render: await adapter.createVideo(brief),
    rendererVersion: 'reel-pipeline-blender-v1',
  });
  process.stdout.write(`${JSON.stringify(render)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--brief') parsed.brief = values[++index];
    else if (values[index] === '--artifact-dir') parsed.artifactDir = values[++index];
  }
  return parsed;
}
