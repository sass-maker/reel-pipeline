import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  importSignificantReels,
  importedVariantToScript,
  importedVariantToVideoBrief,
  normalizeSignificantReelsEnvelope,
  runImportedVariantWorkflow,
} from '../src/significant-content-handoff.js';
import {
  buildFollowUpBrief,
  buildMetricsReceipt,
  buildRenderReceipt,
  buildUploadReceipt,
  buildVariantPerformanceReport,
  significantContentStatus,
} from '../src/significant-content-receipts.js';
import { IdeaStore } from '../src/studio/idea-store.js';
import { produceNext } from '../src/studio/factory.js';

const fixturePath = new URL('./fixtures/significant-content-reels-v1.json', import.meta.url);
const NOW = new Date('2026-07-13T07:00:00.000Z');

async function fixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

async function tempStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'significant-content-'));
  return { root, store: new IdeaStore({ filePath: path.join(root, 'ideas.json') }) };
}

test('validates the versioned complete approved handoff envelope', async () => {
  const envelope = normalizeSignificantReelsEnvelope(await fixture());
  assert.equal(envelope.variants.length, 2);
  assert.equal(envelope.variants[0].scenes[0].durationSeconds, 1.5);
  const unsupported = await fixture();
  unsupported.schema = 'significant-content-reels/v2';
  assert.throws(() => normalizeSignificantReelsEnvelope(unsupported), /unsupported/);
  const regenerated = await fixture();
  regenerated.variants[0].scenes[0].narration = 'A replacement hook.';
  assert.throws(() => normalizeSignificantReelsEnvelope(regenerated), /approved hook/);
});

test('imports each approved variant once and preserves frozen structured provenance', async () => {
  const { store } = await tempStore();
  const input = await fixture();
  const first = await importSignificantReels(input, { store });
  const retry = await importSignificantReels(input, { store });
  assert.equal(first.imported, 2);
  assert.equal(retry.imported, 0);
  assert.equal(retry.existing, 2);
  const ideas = await store.listIdeas();
  assert.equal(ideas.length, 2);
  assert.equal(ideas[0].status, 'new');
  assert.equal(ideas[0].contentSource.packageRevision, 3);
  assert.equal(ideas[0].approvedVariant.hook, input.variants[0].hook);
  assert.equal(Object.isFrozen(ideas[0].approvedVariant), true);
  assert.throws(() => { ideas[0].approvedVariant.hook = 'mutated'; }, TypeError);
});

test('skips content-identical package revisions and imports changed revisions attributably', async () => {
  const { store } = await tempStore();
  const input = await fixture();
  await importSignificantReels(input, { store });
  const unchangedRevision = structuredClone(input);
  unchangedRevision.packageRevision = 4;
  const unchanged = await importSignificantReels(unchangedRevision, { store });
  assert.equal(unchanged.imported, 0);
  assert.ok(unchanged.results.every((result) => result.reason === 'unchanged_revision'));

  const changedRevision = structuredClone(unchangedRevision);
  changedRevision.variants[0].hook = 'Bad sketches still count as field notes.';
  changedRevision.variants[0].scenes[0].narration = changedRevision.variants[0].hook;
  const changed = await importSignificantReels(changedRevision, { store });
  assert.equal(changed.imported, 1);
  const revisionFour = (await store.listIdeas()).find((idea) => idea.contentSource.packageRevision === 4);
  assert.equal(revisionFour.contentSource.variantId, 'permission-slip');
  assert.match(revisionFour.idempotencyKey, /:4:permission-slip$/);
});

