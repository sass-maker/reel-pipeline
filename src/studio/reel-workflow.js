export const REEL_WORKFLOW_SCHEMA = 'fleet.reel-workflow.v1';

export const REEL_STAGES = Object.freeze([
  stage('brief', 'Brief', 'studio.brief.review', []),
  stage('cast', 'Cast', 'studio.cast.confirm', ['brief']),
  stage('scenes', 'Scenes', 'studio.scenes.plan', ['cast']),
  stage('generation', 'Generate', 'studio.video.generate', ['scenes']),
  stage('edit', 'Edit', 'studio.edit.confirm', ['generation']),
  stage('sound', 'Sound', 'studio.sound.confirm', ['edit']),
  stage('export', 'Export', 'studio.video.export', ['sound']),
  stage('review', 'Review', 'studio.review.confirm', ['export']),
]);

const STAGE_BY_ID = new Map(REEL_STAGES.map((entry) => [entry.id, entry]));
const STATUSES = new Set(['pending', 'ready', 'running', 'completed', 'blocked', 'failed', 'stale']);
const MODES = new Set(['manual', 'quick']);
const INPUT_KINDS = new Set(['text', 'voice']);

export function createReelWorkflow(input = {}, context = {}) {
  const at = iso(context.at ?? input.createdAt ?? new Date().toISOString(), 'workflow.createdAt');
  const briefId = requiredString(context.briefId ?? input.briefId, 'workflow.briefId');
  const briefRevision = positiveInteger(context.briefRevision ?? input.briefRevision ?? 1, 'workflow.briefRevision');
  const source = normalizeSource(input.source, context.request);
  return {
    schema: REEL_WORKFLOW_SCHEMA,
    revision: 1,
    briefId,
    briefRevision,
    mode: MODES.has(input.mode) ? input.mode : 'manual',
    paused: input.paused === true,
    createdAt: at,
    updatedAt: at,
    source,
    stages: REEL_STAGES.map((definition, index) => normalizeStage({
      ...definition,
      status: index === 0 ? 'completed' : index === 1 ? 'ready' : 'pending',
      revision: 1,
      inputRevision: briefRevision,
      output: index === 0 ? { briefId, briefRevision } : null,
      evidence: null,
      blockers: [],
      error: null,
      updatedAt: at,
    }, definition, at)),
  };
}

export function normalizeReelWorkflow(input, context = {}) {
  if (!input) return createReelWorkflow({}, context);
  if (input.schema == null) return createReelWorkflow(input, context);
  if (input.schema !== REEL_WORKFLOW_SCHEMA) throw new Error(`workflow must use ${REEL_WORKFLOW_SCHEMA}`);
  const at = iso(input.updatedAt ?? context.at, 'workflow.updatedAt');
  const byId = new Map((Array.isArray(input.stages) ? input.stages : []).map((entry) => [entry?.id, entry]));
  for (const entry of byId.values()) {
    if (!STAGE_BY_ID.has(entry?.id)) throw new Error(`unknown workflow stage: ${entry?.id}`);
  }
  return {
    schema: REEL_WORKFLOW_SCHEMA,
    revision: positiveInteger(input.revision, 'workflow.revision'),
    briefId: requiredString(context.briefId ?? input.briefId, 'workflow.briefId'),
    briefRevision: positiveInteger(context.briefRevision ?? input.briefRevision, 'workflow.briefRevision'),
    mode: MODES.has(input.mode) ? input.mode : 'manual',
    paused: input.paused === true,
    createdAt: iso(input.createdAt, 'workflow.createdAt'),
    updatedAt: at,
    source: normalizeSource(input.source, context.request),
    stages: REEL_STAGES.map((definition) => normalizeStage(byId.get(definition.id), definition, at)),
  };
}

export function updateWorkflowStage(workflow, stageId, patch = {}, options = {}) {
  const current = normalizeReelWorkflow(workflow, workflowContext(workflow));
  const definition = requireStage(stageId);
  if (patch.actionId != null && patch.actionId !== definition.actionId) {
    throw new Error(`stage ${stageId} only permits registered action ${definition.actionId}`);
  }
  const at = iso(options.at ?? new Date().toISOString(), 'workflow.updatedAt');
  const index = current.stages.findIndex((entry) => entry.id === stageId);
  const nextStage = normalizeStage({
    ...current.stages[index],
    ...patch,
    id: definition.id,
    actionId: definition.actionId,
    dependsOn: definition.dependsOn,
    revision: current.stages[index].revision + 1,
    updatedAt: at,
  }, definition, at);
  const stages = [...current.stages];
  stages[index] = nextStage;
  const invalidates = patch.invalidateDownstream === true || ['running', 'completed'].includes(nextStage.status);
  const invalidated = invalidates ? invalidateDependents(stages, stageId, at) : stages;
  return refreshReadyStages({
    ...current,
    revision: current.revision + 1,
    updatedAt: at,
    stages: invalidated,
  }, at);
}

export function invalidateWorkflowFrom(workflow, stageId, options = {}) {
  const current = normalizeReelWorkflow(workflow, workflowContext(workflow));
  requireStage(stageId);
  const at = iso(options.at ?? new Date().toISOString(), 'workflow.updatedAt');
  const stages = current.stages.map((entry) => entry.id === stageId || dependsTransitively(entry.id, stageId)
    ? {
        ...entry,
        status: entry.id === stageId && dependenciesComplete(current.stages, entry) ? 'ready' : 'stale',
        output: null,
        evidence: null,
        error: null,
        blockers: [],
        revision: entry.revision + 1,
        updatedAt: at,
      }
    : entry);
  return refreshReadyStages({
    ...current,
    revision: current.revision + 1,
    updatedAt: at,
    stages,
  }, at);
}

