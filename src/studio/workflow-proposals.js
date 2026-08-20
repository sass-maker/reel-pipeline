import { createHash } from 'node:crypto';

import libraryConfig from '../../config/studio-workflow-library.json' with { type: 'json' };
import { listLocalVideoWorkflowRecipes } from '../local-video-workflow-recipes.js';

export const WORKFLOW_LIBRARY_SCHEMA = 'fleet.studio-workflow-library.v1';
export const WORKFLOW_PROPOSAL_SCHEMA = 'fleet.studio-workflow-proposal.v1';
const LANES = new Set(['preview', 'final']);
const ASPECT_RATIOS = new Set(['9:16', '16:9']);

export function listWorkflowArchetypes(options = {}) {
  const library = validateWorkflowLibrary(options.library ?? libraryConfig);
  const recipes = options.recipes ?? listLocalVideoWorkflowRecipes(options.recipeOptions);
  return library.archetypes.map((archetype) => ({
    ...structuredClone(archetype),
    lanes: Object.fromEntries(Object.entries(library.lanes).map(([lane, binding]) => {
      const recipe = recipes.find((entry) => entry.id === binding.workflowRecipeId);
      return [lane, {
        ...structuredClone(binding),
        recipeVersion: recipe?.version ?? null,
        engine: recipe?.engine ?? null,
        graphSha256: recipe?.graphSha256 ?? null,
        readiness: recipe?.readiness ?? { ready: false, state: 'blocked', blocker: 'Workflow recipe is not registered.' },
        generationEstimate: generationTimeEstimate(lane, archetype.defaultDurationSeconds),
      }];
    })),
    sharedGraphDisclosure: 'Creative archetypes may share this pinned renderer graph; the archetype changes production intent and exposed presets, not the installed model.',
  }));
}

export function proposeStudioWorkflow(input = {}, options = {}) {
  const request = requiredText(input.request, 'request');
  const archetypes = listWorkflowArchetypes(options);
  const selected = selectArchetype(request, archetypes);
  const lane = requestedLane(request, input.lane);
  const requestedDurationSeconds = explicitDuration(request);
  return buildProposal({
    request,
    archetype: selected.archetype,
    lane,
    referenceImage: optionalText(input.referenceImage),
    aspectRatio: ASPECT_RATIOS.has(input.aspectRatio) ? input.aspectRatio : selected.archetype.defaultAspectRatio,
    durationSeconds: boundedDuration(input.durationSeconds ?? (
      requestedDurationSeconds && requestedDurationSeconds <= 8
        ? requestedDurationSeconds
        : selected.archetype.defaultDurationSeconds
    )),
    seed: boundedSeed(input.seed ?? 2307),
    directionNotes: [],
    revision: 1,
    selectionReason: requestedDurationSeconds > 8
      ? `${selected.reason} Local generation is shot-based, so this proposal covers one source shot for the longer ${requestedDurationSeconds}-second edit.`
      : selected.reason,
    planner: input.planner ?? { source: 'deterministic', provider: null },
    revisionHistory: [],
    options,
  });
}

export function reviseStudioWorkflowProposal(current, instruction, options = {}) {
  const proposal = normalizeWorkflowProposal(current, options);
  if (proposal.state === 'playing' || proposal.state === 'played') throw new Error('played workflow versions are immutable; create a new proposal revision');
  const text = requiredText(instruction, 'instruction');
  const archetypes = listWorkflowArchetypes(options);
  const rerouted = selectArchetype(text, archetypes, { minimumScore: 4 });
  const patch = {
    lane: explicitLane(text),
    aspectRatio: explicitAspectRatio(text),
    durationSeconds: explicitDuration(text),
    seed: explicitSeed(text),
    referenceImage: explicitReferencePath(text),
    archetype: rerouted ? rerouted.archetype : null,
  };
  const nextArchetype = patch.archetype ?? archetypes.find((entry) => entry.id === proposal.archetypeId);
  const hasStructuralChange = Boolean(patch.lane || patch.aspectRatio || patch.durationSeconds || patch.seed != null || patch.referenceImage || patch.archetype);
  const next = buildProposal({
    request: proposal.request,
    archetype: nextArchetype,
    lane: patch.lane ?? proposal.lane,
    referenceImage: patch.referenceImage ?? proposal.inputs.referenceImage,
    aspectRatio: patch.aspectRatio ?? proposal.inputs.aspectRatio,
    durationSeconds: patch.durationSeconds ?? proposal.inputs.durationSeconds,
    seed: patch.seed ?? proposal.inputs.seed,
    directionNotes: hasStructuralChange ? proposal.inputs.directionNotes : [...proposal.inputs.directionNotes, text].slice(-6),
    revision: proposal.version + 1,
    selectionReason: patch.archetype ? rerouted.reason : proposal.selectionReason,
    planner: proposal.planner,
    revisionHistory: proposal.revisionHistory,
    options,
  });
  const changes = proposalDiff(proposal, next);
  if (!changes.length) throw new Error('That instruction did not change an allowed workflow field. Try pacing, preview/final quality, aspect ratio, duration, seed, reference path, or shot style.');
  return normalizeWorkflowProposal({
    ...next,
    lastRevision: { fromVersion: proposal.version, toVersion: next.version, instruction: text, at: nowIso(options), changes },
    revisionHistory: [
      ...proposal.revisionHistory,
      { version: proposal.version, archetypeId: proposal.archetypeId, lane: proposal.lane, inputs: proposal.inputs },
    ].slice(-12),
  }, options);
}

