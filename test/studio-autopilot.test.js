import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { IdeaStore } from '../src/studio/idea-store.js';
import { MarketingBriefStore } from '../src/studio/briefs.js';
import {
  rankPolicyRecipes,
  resolvePolicySchedule,
  runStudioAutopilot,
  studioAutopilotStatus,
} from '../src/studio/autopilot.js';

const NOW = new Date('2026-07-31T12:00:00.000Z');
const READY_RECIPE_CONTEXT = {
  htmlCapability: { ready: true, chromePath: '/fixture/chrome', ffmpegPath: '/fixture/ffmpeg', blocker: null },
};

test('ranks ready policy recipes within spend and explains rejections', () => {
  const ranked = rankPolicyRecipes(policy({
    recipes: ['grok-asset-film', 'image-slideshow'],
    spendCeiling: 'local-compute',
  }), READY_RECIPE_CONTEXT);
  assert.equal(ranked.selected.id, 'image-slideshow');
  assert.equal(ranked.candidates[0].accepted, false);
  assert.equal(ranked.candidates[0].reason, 'spend-ceiling');
  assert.equal(ranked.candidates[1].accepted, true);
});

test('dry run reports work without writing ideas or briefs', async () => {
  const stores = await tempStores();
  const result = await runStudioAutopilot({
    policy: policy(), ...stores, now: () => NOW,
    discoverSources: async () => [source()],
  });
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.policies[0].items[0].action, 'create-and-produce');
  assert.equal((await stores.ideaStore.load()).length, 0);
  assert.equal((await stores.briefStore.load()).length, 0);
});

test('execute creates one idea, brief, render, and Postiz draft then unchanged retry reuses all receipts', async () => {
  const stores = await tempStores();
  let renders = 0;
  let submissions = 0;
  const options = {
    policy: policy(), ...stores, execute: true, now: () => NOW,
    discoverSources: async () => [source()],
    executeProduction: async ({ recipe }) => {
      renders += 1;
      return passingRender(recipe);
    },
    submitDistribution: async (brief, submission) => {
      submissions += 1;
      assert.match(submission.approvedBy, /^automation:high-signal-daily:r1$/);
      return {
        request: { provider: 'postiz', scheduledFor: submission.scheduledFor ?? null },
        receipt: { externalId: 'postiz-1', externalUrl: 'https://postiz.example.test/posts/1', status: 'drafted' },
      };
    },
  };
  const first = await runStudioAutopilot(options);
  const second = await runStudioAutopilot(options);

  assert.equal(first.policies[0].items[0].state, 'drafted');
  assert.equal(second.policies[0].items[0].outcome, 'unchanged');
  assert.equal(renders, 1);
  assert.equal(submissions, 1);
  assert.equal((await stores.ideaStore.load()).length, 1);
  assert.equal((await stores.briefStore.load()).length, 1);
  const [brief] = await stores.briefStore.load();
  assert.equal(brief.media.uploadEvidence.publicUrl, 'https://assets.example.test/render.mp4');
  assert.equal(brief.distribution.receipt.externalId, 'postiz-1');

  const dryUnchanged = await runStudioAutopilot({
    policy: policy(), ...stores, now: () => NOW,
    discoverSources: async () => [source()],
  });
  assert.equal(dryUnchanged.policies[0].items[0].action, 'unchanged');
  const revised = source();
  revised.fingerprint = 'revised-source-fingerprint';
  const dryRevised = await runStudioAutopilot({
    policy: policy(), ...stores, now: () => NOW,
    discoverSources: async () => [revised],
  });
  assert.equal(dryRevised.policies[0].items[0].action, 'create-and-produce');
});

test('bounded fallback preserves failed attempts and succeeds with the next ready recipe', async () => {
  const stores = await tempStores();
  const attempted = [];
  const result = await runStudioAutopilot({
    policy: policy({ recipes: ['image-slideshow', 'web-motion'], maxAttempts: 2, distribution: { mode: 'none', schedule: null } }),
    ...stores, execute: true, now: () => NOW,
    discoverSources: async () => [source()],
    executeProduction: async ({ recipe }) => {
      attempted.push(recipe.id);
      if (recipe.id === 'image-slideshow') throw new Error('first renderer unavailable');
      return passingRender(recipe);
    },
  });
  const [idea] = await stores.ideaStore.load();
  assert.deepEqual(attempted, ['image-slideshow', 'web-motion']);
  assert.deepEqual(idea.automation.attempts.map((attempt) => attempt.outcome), ['failed', 'passed']);
  assert.equal(result.policies[0].items[0].state, 'distribution-ready');
});

