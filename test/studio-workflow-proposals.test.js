import assert from 'node:assert/strict';
import test from 'node:test';

import library from '../config/studio-workflow-library.json' with { type: 'json' };
import { listLocalVideoWorkflowRecipes } from '../src/local-video-workflow-recipes.js';
import {
  freezeWorkflowProposal,
  inspectWorkflowProposal,
  listWorkflowArchetypes,
  proposeStudioWorkflow,
  reviseStudioWorkflowProposal,
  validateWorkflowLibrary,
  workflowProposalBriefPatch,
} from '../src/studio/workflow-proposals.js';

const recipes = listLocalVideoWorkflowRecipes({ rootDir: process.cwd() })
  .map((recipe) => ({ ...recipe, readiness: { ready: true, state: 'ready', blocker: null, missing: [], unhashed: [] } }));
const readyRecipes = { recipes };

test('workflow library exposes broad archetypes with truthful shared graph disclosure', () => {
  assert.equal(validateWorkflowLibrary(library), library);
  const entries = listWorkflowArchetypes(readyRecipes);
  assert.equal(entries.length, 14);
  assert.ok(entries.every((entry) => entry.sharedGraphDisclosure.includes('share')));
  assert.equal(entries[0].lanes.final.workflowRecipeId, 'ltx-2.3-mlx-q4-final');
  assert.equal(entries[0].lanes.preview.workflowRecipeId, 'ltx-2b-comfy-i2v-preview');
  assert.deepEqual(
    [entries[0].lanes.final.generationEstimate.minimumSeconds, entries[0].lanes.final.generationEstimate.maximumSeconds],
    [115, 122],
  );
});

test('request routing selects a relevant archetype and never executes', () => {
  const plan = proposeStudioWorkflow({
    request: 'A wild night out party montage with people dancing in a club',
    referenceImage: '/tmp/party.png',
  }, { ...readyRecipes, now: () => new Date('2026-08-05T00:00:00Z') });
  assert.equal(plan.archetypeId, 'night-out-rush');
  assert.equal(plan.state, 'proposed');
  assert.equal(plan.readiness.ready, true);
  assert.equal(plan.generationEstimate.basis, 'measured-current-48gb-mac');
  assert.match(plan.generationEstimate.label, /this 3\.375-second shot/);
  assert.match(plan.compiledPrompt, /wild candid party moment/);
});

test('missing reference remains an actionable proposal blocker', () => {
  const plan = proposeStudioWorkflow({ request: 'A cinematic portrait in the rain' }, readyRecipes);
  assert.equal(plan.readiness.ready, false);
  assert.match(plan.readiness.blocker, /reference image/);
});

test('long reel requests route to an honest bounded source shot instead of exceeding model limits', () => {
  const plan = proposeStudioWorkflow({ request: 'A 30-second night out party reel', referenceImage: '/tmp/party.png' }, readyRecipes);
  assert.equal(plan.inputs.durationSeconds, 3.375);
  assert.match(plan.selectionReason, /one source shot.*30-second edit/);
});

test('bounded revision creates a new version and visible diff', () => {
  const first = proposeStudioWorkflow({
    request: 'A woman walks through a cinematic city',
    referenceImage: '/tmp/actor.png',
  }, { ...readyRecipes, now: () => new Date('2026-08-05T00:00:00Z') });
  const second = reviseStudioWorkflowProposal(first, 'Make it a fast preview, landscape, 6 seconds, seed 99', {
    ...readyRecipes,
    now: () => new Date('2026-08-05T00:01:00Z'),
  });
  assert.equal(second.version, 2);
  assert.equal(second.lane, 'preview');
  assert.equal(second.inputs.aspectRatio, '16:9');
  assert.equal(second.inputs.durationSeconds, 6);
  assert.equal(second.inputs.seed, 99);
  assert.deepEqual([second.generationEstimate.minimumSeconds, second.generationEstimate.maximumSeconds], [28, 75]);
  assert.deepEqual(second.lastRevision.changes.map((entry) => entry.field), ['lane', 'aspect ratio', 'duration', 'seed']);
});

test('creative revisions stay prompt data and cannot add executable workflow steps', () => {
  const first = proposeStudioWorkflow({ request: 'A cinematic city walk', referenceImage: '/tmp/actor.png' }, readyRecipes);
  const second = reviseStudioWorkflowProposal(first, 'Bring the camera lower and make the movement calmer', readyRecipes);
  assert.equal(second.archetypeId, first.archetypeId);
  assert.equal(second.inputs.directionNotes.length, 1);
  assert.match(second.compiledPrompt, /camera lower/);
  assert.deepEqual(second.phases.map((phase) => phase.id), first.phases.map((phase) => phase.id));
  assert.deepEqual(second.lastRevision.changes.map((entry) => entry.field), ['creative direction']);
});

test('inspection exposes Comfy nodes only for the Comfy-backed lane', () => {
  const final = proposeStudioWorkflow({ request: 'Anime character performance', referenceImage: '/tmp/anime.png' }, readyRecipes);
  assert.equal(inspectWorkflowProposal(final, readyRecipes).comfy.available, false);
  const preview = reviseStudioWorkflowProposal(final, 'Use a fast preview', readyRecipes);
  const inspection = inspectWorkflowProposal(preview, readyRecipes);
  assert.equal(inspection.comfy.available, true);
  assert.ok(inspection.comfy.nodes.some((node) => node.type === 'SaveVideo'));
  assert.ok(inspection.comfy.edges.length > 0);
});

test('play freezes the exact ready version and compiles existing brief inputs', () => {
  const plan = proposeStudioWorkflow({ request: 'Full body fashion walk', referenceImage: '/tmp/model.png' }, readyRecipes);
  const frozen = freezeWorkflowProposal(plan, 1, { ...readyRecipes, now: () => new Date('2026-08-05T00:02:00Z') });
  const patch = workflowProposalBriefPatch(frozen, readyRecipes);
  assert.equal(frozen.state, 'playing');
  assert.equal(patch.recipeId, 'coherent-local-film');
  assert.equal(patch.modelProfileId, 'ltx-2.3-mlx-q4');
  assert.equal(patch.executionInputs.referenceImage, '/tmp/model.png');
  assert.throws(() => freezeWorkflowProposal(plan, 2, readyRecipes), /expected version 1/);
});
