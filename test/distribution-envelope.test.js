import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildDistributionRequest } from '../src/distribution.js';
import { buildDistributionEnvelope, envelopeSummary, parseDistributionEnvelope, upsertDistributionEnvelope } from '../src/distribution-envelope.js';

const approved = JSON.parse(await readFile(new URL('./fixtures/approved-content-package.json', import.meta.url), 'utf8'));
const proposed = structuredClone(approved);
proposed.approval = { status: 'proposed', approvedAt: null, approvedBy: null };
proposed.variants[0].status = 'proposed';
const receipt = {
  schema: 'fleet.media-receipt.v1', packageId: approved.id, packageRevision: 1,
  variantId: 'vertical-proof-v1', brand: 'high-signal', channel: 'youtube_shorts',
  provider: 'brand-video-local', status: 'rendered', artifact: '/tmp/proof.mp4', publicUrl: 'https://assets.example.test/proof.mp4',
};

test('distribution envelope survives a persisted notes round trip', () => {
  const request = buildDistributionRequest(approved, receipt, { provider: 'postiz', createdAt: '2026-07-12T12:00:00Z' });
  const envelope = buildDistributionEnvelope(approved, { mediaReceipt: receipt, distributionRequest: request });
  const notes = upsertDistributionEnvelope('Human-readable operator note.', envelope);
  const parsed = parseDistributionEnvelope(notes);
  assert.equal(parsed.contentPackage.id, approved.id);
  assert.equal(parsed.mediaReceipt.publicUrl, 'https://assets.example.test/proof.mp4');
  assert.equal(parsed.distributionRequest.approval.status, 'proposed');
  assert.match(notes, /^Human-readable operator note\./);
  assert.equal(notes.match(/fleet_distribution_v1:/g)?.length, 1);
});

test('upsert replaces the prior envelope instead of duplicating it', () => {
  const first = buildDistributionEnvelope(proposed);
  const second = { ...first, attempts: { ...first.attempts, count: 1, state: 'retry_wait', nextAttemptAt: '2026-07-12T13:00:00Z' } };
  const notes = upsertDistributionEnvelope(upsertDistributionEnvelope('', first), second);
  assert.equal(notes.match(/fleet_distribution_v1:/g)?.length, 1);
  assert.equal(parseDistributionEnvelope(notes).attempts.count, 1);
});

test('summary exposes no unpublished copy or evidence', () => {
  const summary = envelopeSummary(buildDistributionEnvelope(proposed));
  assert.deepEqual(Object.keys(summary), ['schema', 'packageId', 'packageRevision', 'brand', 'variantId', 'channel', 'mediaStatus', 'distributionStatus', 'attemptState', 'attemptCount', 'nextAttemptAt']);
  assert.equal(summary.mediaStatus, 'pending');
});

test('malformed encoded notes fail closed', () => {
  assert.throws(() => parseDistributionEnvelope('fleet_distribution_v1:not-json'), /invalid Fleet distribution envelope/);
});