export function setWorkflowMode(workflow, mode, options = {}) {
  if (!MODES.has(mode)) throw new Error('workflow mode must be manual or quick');
  const current = normalizeReelWorkflow(workflow, workflowContext(workflow));
  const at = iso(options.at ?? new Date().toISOString(), 'workflow.updatedAt');
  return { ...current, mode, paused: options.paused === true, revision: current.revision + 1, updatedAt: at };
}

export function nextRunnableStage(workflow) {
  const current = normalizeReelWorkflow(workflow, workflowContext(workflow));
  if (current.paused) return null;
  return current.stages.find((entry) => entry.status === 'ready') ?? null;
}

export function assertStageRunnable(workflow, stageId, actionId) {
  const current = normalizeReelWorkflow(workflow, workflowContext(workflow));
  const definition = requireStage(stageId);
  if (actionId !== definition.actionId) throw new Error(`stage ${stageId} only permits registered action ${definition.actionId}`);
  const entry = current.stages.find((candidate) => candidate.id === stageId);
  if (entry.status !== 'ready' && entry.status !== 'failed') throw new Error(`stage ${stageId} is ${entry.status}, not ready`);
  const missing = entry.dependsOn.filter((dependency) => current.stages.find((candidate) => candidate.id === dependency)?.status !== 'completed');
  if (missing.length) throw new Error(`stage ${stageId} requires completed ${missing.join(', ')}`);
  return structuredClone(entry);
}

function stage(id, label, actionId, dependsOn) {
  return Object.freeze({ id, label, actionId, dependsOn: Object.freeze(dependsOn) });
}

function normalizeStage(input, definition, fallbackAt) {
  if (!input) throw new Error(`workflow stage is required: ${definition.id}`);
  if (input.actionId != null && input.actionId !== definition.actionId) {
    throw new Error(`stage ${definition.id} only permits registered action ${definition.actionId}`);
  }
  const status = STATUSES.has(input.status) ? input.status : 'pending';
  return {
    id: definition.id,
    label: definition.label,
    actionId: definition.actionId,
    dependsOn: [...definition.dependsOn],
    status,
    revision: positiveInteger(input.revision ?? 1, `${definition.id}.revision`),
    inputRevision: positiveInteger(input.inputRevision ?? 1, `${definition.id}.inputRevision`),
    output: objectOrNull(input.output),
    evidence: objectOrNull(input.evidence),
    blockers: stringList(input.blockers),
    error: optionalString(input.error),
    updatedAt: iso(input.updatedAt ?? fallbackAt, `${definition.id}.updatedAt`),
  };
}

function invalidateDependents(stages, completedId, at) {
  return stages.map((entry) => dependsTransitively(entry.id, completedId)
    ? {
        ...entry,
        status: entry.status === 'pending' && entry.output == null && entry.evidence == null
          ? 'pending'
          : 'stale',
        output: null, evidence: null, error: null, blockers: [],
        revision: entry.revision + 1, updatedAt: at,
      }
    : entry);
}

function dependsTransitively(stageId, ancestorId, seen = new Set()) {
  if (stageId === ancestorId || seen.has(stageId)) return false;
  seen.add(stageId);
  const definition = STAGE_BY_ID.get(stageId);
  if (!definition) return false;
  return definition.dependsOn.includes(ancestorId)
    || definition.dependsOn.some((dependency) => dependsTransitively(dependency, ancestorId, seen));
}

function refreshReadyStages(workflow, at) {
  const stages = workflow.stages.map((entry) => {
    if (!['pending', 'stale'].includes(entry.status)) return entry;
    return dependenciesComplete(workflow.stages, entry)
      ? { ...entry, status: 'ready', updatedAt: at }
      : entry;
  });
  return { ...workflow, stages };
}

function dependenciesComplete(stages, entry) {
  return entry.dependsOn.every((dependency) => stages.find((candidate) => candidate.id === dependency)?.status === 'completed');
}

function requireStage(id) {
  const definition = STAGE_BY_ID.get(id);
  if (!definition) throw new Error(`unknown workflow stage: ${id}`);
  return definition;
}

function normalizeSource(input = {}, fallbackText = '') {
  const kind = INPUT_KINDS.has(input?.kind) ? input.kind : 'text';
  const transcript = requiredString(input?.transcript ?? fallbackText, 'workflow.source.transcript');
  return {
    kind,
    transcript,
    recordingPath: kind === 'voice' ? optionalString(input?.recordingPath) : null,
    transcription: input?.transcription && typeof input.transcription === 'object'
      ? structuredClone(input.transcription)
      : null,
  };
}

function workflowContext(workflow) {
  return {
    briefId: workflow?.briefId,
    briefRevision: workflow?.briefRevision,
    request: workflow?.source?.transcript,
    at: workflow?.updatedAt,
  };
}

function objectOrNull(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? structuredClone(value) : null;
}

function stringList(value) {
  return Array.isArray(value) ? value.map((entry) => optionalString(entry)).filter(Boolean).slice(0, 20) : [];
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredString(value, field) {
  const text = optionalString(value);
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${field} must be a positive integer`);
  return number;
}

function iso(value, field) {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${field} must be an ISO date`);
  return new Date(value).toISOString();
}