export function normalizeWorkflowProposal(input, options = {}) {
  if (!input) return null;
  if (input.schema !== WORKFLOW_PROPOSAL_SCHEMA) throw new Error('unsupported workflow proposal schema');
  const archetype = listWorkflowArchetypes(options).find((entry) => entry.id === input.archetypeId);
  if (!archetype) throw new Error(`unknown workflow archetype: ${input.archetypeId}`);
  return buildProposal({
    request: input.request,
    archetype,
    lane: input.lane,
    referenceImage: input.inputs?.referenceImage,
    aspectRatio: input.inputs?.aspectRatio,
    durationSeconds: input.inputs?.durationSeconds,
    seed: input.inputs?.seed,
    directionNotes: input.inputs?.directionNotes,
    revision: input.version,
    selectionReason: input.selectionReason,
    planner: input.planner,
    state: input.state,
    frozenAt: input.frozenAt,
    lastRevision: input.lastRevision,
    revisionHistory: input.revisionHistory,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    options,
  });
}

export function workflowProposalBriefPatch(proposal, options = {}) {
  const current = normalizeWorkflowProposal(proposal, options);
  const preview = current.lane === 'preview';
  const frameCount = 49;
  return {
    recipeId: 'coherent-local-film',
    kind: 'coherent-film',
    engine: 'ltx',
    modelProfileId: current.binding.modelProfileId,
    durationSeconds: Math.max(5, Math.round(current.inputs.durationSeconds)),
    recipeOptions: { durationSeconds: Math.max(5, Math.round(current.inputs.durationSeconds)), qualityTier: preview ? 'draft' : 'high', variantCount: 1 },
    executionInputs: {
      workflowRecipeId: current.binding.workflowRecipeId,
      qualityLane: current.lane,
      prompt: current.compiledPrompt,
      referenceImage: current.inputs.referenceImage,
      seed: String(current.inputs.seed),
      aspectRatio: current.inputs.aspectRatio,
      durationSeconds: String(current.inputs.durationSeconds),
      quality: 'final',
      width: String(current.inputs.aspectRatio === '9:16' ? 320 : 512),
      height: String(current.inputs.aspectRatio === '9:16' ? 512 : 320),
      frames: String(frameCount),
      motionStrength: '0.25',
    },
    workflowProposal: current,
  };
}

export function inspectWorkflowProposal(input, options = {}) {
  const proposal = normalizeWorkflowProposal(input, options);
  const recipe = (options.recipes ?? listLocalVideoWorkflowRecipes(options.recipeOptions))
    .find((entry) => entry.id === proposal.binding.workflowRecipeId);
  const graph = recipe?.graph ?? null;
  const nodes = graph ? Object.entries(graph).map(([id, node]) => ({
    id,
    type: node.class_type,
    inputs: Object.keys(node.inputs ?? {}),
  })) : [];
  const edges = graph ? Object.entries(graph).flatMap(([target, node]) => Object.entries(node.inputs ?? {}).flatMap(([field, value]) => (
    Array.isArray(value) && typeof value[0] === 'string' && graph[value[0]]
      ? [{ from: value[0], output: Number(value[1] ?? 0), to: target, input: field }]
      : []
  ))) : [];
  return {
    proposal,
    recipe: recipe ? {
      id: recipe.id,
      version: recipe.version,
      name: recipe.name,
      engine: recipe.engine,
      qualityLane: recipe.qualityLane,
      graphSha256: recipe.graphSha256,
      runtime: recipe.runtime,
      models: recipe.models,
      resourceEnvelope: recipe.resourceEnvelope,
      readiness: recipe.readiness,
    } : null,
    comfy: graph ? { available: true, graph, nodes, edges } : {
      available: false,
      graph: null,
      nodes: [],
      edges: [],
      reason: 'This phase uses the pinned MLX Local Video Forge runtime rather than ComfyUI. Switch the proposal to preview to inspect its Comfy graph.',
    },
  };
}

