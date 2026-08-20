import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { MarketingBriefStore } from '../src/studio/briefs.js';
import { runRegisteredWorkflowStage } from '../src/studio/workflow-runner.js';

async function setup(mode = 'manual') {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-workflow-runner-'));
  let tick = 0;
  const store = new MarketingBriefStore({
    filePath: path.join(root, 'briefs.json'),
    now: () => new Date(Date.parse('2026-08-05T12:00:00Z') + tick++ * 1000),
  });
  const brief = await store.create({ request: 'Make a fictional rooftop reel.', workflow: { mode } });
  return { store, brief };
}

function action(output = {}) {
  return {
    readiness: async () => ({ ready: true, blockers: [] }),
    run: async ({ stage }) => ({
      output: { stageId: stage.id, ...output },
      evidence: { actionId: stage.actionId, localOnly: true },
    }),
  };
}

const baseActions = {
  'studio.cast.confirm': action({ castCount: 0 }),
  'studio.scenes.plan': action({ sceneCount: 3 }),
  'studio.video.generate': action({ videoPath: '/tmp/reel.mp4' }),
};

test('manual run executes only the explicitly selected registered stage', async () => {
  const { store, brief } = await setup();
  const result = await runRegisteredWorkflowStage({
    store,
    briefId: brief.id,
    stageId: 'cast',
    actionId: 'studio.cast.confirm',
    actions: baseActions,
  });
  assert.deepEqual(result.executed, ['cast']);
  assert.equal(result.brief.workflow.stages.find((stage) => stage.id === 'cast').status, 'completed');
  assert.equal(result.brief.workflow.stages.find((stage) => stage.id === 'scenes').status, 'ready');
  assert.equal(result.brief.workflow.stages.find((stage) => stage.id === 'generation').status, 'pending');
});

test('quick run auto-advances safe stages and pauses on an exact generation blocker', async () => {
  const { store, brief } = await setup('quick');
  const actions = {
    ...baseActions,
    'studio.video.generate': {
      readiness: async () => ({ ready: false, blockers: ['Confirm the selected local model.'] }),
      run: async () => { throw new Error('generation must not start'); },
    },
  };
  const result = await runRegisteredWorkflowStage({
    store,
    briefId: brief.id,
    stageId: 'cast',
    actionId: 'studio.cast.confirm',
    actions,
    quick: true,
  });
  assert.deepEqual(result.executed, ['cast', 'scenes']);
  assert.equal(result.paused, true);
  assert.equal(result.brief.workflow.paused, true);
  assert.equal(result.brief.workflow.stages.find((stage) => stage.id === 'generation').status, 'blocked');
  assert.match(result.blocker, /selected local model/);
});

test('failed stage retries without repeating completed checkpoints', async () => {
  const { store, brief } = await setup();
  await runRegisteredWorkflowStage({
    store,
    briefId: brief.id,
    stageId: 'cast',
    actionId: 'studio.cast.confirm',
    actions: baseActions,
  });
  const failed = await runRegisteredWorkflowStage({
    store,
    briefId: brief.id,
    stageId: 'scenes',
    actionId: 'studio.scenes.plan',
    actions: {
      ...baseActions,
      'studio.scenes.plan': { run: async () => { throw new Error('scene compiler stopped'); } },
    },
  });
  assert.equal(failed.brief.workflow.stages.find((stage) => stage.id === 'scenes').status, 'failed');
  const retried = await runRegisteredWorkflowStage({
    store,
    briefId: brief.id,
    stageId: 'scenes',
    actionId: 'studio.scenes.plan',
    actions: baseActions,
    retry: true,
  });
  assert.deepEqual(retried.executed, ['scenes']);
  assert.equal(retried.brief.workflow.stages.find((stage) => stage.id === 'cast').status, 'completed');
  assert.equal(retried.brief.workflow.stages.find((stage) => stage.id === 'generation').status, 'ready');
});

test('rerunning an upstream stage reuses earlier checkpoints and invalidates dependents', async () => {
  const { store, brief } = await setup();
  for (const [stageId, actionId] of [
    ['cast', 'studio.cast.confirm'],
    ['scenes', 'studio.scenes.plan'],
    ['generation', 'studio.video.generate'],
  ]) {
    await runRegisteredWorkflowStage({ store, briefId: brief.id, stageId, actionId, actions: baseActions });
  }
  const rerun = await runRegisteredWorkflowStage({
    store,
    briefId: brief.id,
    stageId: 'cast',
    actionId: 'studio.cast.confirm',
    actions: baseActions,
    retry: true,
  });
  const stages = new Map(rerun.brief.workflow.stages.map((stage) => [stage.id, stage]));
  assert.equal(stages.get('brief').status, 'completed');
  assert.equal(stages.get('cast').status, 'completed');
  assert.equal(stages.get('scenes').status, 'ready');
  assert.equal(stages.get('scenes').output, null);
  assert.equal(stages.get('generation').status, 'stale');
});
