import assert from 'node:assert/strict';
import test from 'node:test';

import registry from '../config/local-video-workflow-recipes.json' with { type: 'json' };
import {
  executeCoherentLocalFilm,
  selectWorkflowRecipe,
} from '../src/studio/local-video-executors.js';

test('retained local video recipes are parked and never reach an executor', async () => {
  assert.equal(selectWorkflowRecipe({ modelProfileId: 'auto' }, { qualityLane: 'preview' }), 'ltx-2b-comfy-i2v-preview');
  assert.equal(selectWorkflowRecipe({ modelProfileId: 'ltx-2.3-mlx-q4' }, {}), 'ltx-2.3-mlx-q4-final');
  assert.throws(() => selectWorkflowRecipe({ modelProfileId: 'minimax-h3-mlx-q4' }, {}), /unsupported local video model profile/i);

  let executed = false;
  await assert.rejects(executeCoherentLocalFilm({
    brief: { modelProfileId: 'auto' },
    inputs: {
      qualityLane: 'preview',
      prompt: 'A full-body adult hero walks through a neon alley as the camera tracks sideways.',
      referenceImage: '/tmp/reference.png',
    },
  }, {
    recipeOptions: { registry, rootDir: process.cwd() },
    verifyRecipeFiles: async () => ({ ready: true, failures: [] }),
    executeComfy: async () => {
      executed = true;
      return { videoPath: '/tmp/should-not-exist.mp4' };
    },
  }), /not ready.*parked/i);
  assert.equal(executed, false);
});