export function freezeWorkflowProposal(input, expectedVersion, options = {}) {
  const proposal = normalizeWorkflowProposal(input, options);
  if (Number(expectedVersion) !== proposal.version) throw new Error(`workflow proposal changed; expected version ${proposal.version}`);
  if (!proposal.readiness.ready) throw new Error(proposal.readiness.blocker);
  return normalizeWorkflowProposal({ ...proposal, state: 'playing', frozenAt: nowIso(options) }, options);
}

export function validateWorkflowLibrary(input) {
  if (input?.$schema !== WORKFLOW_LIBRARY_SCHEMA || !Number.isInteger(input.version)) throw new Error(`workflow library must use ${WORKFLOW_LIBRARY_SCHEMA}`);
  if (!input.lanes || !input.archetypes?.length) throw new Error('workflow library needs lanes and archetypes');
  const ids = new Set();
  for (const archetype of input.archetypes) {
    if (!archetype.id || ids.has(archetype.id)) throw new Error(`invalid or duplicate workflow archetype: ${archetype.id}`);
    ids.add(archetype.id);
    if (!Number.isInteger(archetype.version) || archetype.version < 1) throw new Error(`${archetype.id}: version is required`);
    if (!archetype.name || !archetype.description || !archetype.promptGuide || !archetype.shotGrammar) throw new Error(`${archetype.id}: descriptive fields are required`);
    if (!Array.isArray(archetype.keywords) || !archetype.keywords.length) throw new Error(`${archetype.id}: keywords are required`);
    if (!ASPECT_RATIOS.has(archetype.defaultAspectRatio)) throw new Error(`${archetype.id}: unsupported aspect ratio`);
  }
  for (const lane of LANES) {
    const binding = input.lanes[lane];
    if (!binding?.workflowRecipeId || !binding?.modelProfileId) throw new Error(`${lane}: workflow and model bindings are required`);
  }
  return input;
}

function buildProposal(input) {
  const lane = LANES.has(input.lane) ? input.lane : 'final';
  const binding = input.archetype.lanes[lane];
  const referenceImage = optionalText(input.referenceImage);
  const durationSeconds = boundedDuration(input.durationSeconds);
  const blockers = [];
  if (!binding.readiness.ready) blockers.push(binding.readiness.blocker);
  if (!referenceImage) blockers.push('Add a character or scene reference image before playing this workflow.');
  const createdAt = input.createdAt ?? nowIso(input.options);
  const updatedAt = input.updatedAt ?? nowIso(input.options);
  const proposal = {
    schema: WORKFLOW_PROPOSAL_SCHEMA,
    id: `workflow_${hash({ request: input.request, archetypeId: input.archetype.id }).slice(0, 12)}`,
    version: positiveInteger(input.revision, 'proposal.version'),
    state: ['proposed', 'playing', 'played'].includes(input.state) ? input.state : 'proposed',
    createdAt,
    updatedAt,
    request: requiredText(input.request, 'proposal.request'),
    archetypeId: input.archetype.id,
    archetypeVersion: input.archetype.version,
    name: input.archetype.name,
    description: input.archetype.description,
    intentTags: [...input.archetype.intentTags],
    shotGrammar: input.archetype.shotGrammar,
    selectionReason: requiredText(input.selectionReason, 'proposal.selectionReason'),
    lane,
    binding: structuredClone(binding),
    compiledPrompt: [
      `${input.request.trim()}. Production direction: ${input.archetype.promptGuide}.`,
      ...normalizeDirectionNotes(input.directionNotes).map((note) => `Revision direction: ${note}.`),
    ].join(' '),
    inputs: {
      referenceImage,
      aspectRatio: ASPECT_RATIOS.has(input.aspectRatio) ? input.aspectRatio : input.archetype.defaultAspectRatio,
      durationSeconds,
      seed: boundedSeed(input.seed),
      directionNotes: normalizeDirectionNotes(input.directionNotes),
    },
    phases: workflowPhases(input.archetype, binding, lane),
    readiness: { ready: blockers.length === 0, state: blockers.length ? 'needs-input' : 'ready', blocker: blockers.join(' ') || null, blockers },
    generationEstimate: generationTimeEstimate(lane, durationSeconds),
    resourceEnvelope: structuredClone(binding.resourceEnvelope ?? { expectedDiskGb: lane === 'preview' ? 11.5 : 45, maxDiskPercent: 85, maxRamPercent: 90, serial: true }),
    sharedGraphDisclosure: input.archetype.sharedGraphDisclosure,
    planner: normalizePlanner(input.planner),
    lastRevision: normalizeLastRevision(input.lastRevision),
    revisionHistory: Array.isArray(input.revisionHistory) ? input.revisionHistory.slice(-12).map(normalizeHistoryEntry) : [],
    frozenAt: optionalText(input.frozenAt),
  };
  return proposal;
}

