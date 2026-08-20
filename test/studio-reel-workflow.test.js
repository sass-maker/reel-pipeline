import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertStageRunnable,
  createReelWorkflow,
  invalidateWorkflowFrom,
  nextRunnableStage,
  normalizeReelWorkflow,
  REEL_STAGES,
  setWorkflowMode,
  updateWorkflowStage,
} from '../src/studio/reel-workflow.js';

const at = '2026-08-05T12:00:00.000Z';

function workflow() {
  return createReelWorkflow({ source: { kind: 'text', transcript: 'Make a night-out reel.' } }, {
    briefId: 'brief-1', briefRevision: 1, at,
  });
}

test('workflow is a fixed eight-stage record rather than prompt-authored actions', () => {
  const created = workflow();
  assert.deepEqual(created.stages.map((entry) => entry.id), REEL_STAGES.map((entry) => entry.id));
  assert.equal(created.stages[0].status, 'completed');
  assert.equal(nextRunnableStage(created).id, 'cast');
  assert.throws(
    () => updateWorkflowStage(created, 'cast', { actionId: 'shell.exec', status: 'completed' }, { at }),
    /only permits registered action/,
  );
  const tampered = structuredClone(created);
  tampered.stages.push({ id: 'arbitrary', actionId: 'shell.exec' });
  assert.throws(() => normalizeReelWorkflow(tampered, {
    briefId: created.briefId, briefRevision: created.briefRevision, request: created.source.transcript, at,
  }), /unknown workflow stage/);
});

test('completed stages unlock the next stage and stale all transitive outputs on rerun', () => {
  let current = workflow();
  assertStageRunnable(current, 'cast', 'studio.cast.confirm');
  current = updateWorkflowStage(current, 'cast', { status: 'completed', output: { castIds: ['rhea'] } }, { at: '2026-08-05T12:01:00Z' });
  assert.equal(nextRunnableStage(current).id, 'scenes');
  current = updateWorkflowStage(current, 'scenes', { status: 'completed', output: { count: 4 } }, { at: '2026-08-05T12:02:00Z' });
  current = updateWorkflowStage(current, 'generation', { status: 'completed', output: { frames: 4 } }, { at: '2026-08-05T12:03:00Z' });
  const changed = invalidateWorkflowFrom(current, 'cast', { at: '2026-08-05T12:04:00Z' });
  assert.equal(changed.stages.find((entry) => entry.id === 'cast').status, 'ready');
  assert.equal(changed.stages.find((entry) => entry.id === 'scenes').status, 'stale');
  assert.equal(changed.stages.find((entry) => entry.id === 'generation').status, 'stale');
  assert.equal(changed.stages.find((entry) => entry.id === 'brief').status, 'completed');
});

test('quick mode uses the same workflow and can be paused', () => {
  const quick = setWorkflowMode(workflow(), 'quick', { paused: true, at });
  assert.equal(quick.mode, 'quick');
  assert.equal(quick.paused, true);
  assert.equal(nextRunnableStage(quick), null);
});
