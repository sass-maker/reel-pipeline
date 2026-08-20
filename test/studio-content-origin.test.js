import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTENT_LANES,
  normalizeContentOrigin,
} from '../src/studio/content-origin.js';
import {
  loadAutomationPolicies,
  normalizeAutomationPolicies,
  spendAllowed,
} from '../src/studio/automation-policy.js';
import { IdeaStore } from '../src/studio/idea-store.js';
import { MarketingBriefStore } from '../src/studio/briefs.js';

test('content origin derives the three lanes from scope and trigger', () => {
  const project = normalizeContentOrigin({
    scope: { type: 'project', projectSlug: 'high-signal' },
    trigger: { type: 'scheduled', automationPolicyId: 'high-signal-daily', automationPolicyRevision: 1 },
    source: { adapter: 'high-signal', sourceId: 'brief-1', fingerprint: 'abc', canonicalUrl: 'https://highsignal.app/changelog' },
  }, { projectSlug: 'high-signal' });
  const requested = normalizeContentOrigin(null, { projectSlug: 'high-signal' });
  const personal = normalizeContentOrigin({
    scope: { type: 'personal' },
    trigger: { type: 'event', automationPolicyId: 'personal-feed', automationPolicyRevision: 2 },
    source: { adapter: 'personal-feed', sourceId: 'post-1', fingerprint: 'def' },
  });
  assert.deepEqual(CONTENT_LANES, ['project-automation', 'operator-request', 'personal-automation']);
  assert.equal(project.lane, 'project-automation');
  assert.equal(requested.lane, 'operator-request');
  assert.equal(requested.scope.projectSlug, 'high-signal');
  assert.equal(personal.lane, 'personal-automation');
});

test('content origin rejects conflicting and under-specified automation', () => {
  assert.throws(() => normalizeContentOrigin({
    scope: { type: 'personal', projectSlug: 'high-signal' },
    trigger: { type: 'operator-request' },
  }), /personal-scoped origin cannot include projectSlug/);
  assert.throws(() => normalizeContentOrigin({
    scope: { type: 'project', projectSlug: 'high-signal' },
    trigger: { type: 'scheduled' },
  }), /requires automationPolicyId/);
  assert.throws(() => normalizeContentOrigin({
    lane: 'personal-automation',
    scope: { type: 'project', projectSlug: 'high-signal' },
    trigger: { type: 'operator-request' },
  }), /conflicts with scope and trigger/);
});

test('idea and brief stores preserve immutable origin while normalizing legacy records', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'studio-origin-'));
  const ideaStore = new IdeaStore({ filePath: path.join(dir, 'ideas.json') });
  const origin = normalizeContentOrigin({
    scope: { type: 'project', projectSlug: 'high-signal' },
    trigger: { type: 'scheduled', automationPolicyId: 'high-signal-daily', automationPolicyRevision: 1 },
    source: { adapter: 'high-signal', sourceId: 'brief-1', revision: 3, fingerprint: 'source-hash' },
  }, { projectSlug: 'high-signal' });
  const idea = await ideaStore.saveIdea({ title: 'Automated idea', projectSlug: 'high-signal', origin });
  const updatedIdea = await ideaStore.updateIdea(idea.id, {
    notes: 'kept',
    origin: normalizeContentOrigin(null),
  });
  assert.deepEqual(updatedIdea.origin, origin);
  assert.equal((await ideaStore.listIdeas({ lane: 'project-automation' })).length, 1);

  const briefStore = new MarketingBriefStore({ filePath: path.join(dir, 'briefs.json') });
  const brief = await briefStore.create({ request: 'Automated brief', projectSlug: 'high-signal', origin });
  const updatedBrief = await briefStore.update(brief.id, { origin: normalizeContentOrigin(null), summary: 'changed' });
  assert.deepEqual(updatedBrief.origin, origin);
  const legacy = await briefStore.create({ request: 'Legacy personal brief' });
  assert.equal(legacy.origin.lane, 'operator-request');
  assert.equal(legacy.origin.scope.type, 'personal');
});

test('automation registry validates initial policies and spend ceilings', async () => {
  const registry = await loadAutomationPolicies();
  assert.deepEqual(registry.policies.map((policy) => policy.id), [
    'high-signal-daily',
    'significant-hobbies-weekly',
    'major-project-changelog',
  ]);
  assert.equal(registry.policies.every((policy) => policy.enabled), true);
  assert.equal(spendAllowed('none', 'local-compute'), true);
  assert.equal(spendAllowed('paid-api', 'local-compute'), false);
  assert.throws(() => normalizeAutomationPolicies({
    $schema: 'fleet.studio-automation-policies.v1',
    version: 1,
    policies: [{
      ...registry.policies[0],
      id: 'bad-paid-policy',
      recipes: ['grok-asset-film'],
      spendCeiling: 'free-ish',
    }],
  }), /spend ceiling/);
  assert.throws(() => normalizeAutomationPolicies({
    $schema: 'fleet.studio-automation-policies.v1', version: 1,
    apiKey: 'must-not-live-here', policies: registry.policies,
  }), /secret-free: apiKey/);
});

test('idea idempotency reuses records and automation progress resumes in place', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'studio-idempotency-'));
  const store = new IdeaStore({ filePath: path.join(dir, 'ideas.json') });
  const origin = {
    scope: { type: 'project', projectSlug: 'high-signal' },
    trigger: { type: 'scheduled', automationPolicyId: 'high-signal-daily', automationPolicyRevision: 1 },
    source: { adapter: 'high-signal', sourceId: 'same-source', fingerprint: 'same-fingerprint' },
  };
  const first = await store.saveIdea({
    title: 'First title', projectSlug: 'high-signal', origin,
    idempotencyKey: 'same-key',
    automation: { policyId: 'high-signal-daily', policyRevision: 1, state: 'queued' },
  });
  const repeated = await store.saveIdea({
    title: 'Duplicate title', projectSlug: 'high-signal', origin,
    idempotencyKey: 'same-key',
  });
  assert.equal(repeated.id, first.id);
  assert.equal((await store.load()).length, 1);

  const resumed = await store.updateIdea(first.id, {
    automation: { state: 'rendered', briefId: 'brief-1', nextAction: 'Prepare Postiz draft' },
  });
  assert.equal(resumed.automation.policyId, 'high-signal-daily');
  assert.equal(resumed.automation.state, 'rendered');
  assert.equal((await store.findByIdempotencyKey('same-key')).automation.briefId, 'brief-1');
});