function generationTimeEstimate(lane, durationSeconds) {
  const measured = lane === 'preview'
    ? { sampleDurationSeconds:3.375, minimumSeconds:16, maximumSeconds:42, modelProfileId:'ltx-2b-comfy-preview' }
    : { sampleDurationSeconds:6, minimumSeconds:205, maximumSeconds:216, modelProfileId:'ltx-2.3-mlx-q4' };
  const ratio = durationSeconds / measured.sampleDurationSeconds;
  const minimumSeconds = Math.max(1, Math.round(measured.minimumSeconds * ratio));
  const maximumSeconds = Math.max(minimumSeconds, Math.round(measured.maximumSeconds * ratio));
  const range = maximumSeconds < 90
    ? `${minimumSeconds}–${maximumSeconds} seconds`
    : `${(minimumSeconds / 60).toFixed(1)}–${(maximumSeconds / 60).toFixed(1)} minutes`;
  return {
    basis:'measured-current-48gb-mac',
    modelProfileId:measured.modelProfileId,
    minimumSeconds,
    maximumSeconds,
    label:`About ${range} for this ${durationSeconds}-second shot`,
  };
}

function workflowPhases(archetype, binding, lane) {
  return [
    { id: 'intent', name: 'Direct the shot', owner: 'Studio planner', detail: `${archetype.name} · ${archetype.shotGrammar}`, status: 'configured' },
    { id: 'reference', name: 'Condition the subject', owner: 'Reference input', detail: 'Approved local character, product, or scene image', status: 'required' },
    { id: 'render', name: lane === 'preview' ? 'Generate preview' : 'Generate final shot', owner: binding.engine === 'comfy-local' ? 'ComfyUI' : 'Local Video Forge', detail: `${binding.label} · ${binding.workflowRecipeId}`, status: binding.readiness.ready ? 'ready' : 'blocked' },
    { id: 'review', name: 'Review the artifact', owner: 'Marketing Studio', detail: 'Play, accept, revise, or reject with a hash-bound receipt', status: 'waiting' },
  ];
}

