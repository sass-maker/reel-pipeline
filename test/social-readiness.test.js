import assert from 'node:assert/strict';
import test from 'node:test';

import brandConfig from '../config/brand-channels.json' with { type: 'json' };
import { checkSocialReadiness } from '../src/social-readiness.js';

const EXPECTED_ACCOUNTS = 12;

function completeConfig() {
  return {
    schema: 'fleet.internal-video-channels.v1',
    channels: Object.entries(brandConfig.brands).flatMap(([brand, value]) => value.channels.map((channel) => ({
      brand,
      channel,
      accountSlug: value.accountMappings[channel],
      credentialEnv: channel === 'youtube_shorts'
        ? { clientId: 'YT_CLIENT', clientSecret: 'YT_SECRET', refreshToken: 'YT_REFRESH' }
        : { userId: 'IG_USER', accessToken: 'IG_TOKEN' },
    }))),
  };
}

test('missing internal channel map fails closed for every pre-routed account', () => {
  const report = checkSocialReadiness({ configPath: '/definitely/missing.json', rawConfig: { schema: 'fleet.internal-video-channels.v1', channels: [] }, env: {}, ffmpegReady: true });
  assert.equal(report.summary.totalAccounts, EXPECTED_ACCOUNTS);
  assert.equal(report.summary.routedAccounts, 0);
  assert.equal(report.summary.connectedAccounts, 0);
  assert.equal(report.summary.readyForLivePosting, false);
  assert.equal(report.provider, 'fleet-internal');
});

test('readiness becomes true when every declared environment reference exists', () => {
  const env = { YT_CLIENT: 'present', YT_SECRET: 'present', YT_REFRESH: 'present', IG_USER: 'present', IG_TOKEN: 'present', PATH: '' };
  const report = checkSocialReadiness({ rawConfig: completeConfig(), env, ffmpegReady: true });
  assert.equal(report.summary.connectedAccounts, EXPECTED_ACCOUNTS);
  assert.equal(report.summary.readyForLivePosting, true);
  assert.equal(report.accounts.every((entry) => entry.credentialsPresent), true);
});
