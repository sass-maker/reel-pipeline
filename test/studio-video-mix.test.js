import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { executeVideoMix, validateMixVariantIds, VIDEO_MIX_SCHEMA } from '../src/studio/video-mix.js';

const KINETIC = 'web-motion--visualstyle-kinetic-type';
const EDITORIAL = 'web-motion--visualstyle-editorial-grid';
const BLENDER = 'blender-film--visualstyle-neon-tunnel';

test('style mix validation accepts two or three ordered known variants and fails closed', () => {
  assert.deepEqual(validateMixVariantIds([KINETIC, EDITORIAL]), [KINETIC, EDITORIAL]);
  assert.deepEqual(validateMixVariantIds([KINETIC, EDITORIAL, BLENDER]), [KINETIC, EDITORIAL, BLENDER]);
  assert.throws(() => validateMixVariantIds([KINETIC]), /two or three/);
  assert.throws(() => validateMixVariantIds([KINETIC, EDITORIAL, BLENDER, 'ascii-story--palette-amber']), /two or three/);
  assert.throws(() => validateMixVariantIds([KINETIC, KINETIC]), /duplicate/);
  assert.throws(() => validateMixVariantIds([KINETIC, 'unknown']), /unknown variant unknown/);
});

test('mixed fixture records base, influences, component hashes, and a playable artifact', async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'studio-video-mix-'));
  const result = await executeVideoMix({
    id: 'brief-mix',
    recipeId: 'web-motion',
  }, {
    variantIds: [KINETIC, EDITORIAL, BLENDER],
    outputDir,
    commandRunner: async (_command, args) => {
      assert.match(args[args.indexOf('-filter_complex') + 1], /blend=all_mode=screen/);
      await writeFile(args.at(-1), Buffer.from('playable mixed fixture'));
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.posture, 'mix');
  assert.equal(result.componentVariantIds.length, 3);
  assert.equal(result.provenance.components[0].role, 'base');
  assert.ok(result.provenance.components.slice(1).every((component) => component.role === 'influence'));
  assert.equal((await readFile(result.artifact.videoPath)).length, 22);
  const receipt = JSON.parse(await readFile(result.evidence.ownerManifestPath, 'utf8'));
  assert.equal(receipt.schema, VIDEO_MIX_SCHEMA);
  assert.equal(receipt.components[2].variantId, BLENDER);
  assert.match(receipt.artifact.sha256, /^[a-f0-9]{64}$/);
});