function selectArchetype(request, archetypes, options = {}) {
  const text = request.toLowerCase();
  const scored = archetypes.map((archetype, index) => ({
    archetype,
    index,
    score: archetype.keywords.reduce((score, keyword) => score + (text.includes(keyword.toLowerCase()) ? (keyword.includes(' ') ? 4 : 2) : 0), 0),
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  if (options.minimumScore && scored[0].score < options.minimumScore) return null;
  const winner = scored[0];
  return {
    archetype: winner.archetype,
    reason: winner.score
      ? `Matched ${winner.archetype.intentTags.slice(0, 3).join(', ')} intent in the request.`
      : 'Selected the safest general cinematic workflow because the request did not require a more specialized production grammar.',
  };
}

function proposalDiff(before, after) {
  const fields = [
    ['archetypeId', before.archetypeId, after.archetypeId],
    ['lane', before.lane, after.lane],
    ['aspect ratio', before.inputs.aspectRatio, after.inputs.aspectRatio],
    ['duration', before.inputs.durationSeconds, after.inputs.durationSeconds],
    ['seed', before.inputs.seed, after.inputs.seed],
    ['reference image', before.inputs.referenceImage, after.inputs.referenceImage],
    ['creative direction', before.inputs.directionNotes.join('\n'), after.inputs.directionNotes.join('\n')],
  ];
  return fields.filter(([, previous, next]) => previous !== next).map(([field, previous, next]) => ({ field, before: previous ?? null, after: next ?? null }));
}

function requestedLane(request, inputLane) {
  return LANES.has(inputLane) ? inputLane : explicitLane(request) ?? 'final';
}

function explicitLane(value) {
  const text = String(value ?? '').toLowerCase();
  if (/\b(preview|draft|fast|quick|cheap)\b/.test(text)) return 'preview';
  if (/\b(final|hero|best quality|highest quality|production quality)\b/.test(text)) return 'final';
  return null;
}

function explicitAspectRatio(value) {
  const text = String(value ?? '').toLowerCase();
  if (/\b(landscape|wide|16\s*:\s*9|youtube)\b/.test(text)) return '16:9';
  if (/\b(portrait|vertical|9\s*:\s*16|reel|shorts?)\b/.test(text)) return '9:16';
  return null;
}

function explicitDuration(value) {
  const match = String(value ?? '').match(/\b(\d+(?:\.\d+)?)\s*(?:-| )?\s*(?:seconds?|secs?|s)\b/i);
  return match ? Number(match[1]) : null;
}

function explicitSeed(value) {
  const match = String(value ?? '').match(/\bseed\s*(?:to|=|:)??\s*(\d{1,10})\b/i);
  return match ? Number(match[1]) : null;
}

function explicitReferencePath(value) {
  const match = String(value ?? '').match(/(?:reference|image|keyframe)\s+(?:to|=|:)\s*(\/[^\n,]+)/i);
  return match ? match[1].trim() : null;
}

function boundedDuration(value) {
  const number = Number(value ?? 3.375);
  if (!Number.isFinite(number) || number < 1 || number > 8) throw new Error('workflow duration must be between 1 and 8 seconds');
  return number;
}

function boundedSeed(value) {
  const number = Number(value ?? 2307);
  if (!Number.isInteger(number) || number < 0 || number > 4294967295) throw new Error('workflow seed must be an integer between 0 and 4294967295');
  return number;
}

function positiveInteger(value, field) {
  const number = Number(value ?? 1);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${field} must be a positive integer`);
  return number;
}

function normalizePlanner(value) {
  return {
    source: value?.source === 'llm' ? 'llm' : 'deterministic',
    provider: optionalText(value?.provider),
  };
}

function normalizeLastRevision(value) {
  if (!value) return null;
  return {
    fromVersion: positiveInteger(value.fromVersion, 'lastRevision.fromVersion'),
    toVersion: positiveInteger(value.toVersion, 'lastRevision.toVersion'),
    instruction: requiredText(value.instruction, 'lastRevision.instruction'),
    at: requiredText(value.at, 'lastRevision.at'),
    changes: Array.isArray(value.changes) ? value.changes.slice(0, 12).map((entry) => ({ field: String(entry.field), before: entry.before ?? null, after: entry.after ?? null })) : [],
  };
}

function normalizeHistoryEntry(value) {
  return {
    version: positiveInteger(value?.version, 'history.version'),
    archetypeId: requiredText(value?.archetypeId, 'history.archetypeId'),
    lane: LANES.has(value?.lane) ? value.lane : 'final',
    inputs: {
      referenceImage: optionalText(value?.inputs?.referenceImage),
      aspectRatio: ASPECT_RATIOS.has(value?.inputs?.aspectRatio) ? value.inputs.aspectRatio : '9:16',
      durationSeconds: boundedDuration(value?.inputs?.durationSeconds),
      seed: boundedSeed(value?.inputs?.seed),
      directionNotes: normalizeDirectionNotes(value?.inputs?.directionNotes),
    },
  };
}

function nowIso(options = {}) {
  return (options.now?.() ?? new Date()).toISOString();
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeDirectionNotes(value) {
  return Array.isArray(value)
    ? value.slice(-6).map((entry) => requiredText(entry, 'direction note').slice(0, 500))
    : [];
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
