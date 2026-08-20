import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../src/server/index.js';
import { createAnonymousVideoService } from '../src/anonymous-video/service.js';

async function withServer(service, run) {
  const server = createServer({ anonymousVideoService: service });
  await new Promise((resolve) => server.listen(0, resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(origin);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('anonymous surface creates and reads a safe video job without authentication', async () => {
  const calls = [];
  const job = { id: 'unguessable_abc123', status: 'processing', stage: 'understanding_brand' };
  const service = {
    create: async (input) => { calls.push(input); return job; },
    get: async (id) => ({ ...job, id, status: 'completed', artifact: { aspect: '9:16', reviewed: true } }),
    openArtifact: async () => null,
  };
  await withServer(service, async (origin) => {
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    const pageBody = await page.text();
    assert.match(pageBody, /https:\/\/yourbrand\.com/);
    assert.match(pageBody, /No account or setup/);
    assert.doesNotMatch(pageBody, /billing|credits|marketplace|actor onboarding/i);
    assert.doesNotMatch(pageBody, /<input[^>]+(?:password|email)/i);

    const prefilledPage = await fetch(`${origin}/?url=https%3A%2F%2Fhighsignal.app%2F`);
    assert.equal(prefilledPage.status, 200);
    assert.match(await prefilledPage.text(), /incomingUrl/);

    const created = await fetch(`${origin}/api/videos`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://brand.example' }),
    });
    assert.equal(created.status, 202);
    assert.deepEqual(calls, [{ url: 'https://brand.example' }]);
    assert.deepEqual((await created.json()).data, job);

    const status = await fetch(`${origin}/api/videos/${job.id}`);
    assert.equal(status.status, 200);
    const payload = await status.json();
    assert.equal(payload.data.status, 'completed');
    assert.equal(payload.data.artifact.reviewed, true);
  });
});

test('anonymous preview supports ranges and download attachment only after review', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'anonymous-video-route-'));
  const videoPath = path.join(dir, 'result.mp4');
  await writeFile(videoPath, '0123456789');
  let ready = true;
  const service = {
    create: async () => ({}), get: async () => ({}),
    openArtifact: async () => ready
      ? { path: videoPath, size: 10, contentType: 'video/mp4', filename: 'brand.mp4', state: 'completed', reviewed: true }
      : { state: 'processing' },
  };
  try {
    await withServer(service, async (origin) => {
      const preview = await fetch(`${origin}/api/videos/job/preview`, { headers: { range: 'bytes=2-5' } });
      assert.equal(preview.status, 206);
      assert.equal(preview.headers.get('content-range'), 'bytes 2-5/10');
      assert.match(preview.headers.get('content-disposition'), /^inline/);
      assert.equal(await preview.text(), '2345');

      const download = await fetch(`${origin}/api/videos/job/download`);
      assert.equal(download.status, 200);
      assert.match(download.headers.get('content-disposition'), /^attachment/);
      assert.equal(await download.text(), '0123456789');

      ready = false;
      const incomplete = await fetch(`${origin}/api/videos/job/preview`);
      assert.equal(incomplete.status, 409);
      assert.equal((await incomplete.json()).error.code, 'artifact_not_ready');
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('internal review and studio remain reachable while obsolete product routes stay absent', async () => {
  const service = { create: async () => ({}), get: async () => null, openArtifact: async () => null };
  await withServer(service, async (origin) => {
    const review = await fetch(`${origin}/review`);
    assert.equal(review.status, 200);
    assert.match(await review.text(), /Reel Review/);
    assert.equal((await fetch(`${origin}/studio`)).status, 200);
    for (const route of ['/auth/login', '/api/billing', '/api/credits', '/api/actors', '/api/marketplace', '/api/videos/job/post']) {
      assert.equal((await fetch(origin + route)).status, 404, route);
    }
  });
});

test('anonymous artifact rejects unsatisfiable ranges', async () => {
  const service = {
    create: async () => ({}), get: async () => ({}),
    openArtifact: async () => ({ path: '/unused', size: 4, state: 'completed', reviewed: true }),
  };
  await withServer(service, async (origin) => {
    const response = await fetch(`${origin}/api/videos/job/preview`, { headers: { range: 'bytes=10-' } });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('content-range'), 'bytes */4');
  });
});

test('fixture URL flows through intake and render into reviewed artifact metadata', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'anonymous-video-flow-'));
  const artifactPath = path.join(dir, 'fixture.mp4');
  await writeFile(artifactPath, 'fixture-video');
  const service = createAnonymousVideoService({
    jobDir: path.join(dir, 'jobs'),
    intake: async (url) => ({
      inputUrl: url,
      canonicalUrl: url,
      fetchedAt: '2026-07-13T00:00:00.000Z',
      documents: [], captures: [],
      brand: {
        name: 'Example Brand', colors: [{ value: '#112233', sourceUrl: url, evidence: '#112233' }], images: [],
        facts: [{ kind: 'description', value: 'A cited brand promise.', sourceUrl: url, evidence: 'A cited brand promise.' }],
      },
    }),
    render: async (input) => {
      assert.equal(input.brief.productUrl, 'https://brand.example/');
      assert.equal(input.website.evidence[0].value, 'A cited brand promise.');
      assert.match(input.creative.narration, /A cited brand promise/);
      return {
        status: 'completed', provider: 'fixture-presenter', videoUrl: artifactPath, durationSeconds: 18,
        raw: { aspect: '9:16', presenterIncluded: true, captionsIncluded: true, narrationIncluded: true },
        provenance: { schema: 'anonymous-brand-reel.provenance.v1', presenter: { id: 'fixture-human' } },
      };
    },
  });
  try {
    await withServer(service, async (origin) => {
      const created = await fetch(`${origin}/api/videos`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://brand.example' }),
      });
      assert.equal(created.status, 202);
      const queued = (await created.json()).data;
      assert.equal(queued.status, 'processing');
      const completed = await service.wait(queued.id);
      assert.equal(completed.status, 'completed');
      assert.equal(completed.artifact.aspect, '9:16');
      assert.equal(completed.artifact.presenterIncluded, true);
      assert.equal(completed.artifact.provenance.presenter.id, 'fixture-human');
      assert.equal('path' in completed.artifact, false);

      const status = await fetch(origin + completed.artifact.previewUrl.replace('/preview', ''));
      assert.equal((await status.json()).data.status, 'completed');
      const preview = await fetch(origin + completed.artifact.previewUrl);
      assert.equal(preview.status, 200);
      assert.equal(await preview.text(), 'fixture-video');
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
