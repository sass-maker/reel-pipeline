#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

import { AsciiAnimationAdapter } from '../src/adapters/ascii-animation.js';
import { normalizeVideoBrief } from '../src/video-brief.js';
import { decorateRenderResult } from '../content-factory/src/manifest.js';

const args = parseArgs(process.argv.slice(2));
if (!args.brief) {
  console.error('usage: node scripts/render-ascii-animation.js --brief <brief.json> [--artifact-dir <dir>]');
  process.exit(2);
}

try {
  const brief = normalizeVideoBrief(JSON.parse(await readFile(args.brief, 'utf8')));
  const adapter = new AsciiAnimationAdapter({
    artifactDir: args.artifactDir,
    ffmpegPath: args.ffmpegPath,
  });
  const render = await decorateRenderResult({ brief, render: await adapter.createVideo(brief) });
  process.stdout.write(`${JSON.stringify(render)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function parseArgs(values) {
  const parsed = {};
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value === '--brief') parsed.brief = values[++i];
    else if (value === '--artifact-dir') parsed.artifactDir = values[++i];
    else if (value === '--ffmpeg') parsed.ffmpegPath = values[++i];
  }
  return parsed;
}
