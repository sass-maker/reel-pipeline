#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

import { createDraftVideo } from '../src/pipeline.js';

const flags = parseFlags(process.argv.slice(2));
const fixturePath = flags.fixture ?? 'test/fixtures/render-mode-brief.json';
const mode = flags.mode ?? 'mock';

const records = JSON.parse(await readFile(fixturePath, 'utf8'));
const source = Array.isArray(records) ? records[0] : records;
if (!source) throw new Error(`render fixture is empty: ${fixturePath}`);
const modeInput = mode === 'night-out-carousel'
  ? {
      renderOptions: {
        assetManifestPath: 'test/fixtures/night-out-render-mode-assets.json',
        rightsEvidence: 'Repository-owned design evidence approved for the local render-mode smoke.',
      },
    }
  : {};

const job = await createDraftVideo({
  id: source.id,
  projectSlug: source.projectSlug ?? source.project_slug,
  channel: source.channel,
  title: source.title,
  hook: source.hook,
  body: source.body,
  cta: source.cta,
  renderMode: mode,
  ...modeInput,
}, {
  mode,
  mock: { artifactDir: './tmp/render-mode-smoke/artifacts' },
  grokVideo: { artifactDir: './tmp/render-mode-smoke/artifacts' },
  asciiAnimation: { artifactDir: './tmp/render-mode-smoke/artifacts' },
  htmlComposition: { artifactDir: './tmp/render-mode-smoke/artifacts' },
  nightOutCarousel: {
    artifactDir: './tmp/render-mode-smoke/artifacts',
    assetRoots: ['./test/fixtures', './artifacts'],
  },
  storeOptions: { dir: './tmp/render-mode-smoke/jobs' },
});

console.log(JSON.stringify({
  results: [{
    provider: job.render.provider,
    status: job.render.status,
    artifact_manifest_path: job.render.artifactManifestPath ?? null,
  }],
}, null, 2));

function parseFlags(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      values[current.slice(2)] = next;
      index += 1;
    }
  }
  return values;
}
