import {
  assertStageRunnable,
  invalidateWorkflowFrom,
  nextRunnableStage,
} from './reel-workflow.js';

export async function runRegisteredWorkflowStage({
  store,
  briefId,
  stageId,
  actionId,
  actions,
  retry = false,
  quick = false,
  context = {},
}) {
  if (!store?.get || !store?.update || !store?.updateWorkflowStage) {
    throw new Error('workflow runner requires the Marketing Brief store boundary');
  }
  if (!actions || typeof actions !== 'object') throw new Error('workflow runner requires registered actions');

  let brief = await requireBrief(store, briefId);
  let requested = requireStage(brief, stageId);
  if (actionId !== requested.actionId) {
    throw new Error(`stage ${stageId} only permits registered action ${requested.actionId}`);
  }
  if (retry && ['blocked', 'failed', 'completed'].includes(requested.status)) {
    brief = await store.update(brief.id, {
      workflow: invalidateWorkflowFrom(brief.workflow, stageId, { at: nowIso(context) }),
    });
    requested = requireStage(brief, stageId);
  }

  const executed = [];
  let currentStage = requested;
  while (currentStage) {
    const action = actions[currentStage.actionId];
    if (!action || typeof action.run !== 'function') {
      throw new Error(`workflow action is not registered: ${currentStage.actionId}`);
    }
    assertStageRunnable(brief.workflow, currentStage.id, currentStage.actionId);

    const readiness = typeof action.readiness === 'function'
      ? await action.readiness({ brief, stage: currentStage, context })
      : { ready: true, blockers: [] };
    if (readiness?.ready === false) {
      const blockers = normalizeBlockers(readiness.blockers, readiness.blocker);
      brief = await store.updateWorkflowStage(brief.id, currentStage.id, {
        actionId: currentStage.actionId,
        status: 'blocked',
        blockers,
        error: null,
      });
      if (quick) brief = await store.setWorkflowMode(brief.id, 'quick', { paused: true });
      return {
        brief,
        executed,
        paused: quick,
        blocker: blockers[0] ?? `Stage ${currentStage.id} is blocked.`,
      };
    }

    brief = await store.updateWorkflowStage(brief.id, currentStage.id, {
      actionId: currentStage.actionId,
      status: 'running',
      blockers: [],
      error: null,
    });
    try {
      const result = await action.run({ brief, stage: requireStage(brief, currentStage.id), context });
      brief = await store.updateWorkflowStage(brief.id, currentStage.id, {
        actionId: currentStage.actionId,
        status: 'completed',
        output: result?.output ?? {},
        evidence: result?.evidence ?? {},
        blockers: [],
        error: null,
      });
      executed.push(currentStage.id);
    } catch (error) {
      brief = await store.updateWorkflowStage(brief.id, currentStage.id, {
        actionId: currentStage.actionId,
        status: 'failed',
        blockers: [],
        error: error.message,
      });
      if (quick) brief = await store.setWorkflowMode(brief.id, 'quick', { paused: true });
      return { brief, executed, paused: quick, error: error.message };
    }

    if (!quick) return { brief, executed, paused: false, blocker: null };
    currentStage = nextRunnableStage(brief.workflow);
  }

  return { brief, executed, paused: false, blocker: null };
}

function requireBrief(store, id) {
  return store.get(id).then((brief) => {
    if (!brief) throw new Error(`marketing brief not found: ${id}`);
    return brief;
  });
}

function requireStage(brief, id) {
  const stage = brief.workflow?.stages?.find((entry) => entry.id === id);
  if (!stage) throw new Error(`unknown workflow stage: ${id}`);
  return stage;
}

function normalizeBlockers(blockers, blocker) {
  const values = Array.isArray(blockers) ? blockers : [blocker];
  return values
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim())
    .slice(0, 20);
}

function nowIso(context) {
  return (context.now?.() ?? new Date()).toISOString();
}
