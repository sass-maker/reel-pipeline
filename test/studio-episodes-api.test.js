import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { handleStudioRequest } from '../src/studio/api.js';

function requestBody(value) {
  return async () => structuredClone(value);
}

test('Studio episode API keeps planning but parks local shot rendering', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-episode-api-'));
  const referencePath = path.join(root, 'hero.png');
  const videoPath = path.join(root, 'shot.mp4');
  await writeFile(referencePath, 'character reference');
  await writeFile(videoPath, 'video');
  const character = {
    schema: 'fleet.character.v1', id: 'hero', revision: 1,
    createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z',
    name: 'Ari', role: 'hero', fictional: true, age: 30, adultConfirmed: true,
    consentPosture: 'affirmative', appearance: { coat: 'red' }, wardrobe: ['red coat'], palette: ['red'],
    promptTokens: ['adult hero'], negativeConstraints: [], continuityNotes: 'same red coat',
    references: [{ path: referencePath, label: 'front' }], sourcePosture: 'original', likenessPosture: 'fictional', likenessEvidence: null,
  };
  const options = {
    episodeStoreOptions: { rootDir: root },
    characterStore: { get: async () => character, list: async () => [character] },
    blenderCapability: { ready: true },
    htmlCapability: { ready: true },
    kokoroCapability: { ready: true },
    localVideoExecutionOptions: {
      recipeOptions: { rootDir: process.cwd() },
      verifyRecipeFiles: async () => ({ ready: true, failures: [] }),
      executeComfy: async () => ({
        videoPath,
        sha256: 'a'.repeat(64),
        ownerManifestPath: path.join(root, 'shot-receipt.json'),
      }),
    },
  };
  const planned = await handleStudioRequest('POST', '/studio/episodes', requestBody({
    id: 'api-episode',
    concept: 'An original adult hero races through a clockwork city.',
    targetDurationSeconds: 120,
    referenceImage: referencePath,
    cast: [{ characterId: 'hero', characterRevision: 1, voiceId: 'af_heart', referenceImage: referencePath }],
  }), options);
  assert.equal(planned.status, 201);
  assert.equal(planned.body.data.shots.length, 20);

  await assert.rejects(handleStudioRequest('POST', '/studio/episodes/api-episode/render', requestBody({
    confirm: true, shotId: 'shot-01', phase: 'preview',
  }), options), /generation is parked.*per-job budget/i);

  const listed = await handleStudioRequest('GET', '/studio/episodes', requestBody(null), options);
  assert.equal(listed.body.data[0].run, null);
});
