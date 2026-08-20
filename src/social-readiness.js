import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import brandConfig from '../config/brand-channels.json' with { type: 'json' };

const PROVIDER_FOR_CHANNEL = { youtube_shorts: 'youtube', instagram_reels: 'instagram' };

export function checkSocialReadiness(options = {}) {
  const configPath = path.resolve(options.configPath ?? process.env.INTERNAL_VIDEO_CHANNELS_CONFIG ?? 'config/internal-video-channels.json');
  const templatePath = path.resolve(options.templatePath ?? 'config/internal-video-channels.example.json');
  const env = options.env ?? process.env;
  const installed = existsSync(configPath);
  const raw = options.rawConfig ?? JSON.parse(readFileSync(installed ? configPath : templatePath, 'utf8'));
  const configured = Array.isArray(raw?.channels) ? raw.channels : [];
  const accounts = [];

  for (const [brandSlug, brand] of Object.entries(brandConfig.brands)) {
    for (const channel of brand.channels) {
      const accountSlug = brand.accountMappings?.[channel] ?? null;
      const declaration = configured.find((entry) => entry.brand === brandSlug && entry.channel === channel);
      const credentialVariables = Object.values(declaration?.credentialEnv ?? {});
      const missingCredentialVariables = credentialVariables.filter((name) => !env[name]);
      const accountMatches = Boolean(declaration?.accountSlug === accountSlug);
      accounts.push({
        brand: brandSlug,
        channel,
        platform: PROVIDER_FOR_CHANNEL[channel],
        accountSlug,
        routeConfigured: Boolean(accountSlug),
        accountDeclared: Boolean(declaration),
        accountMatches,
        credentialVariables,
        credentialsPresent: credentialVariables.length > 0 && missingCredentialVariables.length === 0,
        missingCredentialVariables,
        ready: Boolean(accountSlug && declaration && accountMatches && credentialVariables.length > 0 && missingCredentialVariables.length === 0),
      });
    }
  }

  const missingCredentialVariables = [...new Set(accounts.flatMap((entry) => entry.missingCredentialVariables))].sort();
  const infrastructure = {
    channelConfig: installed || Boolean(options.rawConfig),
    artifactBucket: true,
    artifactBaseUrl: true,
    ffmpeg: options.ffmpegReady ?? commandExists('ffmpeg', options.pathEnv ?? env.PATH),
  };
  const totalAccounts = accounts.length;
  const connectedAccounts = accounts.filter((entry) => entry.ready).length;
  const summary = {
    totalAccounts,
    routedAccounts: accounts.filter((entry) => entry.routeConfigured && entry.accountDeclared && entry.accountMatches).length,
    connectedAccounts,
    missingCredentialVariables,
    infrastructureReady: Object.values(infrastructure).every(Boolean),
  };
  return {
    schema: 'reel-pipeline.social-readiness.v3',
    generatedAt: new Date().toISOString(),
    provider: 'fleet-internal',
    configPath,
    configInstalled: installed,
    activeChannels: ['instagram_reels', 'youtube_shorts'],
    accounts,
    infrastructure,
    summary: { ...summary, readyForLivePosting: connectedAccounts === totalAccounts && summary.infrastructureReady },
  };
}

function commandExists(command, pathEnv = '') {
  return String(pathEnv).split(path.delimiter).some((directory) => existsSync(path.join(directory, command)));
}
