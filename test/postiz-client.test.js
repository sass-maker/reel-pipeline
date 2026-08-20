import assert from 'node:assert/strict';
import test from 'node:test';

import { PostizClient, PostizClientError } from '../src/postiz-client.js';

const integrations = {
  'brand-instagram': { integrationId: 'ig-1', provider: 'instagram' },
  'brand-youtube': { integrationId: 'yt-1', provider: 'youtube' },
};

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function input(channel, accountSlug) {
  return {
    id: `request-${channel}`,
    project_slug: 'brand',
    account_slug: accountSlug,
    channel,
    title: 'A specific product update',
    body: 'Evidence-backed release notes.',
    result_url: 'https://assets.example.test/video.mp4',
  };
}

test('creates an Instagram draft with uploaded media and never schedules it', async () => {
  const calls = [];
  const client = new PostizClient({
    apiKey: 'secret', integrations, now: () => new Date('2026-07-21T12:00:00Z'),
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
      return calls.length === 1
        ? response({ id: 'media-1', path: 'https://uploads.example.test/video.mp4' })
        : response([{ postId: 'post-1', integration: 'ig-1' }]);
    },
  });
  const result = await client.post(input('instagram_reels', 'brand-instagram'));
  assert.equal(result.status, 'draft');
  assert.equal(calls[1].body.type, 'draft');
  assert.equal(calls[1].body.posts[0].settings.__type, 'instagram');
  assert.equal(calls[1].body.posts[0].settings.post_type, 'post');
  assert.equal(calls[1].body.posts[0].integration.id, 'ig-1');
  assert.equal(calls[1].init.headers.authorization, 'secret');
});

test('creates a private YouTube draft with provider-specific settings', async () => {
  const calls = [];
  const client = new PostizClient({
    apiKey: 'secret', integrations,
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
      return calls.length === 1
        ? response({ id: 'media-2', path: 'https://uploads.example.test/video.mp4' })
        : response([{ postId: 'post-2', integration: 'yt-1' }]);
    },
  });
  await client.post(input('youtube_shorts', 'brand-youtube'));
  assert.deepEqual(calls[1].body.posts[0].settings, {
    __type: 'youtube', title: 'A specific product update', type: 'private', selfDeclaredMadeForKids: 'no', tags: [],
  });
});

test('creates exact future Instagram and YouTube schedules without a live provider call', async () => {
  for (const [channel, accountSlug, integrationId] of [
    ['instagram_reels', 'brand-instagram', 'ig-1'],
    ['youtube_shorts', 'brand-youtube', 'yt-1'],
  ]) {
    const calls = [];
    const client = new PostizClient({
      apiKey: 'secret',
      integrations,
      now: () => new Date('2026-07-21T12:00:00Z'),
      fetchImpl: async (url, init) => {
        calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
        return calls.length === 1
          ? response({ id: `media-${integrationId}`, path: 'https://uploads.example.test/video.mp4' })
          : response([{ postId: `post-${integrationId}`, integration: integrationId }]);
      },
    });
    const result = await client.post({
      ...input(channel, accountSlug),
      scheduled_for: '2026-07-22T09:30:00+05:30',
    });
    assert.equal(result.status, 'scheduled');
    assert.equal(calls[1].body.type, 'schedule');
    assert.equal(calls[1].body.date, '2026-07-22T04:00:00.000Z');
    assert.equal(calls[1].body.posts[0].integration.id, integrationId);
  }
});

test('rejects invalid or past schedules before media upload', async () => {
  let calls = 0;
  const client = new PostizClient({
    apiKey: 'secret',
    integrations,
    now: () => new Date('2026-07-21T12:00:00Z'),
    fetchImpl: async () => {
      calls += 1;
      return response({});
    },
  });
  await assert.rejects(
    () => client.post({ ...input('instagram_reels', 'brand-instagram'), scheduled_for: 'not-a-date' }),
    /must be an ISO date/,
  );
  await assert.rejects(
    () => client.post({ ...input('youtube_shorts', 'brand-youtube'), scheduled_for: '2026-07-21T11:59:00Z' }),
    /must be in the future/,
  );
  assert.equal(calls, 0);
});

test('rejects invalid YouTube metadata before uploading media', async () => {
  let calls = 0;
  const client = new PostizClient({
    apiKey: 'secret',
    integrations,
    fetchImpl: async () => {
      calls += 1;
      return response({});
    },
  });
  await assert.rejects(
    () => client.post({ ...input('youtube_shorts', 'brand-youtube'), title: 'x'.repeat(101) }),
    /YouTube title must contain 2 to 100 characters/,
  );
  assert.equal(calls, 0);
});

