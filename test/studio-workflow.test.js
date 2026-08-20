import assert from 'node:assert/strict';
import { mkdtemp, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { StudioLlm } from '../src/studio/llm.js';
import { IdeaStore } from '../src/studio/idea-store.js';
import { generateScript } from '../src/studio/script.js';
import { scriptToBrief, runFacelessWorkflow, runBatch, runSourceBackedWorkflow } from '../src/studio/workflow.js';
import { getProductionRecipe } from '../src/studio/production-catalog.js';

const offlineLlm = new StudioLlm({ apiKey: '' });
const silent = { info: () => {}, warn: () => {} };

async function tempDir(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix));
}

test('idea store saves, lists, and updates status', async () => {
  const dir = await tempDir('studio-ideas-');
  const store = new IdeaStore({ filePath: path.join(dir, 'ideas.json') });
  const idea = await store.saveIdea({ title: 'Test idea', niche: 'testing' });
  assert.equal(idea.status, 'new');
  const listed = await store.listIdeas();
  assert.equal(listed.length, 1);
  const updated = await store.updateIdeaStatus(idea.id, 'scripted');
  assert.equal(updated.status, 'scripted');
  await assert.rejects(() => store.updateIdeaStatus(idea.id, 'bogus'), /unsupported idea status/);
  await assert.rejects(() => store.saveIdea({}), /requires a title/);
});

test('scriptToBrief produces a valid brief with a single voice by default', async () => {
  const script = await generateScript({ topic: 'meal prep basics', durationSeconds: 60, llm: offlineLlm });
  const { brief, voicePlan } = scriptToBrief(script, { engine: 'mock' });
  assert.equal(brief.channel, 'youtube_shorts');
  assert.equal(brief.renderMode, 'mock');
  assert.equal(voicePlan.rotation, false);
  assert.equal(new Set(voicePlan.scenes.map((scene) => scene.voice)).size, 1);
});

test('short-form scripts preserve a selected reel duration', async () => {
  const script = await generateScript({ topic: 'night out carousel', durationSeconds: 13, llm: offlineLlm });
  const { brief } = scriptToBrief(script, { engine: 'night-out-carousel' });
  assert.equal(script.targetDurationSeconds, 13);
  assert.equal(brief.durationSeconds, 13);
});

test('voice rotation requires explicit opt-in', async () => {
  const script = await generateScript({ topic: 'meal prep basics', durationSeconds: 60, llm: offlineLlm });
  const { voicePlan } = scriptToBrief(script, { engine: 'mock', voiceRotation: true });
  assert.equal(voicePlan.rotation, true);
  assert.ok(new Set(voicePlan.scenes.map((scene) => scene.voice)).size > 1);
});

test('long-form scripts clamp the brief duration without losing script length', async () => {
  const script = await generateScript({ topic: 'the history of aviation', durationSeconds: 600, llm: offlineLlm });
  const { brief } = scriptToBrief(script, { engine: 'mock' });
  assert.equal(brief.durationSeconds, 90);
  assert.equal(script.targetDurationSeconds, 600);
});

test('faceless workflow runs mock end-to-end and writes artifacts', async () => {
  const out = await tempDir('studio-faceless-');
  const storeDir = await tempDir('studio-store-');
  const summary = await runFacelessWorkflow({
    topic: 'five minute stretching routine',
    durationSeconds: 60,
    engine: 'mock',
    outputDir: out,
    ideaStore: new IdeaStore({ filePath: path.join(storeDir, 'ideas.json') }),
    rendererOptions: { mock: { artifactDir: path.join(out, 'renders') } },
    llm: offlineLlm,
    logger: silent,
  });
  assert.equal(summary.renderStatus, 'completed');
  assert.ok(summary.video);
  for (const file of ['script.json', 'brief.json', 'metadata.json', 'render.json']) {
    await access(path.join(summary.artifactDir, file));
  }
  const metadata = JSON.parse(await readFile(path.join(summary.artifactDir, 'metadata.json'), 'utf8'));
  assert.ok(metadata.titles.length >= 5);
  assert.ok(metadata.tags.length >= 1);
  assert.equal(metadata.voicePlan.rotation, false);
});

