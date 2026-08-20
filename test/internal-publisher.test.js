import assert from 'node:assert/strict';
import test from 'node:test';

import { InternalChannelPublisher, resolveChannelConfig } from '../src/internal-publisher.js';

const config = {
  schema: 'fleet.internal-video-channels.v1',
  channels: [{
    brand: 'high-signal',
    channel: 'youtube_shorts',
    accountSlug: 'high-signal-youtube',
    credentialEnv: { clientId: 'YT_CLIENT', clientSecret: 'YT_SECRET', refreshToken: 'YT_REFRESH' },
  }],
};

test('resolves credential references without putting secret values in the manifest', () => {
  const resolved = resolveChannelConfig(config, { YT_CLIENT: 'client', YT_SECRET: 'secret', YT_REFRESH: 'refresh' });
  assert.equal(resolved.channels[0].credentials.clientId, 'client');
  assert.doesNotMatch(JSON.stringify(config), /"secret"/);
});

test('routes an approved channel to the owned publisher', async () => {
  const calls = [];
  const publisher = new InternalChannelPublisher(config, {
    env: { YT_CLIENT: 'client', YT_SECRET: 'secret', YT_REFRESH: 'refresh' },
    youtubeFactory(credentials) {
      assert.equal(credentials.refreshToken, 'refresh');
      return { async publish(input) { calls.push(input); return { provider: 'youtube', status: 'posted', externalId: 'video-1', externalUrl: 'https://youtube.com/shorts/video-1' }; } };
    },
  });
  const result = await publisher.post({
    project_slug: 'high-signal',
    channel: 'youtube_shorts',
    account_slug: 'high-signal-youtube',
    local_path: '/approved/video.mp4',
    title: 'A title',
    body: 'A caption',
    scheduled_for: null,
  });
  assert.equal(result.provider, 'youtube');
  assert.equal(calls[0].videoPath, '/approved/video.mp4');
});

test('fails closed for unregistered channels and missing credential references', async () => {
  assert.throws(() => resolveChannelConfig(config, {}), /requires environment variable/);
  const publisher = new InternalChannelPublisher({ schema: 'fleet.internal-video-channels.v1', channels: [] });
  await assert.rejects(() => publisher.post({ project_slug: 'unknown', channel: 'youtube_shorts' }), /no internal channel/);
});