test('maps approved scenes directly to script and VideoBrief without replacing hook or payoff', async () => {
  const { store } = await tempStore();
  const input = await fixture();
  await importSignificantReels(input, { store });
  const idea = (await store.listIdeas())[0];
  const script = importedVariantToScript(idea);
  const brief = importedVariantToVideoBrief(idea, { engine: 'mock' });
  assert.equal(script.hook, input.variants[0].hook);
  assert.equal(script.payoff, input.variants[0].payoff);
  assert.deepEqual(script.scenes.map((scene) => scene.narration), input.variants[0].scenes.map((scene) => scene.narration));
  assert.deepEqual(script.scenes.map((scene) => scene.onScreenText), input.variants[0].scenes.map((scene) => scene.onScreenText));
  assert.equal(brief.hook, input.variants[0].hook);
  assert.match(brief.body, new RegExp(input.variants[0].payoff.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(brief.durationSeconds, input.variants[0].targetDurationSeconds);
  assert.equal(brief.cta, input.variants[0].cta);
});

test('imported workflow renders supplied script and leaves quality review authoritative', async () => {
  const { root, store } = await tempStore();
  const input = await fixture();
  await importSignificantReels(input, { store });
  const idea = (await store.listIdeas())[0];
  let renderedBrief;
  const result = await runImportedVariantWorkflow({
    idea,
    store,
    outputDir: root,
    rendererOptions: { renderer: { createVideo: async (brief) => {
      renderedBrief = brief;
      return { provider: 'fixture', status: 'completed', externalTaskId: 'render-a', videos: ['/tmp/fixture.mp4'] };
    } } },
    assessQuality: async ({ script }) => ({ verdict: 'review', overall: 72, hook: script.hook }),
    now: () => NOW,
  });
  assert.equal(renderedBrief.hook, input.variants[0].hook);
  assert.equal(result.quality.verdict, 'review');
  assert.equal((await store.listIdeas()).find((entry) => entry.id === idea.id).status, 'rendered');
  assert.equal(result.quality.verdict, 'review');
});

test('factory routes imported ideas through the approved-variant workflow', async () => {
  const { store } = await tempStore();
  const input = await fixture();
  await importSignificantReels({ ...input, variants: [input.variants[0]] }, { store });
  let received;
  const result = await produceNext({
    store,
    importedWorkflow: async ({ idea, store: ideaStore }) => {
      received = importedVariantToScript(idea);
      await ideaStore.updateIdea(idea.id, { status: 'rendered', notes: 'artifacts: /tmp/imported' });
      return { artifactDir: '/tmp/imported', video: '/tmp/imported/video.mp4', quality: { verdict: 'review' } };
    },
    workflow: async () => { throw new Error('ordinary generation must not run'); },
    packetBuilder: async () => ({ packetDir: '/tmp/imported/packet' }),
    logger: { warn: () => {} },
  });
  assert.equal(result.succeeded, 1);
  assert.equal(received.hook, input.variants[0].hook);
  assert.equal(received.payoff, input.variants[0].payoff);
});

test('builds stable render, upload, and metrics receipts with exact attribution', () => {
  const attribution = { packageId: 'hobby:urban-sketching-field-notes', packageRevision: 3, variantId: 'permission-slip' };
  const render = buildRenderReceipt({ ...attribution, provider: 'mock', externalId: 'render-1', externalUrl: 'https://assets.example/render.mp4', occurredAt: NOW.toISOString() });
  const upload = buildUploadReceipt({ ...attribution, provider: 'youtube', externalId: 'yt-1', externalUrl: 'https://youtu.be/yt-1', occurredAt: NOW.toISOString() });
  const metrics = buildMetricsReceipt({
    ...attribution, provider: 'youtube', externalId: 'yt-1', externalUrl: 'https://youtu.be/yt-1', occurredAt: NOW.toISOString(),
    metrics: { views: 1000, watchTimeSeconds: 7000, retentionRate: 0.62, likes: 80, comments: 10, shares: 5, saves: 2 },
  });
  assert.equal(render.attributionKey, 'hobby:urban-sketching-field-notes:3:permission-slip');
  assert.equal(upload.status, 'published');
  assert.equal(metrics.metrics.engagementRate, 0.097);
  assert.equal(buildUploadReceipt({ ...attribution, provider: 'youtube', externalId: 'yt-1', externalUrl: 'https://youtu.be/yt-1', occurredAt: NOW.toISOString() }).receiptId, upload.receiptId);
});

test('reports status, comparable performance, missing data, and draft-only follow-up', async () => {
  const { store } = await tempStore();
  const input = await fixture();
  await importSignificantReels(input, { store });
  const ideas = await store.listIdeas();
  const receipts = ideas.flatMap((idea, index) => {
    const attribution = idea.contentSource;
    return [
      buildRenderReceipt({ ...attribution, provider: 'mock', externalId: `render-${index}`, occurredAt: NOW.toISOString() }),
      buildUploadReceipt({ ...attribution, provider: 'youtube', externalId: `yt-${index}`, externalUrl: `https://youtu.be/yt-${index}`, occurredAt: NOW.toISOString() }),
      buildMetricsReceipt({
        ...attribution, provider: 'youtube', externalId: `yt-${index}`, externalUrl: `https://youtu.be/yt-${index}`, occurredAt: NOW.toISOString(),
        evidenceWindow: { start: '2026-07-13T06:00:00Z', end: NOW.toISOString() },
        metrics: index === 0
          ? { views: 2000, retentionRate: 0.7, likes: 120, comments: 20, shares: 10, saves: 10 }
          : { views: 900, averageViewDurationSeconds: 9, likes: 30, comments: 4, shares: 2, saves: 5 },
      }),
    ];
  });
  const status = significantContentStatus({ ideas, receipts, packageId: input.packageId, packageRevision: input.packageRevision });
  assert.equal(status.ok, true);
  assert.equal(status.variants.every((variant) => variant.nextAction.action === 'report'), true);
  const incomplete = buildMetricsReceipt({
    packageId: input.packageId, packageRevision: input.packageRevision, variantId: 'missing-retention',
    provider: 'youtube', externalId: 'yt-missing', occurredAt: NOW.toISOString(),
    metrics: { views: 100, likes: 4, comments: 1 },
  });
  const report = buildVariantPerformanceReport([...receipts, incomplete], { generatedAt: NOW.toISOString() });
  assert.equal(report.packages[0].leader.variantId, 'permission-slip');
  assert.deepEqual(report.packages[0].missingOrIncomparable[0], { variantId: 'missing-retention', missing: ['retention_or_watch_time'] });
  const followUp = buildFollowUpBrief({ report, ideas, packageId: input.packageId, packageRevision: input.packageRevision, generatedAt: NOW.toISOString() });
  assert.equal(followUp.state, 'draft');
  assert.equal(followUp.approval.status, 'draft');
  assert.equal(followUp.constraints.mutatesPublishedClaims, false);
  assert.equal(followUp.winningPattern.hook, input.variants[0].hook);
});

test('status detects unknown attribution and conflicting external ids', async () => {
  const { store } = await tempStore();
  const input = await fixture();
  await importSignificantReels(input, { store });
  const ideas = await store.listIdeas();
  const base = { ...ideas[0].contentSource, provider: 'youtube', occurredAt: NOW.toISOString() };
  const receipts = [
    buildUploadReceipt({ ...base, externalId: 'yt-a', externalUrl: 'https://youtu.be/yt-a' }),
    buildUploadReceipt({ ...base, externalId: 'yt-b', externalUrl: 'https://youtu.be/yt-b' }),
    buildRenderReceipt({ ...base, variantId: 'unknown', externalId: 'render-unknown' }),
  ];
  const status = significantContentStatus({ ideas, receipts });
  assert.equal(status.ok, false);
  assert.ok(status.conflicts.some((conflict) => conflict.type === 'unknown_attribution'));
  assert.ok(status.conflicts.some((conflict) => conflict.type === 'conflicting_external_ids'));
});
