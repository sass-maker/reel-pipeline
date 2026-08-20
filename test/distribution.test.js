import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildDistributionRequest, executeDistribution, toMarketingPost } from '../src/distribution.js';

const contentPackage = JSON.parse(await readFile(new URL('./fixtures/approved-content-package.json', import.meta.url), 'utf8'));
const mediaReceipt = {
  schema: 'fleet.media-receipt.v1', packageId: contentPackage.id, packageRevision: 1,
  variantId: 'vertical-proof-v1', brand: 'high-signal', channel: 'youtube_shorts',
  provider: 'brand-video-local', status: 'rendered', artifact: '/tmp/proof.mp4',
};

test('buildDistributionRequest prepares a proposed request and never posts', () => {
  const request = buildDistributionRequest(contentPackage, mediaReceipt, { createdAt: '2026-07-12T12:10:00Z' });
  assert.equal(request.approval.status, 'proposed');
  assert.equal(request.accountSlug, 'high-signal-youtube');
  assert.equal(request.provider, 'manual');
});

test('executeDistribution requires a separate distribution approval', async () => {
  const request = buildDistributionRequest(contentPackage, mediaReceipt);
  await assert.rejects(executeDistribution(contentPackage, mediaReceipt, request), /must be approved/);
});

test('manual distribution prepares a receipt without posting', async () => {
  const request = buildDistributionRequest(contentPackage, mediaReceipt);
  request.approval = { status: 'approved', approvedAt: '2026-07-12T12:15:00Z', approvedBy: 'owner' };
  const receipt = await executeDistribution(contentPackage, mediaReceipt, request, { now: () => new Date('2026-07-12T12:16:00Z') });
  assert.equal(receipt.status, 'prepared');
  assert.equal(receipt.externalId, null);
});

test('unregistered publishing is not a supported distribution provider', () => {
  assert.throws(
    () => buildDistributionRequest(contentPackage, mediaReceipt, { provider: 'native' }),
    /unsupported distribution provider/,
  );
});

test('internal distribution routes through the owned provider contract', async () => {
  const request = buildDistributionRequest(contentPackage, mediaReceipt, { provider: 'internal' });
  request.approval = { status: 'approved', approvedAt: '2026-07-12T12:15:00Z', approvedBy: 'owner' };
  const calls = [];
  const receipt = await executeDistribution(contentPackage, mediaReceipt, request, {
    internalProvider: { async post(input) { calls.push(input); return { provider: 'youtube', status: 'posted', externalId: 'video-1', externalUrl: 'https://youtube.com/shorts/video-1' }; } },
    now: () => new Date('2026-07-12T12:16:00Z'),
  });
  assert.equal(calls[0].local_path, '/tmp/proof.mp4');
  assert.equal(receipt.provider, 'youtube');
  assert.equal(receipt.status, 'posted');
});

test('package, media, and distribution revisions cannot be mixed', () => {
  assert.throws(() => buildDistributionRequest(contentPackage, { ...mediaReceipt, packageRevision: 2 }), /does not match package revision/);
});

test('posting payload preserves brand and account identity', () => {
  const request = { ...buildDistributionRequest(contentPackage, mediaReceipt), accountSlug: 'hs-youtube' };
  const post = toMarketingPost(contentPackage, mediaReceipt, request);
  assert.equal(post.project_slug, 'high-signal');
  assert.equal(post.account_slug, 'hs-youtube');
  assert.equal(post.local_path, '/tmp/proof.mp4');
});
