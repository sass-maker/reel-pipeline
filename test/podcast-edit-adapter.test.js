import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inspectMashupMedia, normalizeMashupMediaReceipt } from '../src/adapters/podcast-edit.js';

function receiptFor(videoPath, bytes) {
  return {
    schema: 'fleet.mashup-media-receipt.v1',
    artifactId: 'owned-podcast-short',
    generatedAt: '2026-08-09T00:00:00Z',
    approval: { status: 'approved', approvedBy: 'operator' },
    recipe: { id: 'mashup-editorial@1' },
    runtime: { revision: 'mashup@0.1.0' },
    modelRevisions: {},
    sources: [{ id: 'episode-1', sourceUrl: 'https://example.com/episode-1', license: 'creator-owned' }],
    output: {
      video: { path: videoPath, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
      captions: null,
      durationSeconds: 30,
      width: 1080,
      height: 1920,
    },
    validation: { artifactHashVerified: true, approvalVerified: true, provenanceVerified: true },
  };
}

test('ingests verified finished Mashup media without invoking Mashup', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mashup-media-'));
  const video = path.join(root, 'result.mp4');
  const receiptPath = path.join(root, 'receipt.json');
  const bytes = Buffer.from('fixture-video');
  await writeFile(video, bytes);
  await writeFile(receiptPath, JSON.stringify(receiptFor(video, bytes)));

  const result = await inspectMashupMedia({ receiptPath, approvedRoots: [root] });
  assert.equal(result.sourceType, 'external-mashup-media');
  assert.equal(result.mediaPath, await realpath(video));
  assert.equal(result.receipt.artifactId, 'owned-podcast-short');
});

test('rejects an unapproved or hash-mismatched receipt', async () => {
  const bytes = Buffer.from('fixture-video');
  const receipt = receiptFor('/tmp/result.mp4', bytes);
  receipt.approval.status = 'proposed';
  assert.throws(() => normalizeMashupMediaReceipt(receipt), /approved/);

  const root = await mkdtemp(path.join(os.tmpdir(), 'mashup-media-'));
  const video = path.join(root, 'result.mp4');
  const receiptPath = path.join(root, 'receipt.json');
  await writeFile(video, bytes);
  const mismatched = receiptFor(video, bytes);
  mismatched.output.video.sha256 = '0'.repeat(64);
  await writeFile(receiptPath, JSON.stringify(mismatched));
  await assert.rejects(inspectMashupMedia({ receiptPath, approvedRoots: [root] }), /hash does not match/);
});
