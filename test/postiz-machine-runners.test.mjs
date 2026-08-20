import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { buildDistributionRequest } from '../src/distribution.js';
import { processPostizQueue } from '../scripts/postiz-queued-distribution.mjs';
import { syncPostizEvidence } from '../scripts/postiz-evidence-sync.mjs';

const contentPackage = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/approved-content-package.json'), 'utf8'));
const mediaReceipt = {
  schema: 'fleet.media-receipt.v1', packageId: contentPackage.id, packageRevision: contentPackage.revision,
  variantId: contentPackage.variants[0].id, brand: contentPackage.brand.slug,
  channel: contentPackage.variants[0].channel, provider: 'brand-video-local', status: 'rendered',
  artifact: '/tmp/fixture.mp4', publicUrl: 'https://assets.example.test/fixture.mp4',
};

function fixture() {
  const runtimeRoot = mkdtempSync(resolve(tmpdir(), 'fleet-postiz-runner-'));
  mkdirSync(resolve(runtimeRoot, 'queue'), { recursive: true });
  const request = buildDistributionRequest(contentPackage, mediaReceipt, { provider: 'postiz' });
  request.approval = { status: 'approved', approvedAt: '2026-07-21T10:00:00Z', approvedBy: 'owner' };
  writeFileSync(resolve(runtimeRoot, 'queue', 'one.json'), `${JSON.stringify({ schemaVersion: 1, contentPackage, mediaReceipt, request })}\n`);
  return { runtimeRoot, request };
}

test('machine queue creates drafts only and records a sanitized receipt', async () => {
  const { runtimeRoot } = fixture();
  const calls = [];
  const summary = await processPostizQueue({
    runtimeRoot,
    postizClient: { post: async (input) => { calls.push(input); return { provider: 'postiz', status: 'draft', externalId: 'post-1', externalUrl: null }; } },
  });
  assert.deepEqual(summary, { scanned: 1, drafted: 1, skipped: 0, failed: 0, indeterminate: 0 });
  assert.equal(calls.length, 1);
  const [receiptName] = readdirSync(resolve(runtimeRoot, 'receipts'));
  const receipt = JSON.parse(readFileSync(resolve(runtimeRoot, 'receipts', receiptName), 'utf8'));
  assert.equal(receipt.status, 'draft');
  assert.equal(JSON.stringify(receipt).includes(contentPackage.topic.title), false);
});

test('machine queue quarantines ambiguous creates and never retries them in place', async () => {
  const { runtimeRoot } = fixture();
  const error = Object.assign(new Error('connection closed'), { code: 'POSTIZ_NETWORK', ambiguous: true, requestId: 'request-1' });
  const summary = await processPostizQueue({ runtimeRoot, postizClient: { post: async () => { throw error; } } });
  assert.equal(summary.indeterminate, 1);
  const outcome = JSON.parse(readFileSync(resolve(runtimeRoot, 'indeterminate', 'one.json.outcome.json'), 'utf8'));
  assert.deepEqual(outcome, { schemaVersion: 1, status: 'indeterminate', code: 'POSTIZ_NETWORK', requestId: 'request-1', recordedAt: outcome.recordedAt });
});

test('evidence sync emits analytics events without post content or integration ids', async () => {
  const { runtimeRoot } = fixture();
  mkdirSync(resolve(runtimeRoot, 'receipts'), { recursive: true });
  writeFileSync(resolve(runtimeRoot, 'receipts', 'request-1.json'), `${JSON.stringify({ provider: 'postiz', externalId: 'post-1', requestId: 'request-1', brand: 'high-signal' })}\n`);
  const summary = await syncPostizEvidence({
    runtimeRoot,
    postizClient: { analytics: async () => ({ recordedAt: '2026-07-21T12:00:00Z', metrics: [{ label: 'Views', data: [{ date: '2026-07-21', total: '42' }], percentageChange: null }] }) },
  });
  assert.equal(summary.measured, 1);
  const event = JSON.parse(readFileSync(resolve(runtimeRoot, 'events', 'request-1-analytics.json'), 'utf8'));
  assert.equal(event.kind, 'postiz-analytics');
  assert.equal(JSON.stringify(event).includes('post content'), false);
  assert.equal(JSON.stringify(event).includes('integration'), false);
});