test('fails before network access for missing or mismatched mappings', async () => {
  let calls = 0;
  const client = new PostizClient({ apiKey: 'secret', integrations, fetchImpl: async () => { calls += 1; return response({}); } });
  await assert.rejects(() => client.post(input('instagram_reels', 'missing')), /no Postiz integration mapping/);
  await assert.rejects(() => client.post(input('instagram_reels', 'brand-youtube')), /provider mismatch/);
  assert.equal(calls, 0);
});

test('marks an ambiguous create failure and preserves deterministic request identity', async () => {
  let call = 0;
  const client = new PostizClient({
    apiKey: 'secret', integrations,
    fetchImpl: async () => {
      call += 1;
      if (call === 1) return response({ id: 'media-1', path: 'https://uploads.example.test/video.mp4' });
      throw new TypeError('connection closed');
    },
  });
  await assert.rejects(
    () => client.post(input('instagram_reels', 'brand-instagram')),
    (error) => error instanceof PostizClientError && error.ambiguous && error.requestId === 'request-instagram_reels',
  );
  assert.equal(call, 2);
});

test('reconciles an ambiguous create through a bounded Postiz list window', async () => {
  const calls = [];
  const client = new PostizClient({
    apiKey: 'secret', integrations, now: () => new Date('2026-07-21T12:00:00Z'),
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response({ posts: [{
        id: 'post-1', content: 'Evidence-backed release notes.', publishDate: '2026-07-21T11:59:00Z',
        releaseURL: '', integration: { id: 'ig-1', providerIdentifier: 'instagram' },
      }] });
    },
  });
  const result = await client.reconcile(input('instagram_reels', 'brand-instagram'), {
    startDate: '2026-07-21T11:00:00Z', endDate: '2026-07-21T12:00:00Z',
  });
  assert.equal(result.status, 'found');
  assert.equal(result.externalId, 'post-1');
  assert.match(calls[0].url, /\/posts\?startDate=/);
  assert.equal(calls[0].init.method, 'GET');
});

test('reconciliation refuses to guess when multiple matching posts exist', async () => {
  const post = { content: 'Evidence-backed release notes.', integration: { id: 'ig-1' } };
  const client = new PostizClient({
    apiKey: 'secret', integrations,
    fetchImpl: async () => response({ posts: [{ ...post, id: 'post-1' }, { ...post, id: 'post-2' }] }),
  });
  const result = await client.reconcile(input('instagram_reels', 'brand-instagram'));
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.candidates.map((candidate) => candidate.externalId), ['post-1', 'post-2']);
});

test('passes a bounded timeout signal and normalizes request timeouts', async () => {
  let capturedSignal;
  const client = new PostizClient({
    apiKey: 'secret', integrations, timeoutMs: 25,
    fetchImpl: async (_url, init) => {
      capturedSignal = init.signal;
      throw new DOMException('timed out', 'TimeoutError');
    },
  });
  await assert.rejects(
    () => client.listIntegrations(),
    (error) => error instanceof PostizClientError && error.code === 'POSTIZ_NETWORK' && !error.ambiguous,
  );
  assert.equal(capturedSignal instanceof AbortSignal, true);
});

test('verifies integration mappings and normalizes analytics', async () => {
  const responses = [
    response([{ id: 'ig-1', identifier: 'instagram', disabled: false }, { id: 'yt-1', identifier: 'youtube', disabled: true }]),
    response([{ label: 'Views', data: [{ total: '42', date: '2026-07-21' }], percentageChange: 5 }]),
  ];
  const client = new PostizClient({ apiKey: 'secret', integrations, fetchImpl: async () => responses.shift(), now: () => new Date('2026-07-21T12:00:00Z') });
  const mappings = await client.verifyMappings();
  assert.equal(mappings.find((entry) => entry.accountSlug === 'brand-instagram').ready, true);
  assert.equal(mappings.find((entry) => entry.accountSlug === 'brand-youtube').reason, 'disabled');
  const analytics = await client.analytics('post-1', 30);
  assert.equal(analytics.metrics[0].data[0].total, '42');
  assert.equal(analytics.recordedAt, '2026-07-21T12:00:00.000Z');
});

test('rejects credentials in the base URL and private media URLs', async () => {
  assert.throws(() => new PostizClient({ apiKey: 'secret', baseUrl: 'https://user:pass@example.test/public/v1' }), /contain no credentials/);
  const client = new PostizClient({ apiKey: 'secret', integrations, fetchImpl: async () => response({}) });
  await assert.rejects(() => client.post({ ...input('youtube_shorts', 'brand-youtube'), result_url: 'http://127.0.0.1/video.mp4' }), /public HTTPS URL/);
});
