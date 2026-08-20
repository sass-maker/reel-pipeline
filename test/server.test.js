import assert from 'node:assert/strict';
import test from 'node:test';

import { createServer } from '../src/server/index.js';
import { FileReelStore } from '../src/file-reel-store.js';

const reelBody = [
  'Script: show a founder with repeated DMs, then one AI profile answering them.',
  'Shot list: phone notification pile, chat screen, clean answer.',
  'Captions: "same DM again" then "answer it once".',
  'Asset prompts: vertical phone UI, simple SaaS product screen.',
].join('\n');

test('HTTP API creates a mock render', async () => {
  const server = createServer({ mock: { artifactDir: './tmp/server-test-artifacts' } });
  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);

    const res = await fetch(`http://127.0.0.1:${port}/renders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'server-brief',
        projectSlug: 'linkchat',
        channel: 'tiktok',
        title: 'AI profile answers repeated DMs',
        hook: 'POV: your link-in-bio answers the same DM before you see it.',
        body: reelBody,
        renderMode: 'mock',
      }),
    });

    assert.equal(res.status, 201);
    const payload = await res.json();
    assert.equal(payload.data.status, 'video_ready');
    assert.equal(payload.data.render.provider, 'mock');

    const status = await fetch(`http://127.0.0.1:${port}/renders/${payload.data.id}`);
    assert.equal(status.status, 200);
    const statusPayload = await status.json();
    assert.equal(statusPayload.data.id, payload.data.id);
    assert.equal(statusPayload.data.status, 'video_ready');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('HTTP API creates and reviews reel drafts', async () => {
  const reelStore = new FileReelStore({ dir: './tmp/server-test-reels' });
  const server = createServer({ reelStore });
  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const created = await fetch(`http://127.0.0.1:${port}/reels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'server-reel-draft',
        projectId: 'linkchat',
        realDetails: {
          product: 'link-in-bio chat agent',
          proof: 'answers repeated profile questions',
        },
        goal: 'Show creators that their profile can answer repeated questions',
        channel: 'tiktok',
        cta: 'Ask the profile one question.',
      }),
    });

    assert.equal(created.status, 201);
    const createdPayload = await created.json();
    assert.equal(createdPayload.data.id, 'server-reel-draft');
    assert.equal(createdPayload.data.status, 'generated');
    assert.equal(createdPayload.data.hook.includes('{'), false);
    assert.match(createdPayload.data.body, /Shot list:/);
    assert.match(createdPayload.data.body, /product: link-in-bio chat agent/);

    const list = await fetch(`http://127.0.0.1:${port}/reels?status=generated`);
    assert.equal(list.status, 200);
    const listPayload = await list.json();
    assert.equal(listPayload.data.some((reel) => reel.id === 'server-reel-draft'), true);

    const review = await fetch(`http://127.0.0.1:${port}/review`);
    assert.equal(review.status, 200);
    assert.match(await review.text(), /Reel Review/);

    const approved = await fetch(`http://127.0.0.1:${port}/reels/server-reel-draft/decision`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    assert.equal(approved.status, 200);
    const approvedPayload = await approved.json();
    assert.equal(approvedPayload.data.status, 'approved');

    const rendered = await fetch(`http://127.0.0.1:${port}/reels/server-reel-draft/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'mock' }),
    });
    assert.equal(rendered.status, 200);
    const renderedPayload = await rendered.json();
    assert.equal(renderedPayload.data.reel.status, 'video_ready');
    assert.equal(renderedPayload.data.job.render.provider, 'mock');
    assert.ok(renderedPayload.data.reel.renderJobId);

    const ready = await fetch(`http://127.0.0.1:${port}/reels/server-reel-draft/video-decision`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    assert.equal(ready.status, 200);
    const readyPayload = await ready.json();
    assert.equal(readyPayload.data.status, 'ready_to_post');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('HTTP API refuses to render unapproved reel drafts', async () => {
  const reelStore = new FileReelStore({ dir: './tmp/server-test-reels-unapproved' });
  const server = createServer({ reelStore });
  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const created = await fetch(`http://127.0.0.1:${port}/reels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'server-unapproved-render',
        projectSlug: 'linkchat',
        goal: 'Show a product moment',
        realDetails: 'Users need to approve before rendering.',
        channel: 'tiktok',
      }),
    });
    assert.equal(created.status, 201);

    const rendered = await fetch(`http://127.0.0.1:${port}/reels/server-unapproved-render/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'mock' }),
    });
    assert.equal(rendered.status, 400);
    assert.match(await rendered.text(), /approved before rendering/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('HTTP API ignores allowUnapproved in the public render body', async () => {
  const reelStore = new FileReelStore({ dir: './tmp/server-test-reels-allow-unapproved' });
  const server = createServer({ reelStore });
  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();

  try {
    await fetch(`http://127.0.0.1:${port}/reels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'server-allow-unapproved',
        projectSlug: 'linkchat',
        goal: 'Show a product moment',
        realDetails: 'Users need to approve before rendering.',
        channel: 'tiktok',
      }),
    });

    const rendered = await fetch(`http://127.0.0.1:${port}/reels/server-allow-unapproved/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'mock', allowUnapproved: true }),
    });
    assert.equal(rendered.status, 400);
    assert.match(await rendered.text(), /approved before rendering/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