test('passing local render stops at a visible stable-media recovery action', async () => {
  const stores = await tempStores();
  let renders = 0;
  const firstOptions = {
    policy: policy(), ...stores, execute: true, now: () => NOW,
    discoverSources: async () => [source()],
    executeProduction: async ({ recipe }) => {
      renders += 1;
      return { ...passingRender(recipe), publicUrl: null, uploadEvidence: null };
    },
    publishArtifacts: async (render) => render,
  };
  const result = await runStudioAutopilot(firstOptions);
  const item = result.policies[0].items[0];
  assert.equal(item.outcome, 'media-blocked');
  assert.equal(item.state, 'review-required');
  assert.match(item.nextAction, /artifact publisher/);

  const resumed = await runStudioAutopilot({
    ...firstOptions,
    publishArtifacts: async (render) => ({ ...render, videos: ['https://assets.example.test/reused.mp4'] }),
    submitDistribution: async () => ({
      request: { provider: 'postiz', scheduledFor: null },
      receipt: { externalId: 'postiz-reused', status: 'drafted' },
    }),
  });
  assert.equal(resumed.policies[0].items[0].state, 'drafted');
  assert.equal(renders, 1);
  assert.equal((await stores.briefStore.load())[0].media.publicUrl, 'https://assets.example.test/reused.mp4');
});

test('existing idempotency collisions never repurpose an immutable origin', async () => {
  const stores = await tempStores();
  const selectedPolicy = policy();
  const selectedSource = source();
  const key = [
    'studio-autopilot', selectedPolicy.id, 'r1', selectedSource.sourceAdapter,
    selectedSource.sourceId, selectedSource.fingerprint, 'youtube_shorts',
  ].join(':');
  await stores.ideaStore.saveIdea({ title: 'Operator-owned idea', idempotencyKey: key });
  const result = await runStudioAutopilot({
    policy: selectedPolicy, ...stores, execute: true, now: () => NOW,
    discoverSources: async () => [selectedSource],
    executeProduction: async () => { throw new Error('must not execute'); },
  });
  assert.equal(result.policies[0].items[0].outcome, 'policy-mismatch');
  assert.match(result.policies[0].items[0].error, /does not match/);
  assert.equal((await stores.ideaStore.load())[0].origin.lane, 'operator-request');
});

test('status separates all three content lanes and exposes recovery exceptions', async () => {
  const stores = await tempStores();
  await stores.ideaStore.saveIdea({ title: 'Ask me item' });
  await runStudioAutopilot({
    policy: policy(), ...stores, execute: true, now: () => NOW,
    discoverSources: async () => [source()],
    executeProduction: async ({ recipe }) => ({ ...passingRender(recipe), publicUrl: null, uploadEvidence: null }),
  });
  const status = await studioAutopilotStatus(stores);
  assert.equal(status.lanes['operator-request'], 1);
  assert.equal(status.lanes['project-automation'], 1);
  assert.equal(status.lanes['personal-automation'], 0);
  assert.equal(status.exceptions.length, 1);
  assert.match(status.exceptions[0].nextAction, /artifact publisher/);
});

test('policy schedules must resolve to an exact future instant', () => {
  assert.equal(resolvePolicySchedule({ delayMinutes: 30 }, NOW), '2026-07-31T12:30:00.000Z');
  assert.throws(() => resolvePolicySchedule({ scheduledFor: '2026-07-31T11:00:00.000Z' }, NOW), /future/);
  assert.throws(() => resolvePolicySchedule({}, NOW), /requires/);
});

async function tempStores() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'studio-autopilot-'));
  return {
    ideaStore: new IdeaStore({ filePath: path.join(dir, 'ideas.json') }),
    briefStore: new MarketingBriefStore({ filePath: path.join(dir, 'briefs.json'), now: () => NOW }),
    recipeContext: READY_RECIPE_CONTEXT,
  };
}

function policy(overrides = {}) {
  return {
    id: 'high-signal-daily', revision: 1, enabled: true, label: 'High Signal daily',
    scope: { type: 'project', projectSlug: 'high-signal' },
    source: { adapter: 'high-signal' },
    trigger: { type: 'scheduled', cadence: 'daily' },
    channels: ['youtube_shorts'],
    recipes: ['image-slideshow'],
    spendCeiling: 'local-compute', sourceRights: 'approved',
    maxItemsPerRun: 1, maxAttempts: 2, qualityThreshold: 'pass',
    distribution: { mode: 'draft', schedule: null },
    ...overrides,
  };
}

function source() {
  return {
    sourceAdapter: 'high-signal-reel-briefs', sourceId: 'proof-1', revision: 1,
    fingerprint: 'stable-source-fingerprint', projectSlug: 'high-signal',
    title: 'Proof changes the decision', summary: 'One proof makes the choice easier.',
    audience: 'Product builders', canonicalUrl: 'https://highsignal.app/briefs/proof-1',
    destinationUrl: 'https://highsignal.app/briefs/proof-1', claim: 'Visible evidence improves trust.',
    hook: 'Show the proof first.', cta: 'Read the brief.', generatedAt: NOW.toISOString(),
    eligibility: { eligible: true, reason: 'source-backed-content-package' }, contentPackage: null,
  };
}

function passingRender(recipe) {
  return {
    artifactDir: '/tmp/studio/proof', localVideo: '/tmp/studio/proof/render.mp4',
    video: 'https://assets.example.test/render.mp4', publicUrl: 'https://assets.example.test/render.mp4',
    previewPath: '/tmp/studio/proof/render.mp4', previewType: 'video', provider: recipe.engine,
    quality: { verdict: 'pass', overall: 92 },
    uploadEvidence: { publicUrl: 'https://assets.example.test/render.mp4', provider: 'fixture', recordedAt: NOW.toISOString() },
  };
}