test('faceless workflow preserves confirmed Marketing Studio inputs in the brief', async () => {
  const out = await tempDir('studio-confirmed-');
  const storeDir = await tempDir('studio-store-');
  const summary = await runFacelessWorkflow({
    topic: 'Evidence before automation',
    projectSlug: 'high-signal',
    channel: 'instagram_reels',
    briefId: 'brief-confirmed',
    durationSeconds: 45,
    hook: 'Proof first. Automation second.',
    cta: 'Read the evidence',
    creativeDirection: 'Use one product receipt as the dominant visual.',
    engine: 'mock',
    outputDir: out,
    ideaStore: new IdeaStore({ filePath: path.join(storeDir, 'ideas.json') }),
    rendererOptions: { mock: { artifactDir: path.join(out, 'renders') } },
    llm: offlineLlm,
    logger: silent,
  });
  assert.equal(summary.projectSlug, 'high-signal');
  assert.equal(summary.channel, 'instagram_reels');
  const brief = JSON.parse(await readFile(path.join(summary.artifactDir, 'brief.json'), 'utf8'));
  assert.equal(brief.projectSlug, 'high-signal');
  assert.equal(brief.channel, 'instagram_reels');
  assert.equal(brief.hook, 'Proof first. Automation second.');
  assert.equal(brief.cta, 'Read the evidence');
  assert.match(brief.body, /dominant visual/);
});

test('workflow does not auto-post and surfaces the handoff command only on request', async () => {
  const out = await tempDir('studio-faceless-');
  const storeDir = await tempDir('studio-store-');
  const base = {
    topic: 'desk posture fixes',
    engine: 'mock',
    outputDir: out,
    ideaStore: new IdeaStore({ filePath: path.join(storeDir, 'ideas.json') }),
    rendererOptions: { mock: { artifactDir: path.join(out, 'renders') } },
    llm: offlineLlm,
    logger: silent,
  };
  const without = await runFacelessWorkflow(base);
  assert.equal(without.postHandoff, null);
  const withHandoff = await runFacelessWorkflow({ ...base, postHandoff: true });
  assert.match(withHandoff.postHandoff.command, /distribution/);
  assert.match(withHandoff.postHandoff.command, /postiz/);
});

test('source-backed workflow renders deterministic supplied copy without inventing claims', async () => {
  const out = await tempDir('studio-source-backed-');
  const store = new IdeaStore({ filePath: path.join(out, 'ideas.json') });
  const idea = await store.saveIdea({ title: 'Evidence changes the decision', projectSlug: 'high-signal' });
  const summary = await runSourceBackedWorkflow({
    source: {
      projectSlug: 'high-signal', title: 'Evidence changes the decision',
      summary: 'One proof makes the choice easier.', claim: 'Visible evidence improves trust.',
      hook: 'Show the proof first.', cta: 'Read the evidence.',
      canonicalUrl: 'https://highsignal.app/briefs/proof-1', contentPackage: null,
    },
    recipe: getProductionRecipe('image-slideshow'),
    channel: 'youtube_shorts', ideaId: idea.id, ideaStore: store, outputDir: out,
    rendererOptions: { renderer: { createVideo: async () => ({ provider: 'fixture', status: 'completed', videos: ['/tmp/source-backed.mp4'] }) } },
    publishArtifacts: async (render) => render,
    assessQuality: async () => ({ verdict: 'pass', overall: 90 }),
    logger: silent,
  });
  const script = JSON.parse(await readFile(path.join(summary.artifactDir, 'script.json'), 'utf8'));
  assert.equal(script.source, 'standing-policy-source');
  assert.deepEqual(script.scenes.map((scene) => scene.narration), [
    'Show the proof first.',
    'One proof makes the choice easier.',
    'Visible evidence improves trust.',
    'Read the evidence.',
  ]);
  assert.equal(summary.publicUrl, null);
  assert.equal((await store.listIdeas())[0].status, 'rendered');
});

test('batch isolates per-topic failures and reports the split', async () => {
  const out = await tempDir('studio-batch-');
  const storeDir = await tempDir('studio-store-');
  const failingRenderer = {
    createVideo: async (brief) => {
      if (brief.title.includes('broken')) throw new Error('render exploded');
      return { provider: 'mock', externalTaskId: 't', status: 'completed', videos: ['/tmp/x.mp4'] };
    },
  };
  const summary = await runBatch({
    topics: ['good topic one', 'broken topic', 'good topic two'],
    engine: 'mock',
    outputDir: out,
    ideaStore: new IdeaStore({ filePath: path.join(storeDir, 'ideas.json') }),
    rendererOptions: { renderer: failingRenderer },
    llm: offlineLlm,
    logger: silent,
  });
  assert.equal(summary.total, 3);
  assert.equal(summary.succeeded, 2);
  assert.equal(summary.failed, 1);
  const failure = summary.results.find((r) => !r.ok);
  assert.equal(failure.topic, 'broken topic');
  await access(path.join(out, 'batch-summary.json'));
});
