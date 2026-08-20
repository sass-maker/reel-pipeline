#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

import { HtmlCompositionAdapter } from '../src/adapters/html-composition.js';
import { normalizeVideoBrief } from '../src/video-brief.js';
import { decorateRenderResult } from '../content-factory/src/manifest.js';

const args = parseArgs(process.argv.slice(2));
if (!args.brief) {
  console.error('usage: node scripts/export-html-composition.js --brief brief.json [--artifact-dir artifacts/html-composition]');
  process.exit(2);
}

const brief = normalizeVideoBrief(JSON.parse(await readFile(args.brief, 'utf8')));
const adapter = new HtmlCompositionAdapter({
  artifactDir: args.artifactDir,
});
const render = await decorateRenderResult({ brief, render: await adapter.createVideo(brief) });
console.log(JSON.stringify(render));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--brief') out.brief = argv[++i];
    if (arg === '--artifact-dir') out.artifactDir = argv[++i];
  }
  return out;
}
