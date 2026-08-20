import assert from 'node:assert/strict';
import test from 'node:test';

import { buildStudioHistory, summarizeRecipeLibrary } from '../src/studio/studio-libraries.js';

test('history keeps prompt workflow and playable video in one derived record', async () => {
  const history = await buildStudioHistory([{
    id: 'sample_after-dark',
    title: 'After dark',
    request: 'A precise creative prompt.',
    createdAt: '2026-08-06T00:00:00.000Z',
    updatedAt: '2026-08-06T00:01:00.000Z',
    lifecycle: 'needs-review',
    projectSlug: 'studio-samples',
    workflowProposal: {
      id: 'workflow_1', version: 1, state: 'played', archetypeId: 'night-out-rush', archetypeVersion: 1,
      name: 'Night Out rush', lane: 'final', compiledPrompt: 'Compiled.',
      binding: { workflowRecipeId: 'ltx-final', recipeVersion: 1, modelProfileId: 'ltx-2.3', engine: 'local-video-forge' },
      inputs: { seed: 42, aspectRatio: '9:16', durationSeconds: 3.375 },
      phases: [{ id: 'render', name: 'Generate final shot', owner: 'Forge', detail: 'Pinned', status: 'ready' }],
    },
    media: {
      videoPath: '/tmp/after-dark.mp4',
      quality: { verdict: 'needs-review' },
      execution: { evidence: { ownerManifestPath: '/tmp/receipt.json' } },
    },
    approval: { reviewDecision: 'pending' },
  }], {
    fileStat: async () => ({ isFile: () => true, size: 2048 }),
    probeVideo: async () => ({ ok: true, durationSeconds: 12, width: 1080, height: 1920, hasAudio: true }),
  });

  assert.equal(history.length, 1);
  assert.equal(history[0].sampleId, 'after-dark');
  assert.equal(history[0].prompt, 'A precise creative prompt.');
  assert.equal(history[0].workflow.recipeId, 'ltx-final');
  assert.equal(history[0].video.bytes, 2048);
  assert.equal(history[0].video.durationSeconds, 12);
  assert.equal(history[0].receiptPath, '/tmp/receipt.json');
});

test('history does not invent a player when the artifact is missing', async () => {
  const history = await buildStudioHistory([{
    id: 'brief_1', title: 'Planned', request: 'Prompt', createdAt: '2026-08-06T00:00:00.000Z',
    updatedAt: '2026-08-06T00:00:00.000Z', lifecycle: 'planned', workflowProposal: null, media: null,
  }]);
  assert.equal(history[0].video, null);
  assert.equal(history[0].workflow, null);
});

test('history prefers the executed composite workflow over an earlier proposal', async () => {
  const executed = {
    id:'story@1', version:1, state:'played', name:'Five-shot story cut',
    modelProfileId:'ltx-2.3-mlx-q4', runtime:'local-story-runner', phases:[],
  };
  const [entry] = await buildStudioHistory([{
    id:'story_1', title:'Story', request:'Five coherent scenes.',
    createdAt:'2026-08-06T00:00:00.000Z', updatedAt:'2026-08-06T00:01:00.000Z',
    lifecycle:'needs-review', workflowProposal:{ id:'older-proposal' },
    media:{ videoPath:'/tmp/story.mp4', execution:{ workflow:executed } },
  }], {
    fileStat:async () => ({ isFile:() => true, size:100 }),
    probeVideo:async () => ({ ok:true, durationSeconds:30, width:576, height:1024, hasAudio:true }),
  });
  assert.deepEqual(entry.workflow, executed);
});

test('history does not advertise an existing file that is not a decodable video', async () => {
  const [entry] = await buildStudioHistory([{
    id:'legacy_mock', title:'Old mock', request:'Mock prompt',
    createdAt:'2026-08-06T00:00:00.000Z', updatedAt:'2026-08-06T00:01:00.000Z',
    lifecycle:'rendered', workflowProposal:null, media:{ videoPath:'/tmp/not-really-video.mp4' },
  }], {
    fileStat:async () => ({ isFile:() => true, size:49 }),
    probeVideo:async () => ({ ok:false, reason:'invalid data' }),
  });
  assert.equal(entry.video, null);
  assert.equal(entry.videoUnavailableReason, 'The saved artifact is not a decodable video.');
});

test('recipe library is a bounded projection of existing recipes', () => {
  const library = summarizeRecipeLibrary([{
    id: 'film', name: 'Film', description: 'A film.', kind: 'coherent-film', owner: 'Studio', runtime: 'local',
    delivery: { kind: 'final-video' }, spend: { label: 'Local' }, readiness: { ready: true }, channels: ['instagram_reels'],
    defaults: { durationSeconds: 15 }, options: [{ id: 'pace', label: 'Pace', type: 'enum', choices: ['slow', 'fast'] }],
    variants: [{ id: 'slow' }, { id: 'fast' }],
  }], [{ id: 'ltx-final', readiness: { ready: true } }]);
  assert.equal(library.recipes[0].variantCount, 2);
  assert.deepEqual(library.recipes[0].controls[0].choices, ['slow', 'fast']);
  assert.equal(library.workflowRecipes[0].id, 'ltx-final');
});
