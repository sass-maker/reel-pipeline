import assert from 'node:assert/strict';
import test from 'node:test';

import {
  POST_READY_SCHEMA,
  buildCoherentFilmFromPlan,
  createProductionReceipt,
  finalizeProductionReceipt,
  normalizeEditorialReview,
  normalizePostReadyBrief,
} from '../src/post-ready/contract.js';
import { resolvePostReadyRuntimePaths } from '../src/post-ready/runtime.js';

function brief() {
  return {
    schema: POST_READY_SCHEMA,
    id: 'reference-reel',
    title: 'Reference reel',
    hook: 'Your week is not a blur.',
    closingBeat: 'Make one week count.',
    musicIntent: 'Warm pulse that grows and resolves.',
    approval: { status: 'approved', approvedBy: 'owner', approvedAt: '2026-08-03T00:00:00Z' },
    format: { width: 1080, height: 1920, fps: 30 },
    narration: { mode: 'kokoro', voice: 'af_heart', speed: 1 },
    music: { mode: 'generated', mood: 'warm determined' },
    scenes: [
      scene('hook', 'setup', 5, 'Your week is not a blur.', 'Your week is not a blur.', 'slow-push'),
      scene('tension', 'tension', 5, 'It disappears when nothing marks it.', 'Unmarked time disappears.', 'focus-pull'),
      scene('proof', 'proof', 5, 'One visible choice changes the pattern.', 'One visible choice.', 'mask-reveal'),
      scene('verdict', 'verdict', 5, 'A small ritual turns time into memory.', 'Turn time into memory.', 'parallax'),
      scene('close', 'close', 5, 'Make one week count.', 'Make one week count.', 'slow-pull'),
    ],
  };
}

function scene(id, role, durationSeconds, narration, caption, motion) {
  return {
    id,
    role,
    durationSeconds,
    purpose: `Purpose for ${id}`,
    narration,
    caption,
    transition: 'fade',
    visual: {
      kind: 'image',
      source: `assets/${id}.png`,
      sourceType: 'project-owned',
      license: 'Fleet-owned',
      tier: 'production-safe',
      motion,
    },
  };
}

test('normalizes a complete timed plan and maps purposeful motion into a coherent film', () => {
  const plan = normalizePostReadyBrief(brief(), { sourcePath: '/tmp/reference.json' });
  assert.equal(plan.totalDurationSeconds, 25);
  assert.deepEqual(plan.scenes.map(({ start, end }) => [start, end]), [[0, 5], [5, 10], [10, 15], [15, 20], [20, 25]]);
  const visuals = plan.scenes.map((entry) => ({ sceneId: entry.id, ...entry.visual }));
  const film = buildCoherentFilmFromPlan(plan, visuals);
  assert.equal(film.assets.length, 5);
  assert.equal(film.scenes[1].dominant.kind, 'focus-pull');
  assert.equal(film.scenes[2].dominant.kind, 'mask-zoom');
  assert.equal(film.scenes[3].dominant.kind, 'parallax-depth');
  assert.equal(film.audio.narration, null);
});

test('rejects incomplete editorial, static motion, and music without rights', () => {
  const missingMusicIntent = brief();
  delete missingMusicIntent.musicIntent;
  assert.throws(() => normalizePostReadyBrief(missingMusicIntent), /musicIntent is required/);

  const staticScene = brief();
  staticScene.scenes[0].visual.motion = 'static';
  assert.throws(() => normalizePostReadyBrief(staticScene), /motion is not purposeful/);

  const unlicensedMusic = brief();
  unlicensedMusic.music = { mode: 'file', source: 'song.mp3', sourceType: 'operator-file', tier: 'production-safe' };
  assert.throws(() => normalizePostReadyBrief(unlicensedMusic), /music\.license is required/);
});

test('receipt keeps technical and editorial gates separate', () => {
  const plan = normalizePostReadyBrief(brief());
  const receipt = createProductionReceipt({ plan, runId: 'run-1', startedAt: '2026-08-03T00:00:00Z' });
  const pending = finalizeProductionReceipt(receipt, {
    technicalReview: { status: 'passed' },
    editorialReview: normalizeEditorialReview(null),
    completedAt: '2026-08-03T00:01:00Z',
  });
  assert.equal(pending.technicalStatus, 'passed');
  assert.equal(pending.editorialStatus, 'pending');
  assert.equal(pending.postReady, false);

  const approved = finalizeProductionReceipt(receipt, {
    technicalReview: { status: 'passed' },
    editorialReview: normalizeEditorialReview({
      status: 'approved',
      reviewedBy: 'owner',
      reviewedAt: '2026-08-03T00:02:00Z',
      categories: Object.fromEntries(['voice', 'music', 'animation', 'captions', 'pacing', 'transitions'].map((key) => [key, 'approved'])),
      issues: [],
    }),
    completedAt: '2026-08-03T00:03:00Z',
  });
  assert.equal(approved.postReady, true);
});

test('runtime roots are explicit and do not depend on the current worktree', () => {
  const paths = resolvePostReadyRuntimePaths({
    kokoroDir: '../shared/kokoro',
    videoRuntimeRoot: '../shared/ltx-runtime',
    videoModelRoot: '../shared/ltx-model',
  });
  assert.match(paths.kokoroDir, /shared\/kokoro$/);
  assert.match(paths.videoExecutable, /ltx-runtime\/\.venv\/bin\/ltx-2-mlx$/);
  assert.match(paths.videoModel, /ltx-model\/transformer-distilled-1\.1\.safetensors$/);
});
