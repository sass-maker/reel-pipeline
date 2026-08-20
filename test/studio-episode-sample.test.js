import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import sample from '../config/studio-episode-sample.json' with { type: 'json' };

test('two-minute episode canary pins owned references and covers every shot once', async () => {
  assert.equal(sample.schema, 'fleet.studio-episode-sample.v1');
  assert.equal(sample.targetDurationSeconds, 120);
  assert.equal(sample.beats.length, 20);

  const shotIds = [...sample.character.shotIds, ...sample.environment.shotIds];
  assert.equal(new Set(shotIds).size, 20);
  assert.deepEqual(
    [...shotIds].sort(),
    Array.from({ length: 20 }, (_, index) => `shot-${String(index + 1).padStart(2, '0')}`),
  );

  await assertPinnedReference(sample.character.referenceImage, sample.character.referenceSha256);
  await assertPinnedReference(sample.environment.referenceImage, sample.environment.referenceSha256);
});

async function assertPinnedReference(relativePath, expectedSha256) {
  const bytes = await readFile(path.resolve(relativePath));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedSha256);
}
