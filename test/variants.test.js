import assert from 'node:assert/strict';
import test from 'node:test';
import { rm } from 'node:fs/promises';

import { createServer } from '../src/server/index.js';
import { FileReelStore } from '../src/file-reel-store.js';
import { normalizeVideoBrief } from '../src/video-brief.js';
import { createRenderer, renderReelVariants } from '../src/pipeline.js';

const reelBody = [
  'Script: open the product, ask one question, see a real answer.',
  'Shot list: profile open, chat reply, end card.',
  'Captions: "stop manual answers" / "let the profile answer" / "send one link".',
  'Asset prompts: vertical phone UI, real product screenshot.',
].join('\n');

test('renderReelVariants produces N variants with quality scores', async () => {
  const brief = normalizeVideoBrief({
    id: 'pipe-variant-brief',
    projectSlug: 'linkchat',
    channel: 'tiktok',
    title: 'Pipeline variants',
    hook: 'Stop manual answers.',
    body: reelBody,
    cta: 'Ask one question.',
    productUrl: 'https://linkchat.example/',
    renderMode: 'mock',
  });
  const adapter = createRenderer('mock', { mock: { artifactDir: './tmp/mock-pipeline-variants' } });
  const { variants, renderLog } = await renderReelVariants(brief, {
    renderer: adapter,
    variantCount: 3,
  });
  assert.equal(variants.length, 3);
  assert.deepEqual(variants.map((variant) => variant.variantId).sort(), ['pipe-variant-brief-v1', 'pipe-variant-brief-v2', 'pipe-variant-brief-v3']);
  for (const variant of variants) {
    assert.ok(variant.qualityReasons.length >= 1);
    assert.ok(['video_ready', 'needs_review', 'video_rejected'].includes(variant.status));
    assert.ok(Number.isFinite(variant.qualityScore));
  }
  assert.ok(renderLog.length >= 3);
});

test('HTTP API renders variants and accepts a single variant', async () => {
  const storeDir = './tmp/server-variants-reels';
  await rm(storeDir, { recursive: true, force: true });
  const reelStore = new FileReelStore({ dir: storeDir });
  const server = createServer({
    reelStore,
    mock: { artifactDir: './tmp/mock-server-variants' },
    artifacts: {
      baseUrl: 'https://assets.example.test/reels',
      publicDir: './tmp/server-variant-public',
    },
  });
  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const created = await fetch(`http://127.0.0.1:${port}/reels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'variant-reel',
        projectSlug: 'linkchat',
        goal: 'Show profile answering DMs',
        productUrl: 'https://linkchat.example/',
        channel: 'tiktok',
        realDetails: 'Profile answers repeated DMs.',
      }),
    });
    assert.equal(created.status, 201);

    await fetch(`http://127.0.0.1:${port}/reels/variant-reel/decision`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });

    const rendered = await fetch(`http://127.0.0.1:${port}/reels/variant-reel/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'mock', variantCount: 3 }),
    });
    assert.equal(rendered.status, 200);
    const renderedPayload = await rendered.json();
    const variants = renderedPayload.data.variants;
    assert.equal(variants.length, 3);
    assert.ok(variants.every((variant) => Number.isFinite(variant.qualityScore)));
    assert.ok(['video_ready', 'needs_review', 'video_rejected'].includes(renderedPayload.data.reel.status));

    const targetVariant = variants[0].variantId;
    const accepted = await fetch(`http://127.0.0.1:${port}/reels/variant-reel/video-decision`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve', variantId: targetVariant }),
    });
    assert.equal(accepted.status, 200);
    const acceptedPayload = await accepted.json();
    assert.equal(acceptedPayload.data.status, 'ready_to_post');
    const acceptedVariant = acceptedPayload.data.variants.find((variant) => variant.variantId === targetVariant);
    assert.equal(acceptedVariant.status, 'ready_to_post');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
