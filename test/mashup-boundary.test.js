import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const RUNTIME_SURFACES = [
  'package.json',
  'src/studio/voice-intake.js',
  'src/studio/execution-registry.js',
  'src/adapters/podcast-edit.js',
];

test('Reel Pipeline has no runtime path into Mashup source or state', async () => {
  const contents = await Promise.all(RUNTIME_SURFACES.map((file) => readFile(file, 'utf8')));
  const joined = contents.join('\n');
  assert.doesNotMatch(joined, /--project\s+editorial|foundry\/helpers\/mashup|mashup\.ingest|reel-editorial/);
  assert.match(joined, /fleet\.mashup-media-receipt\.v1/);
});
