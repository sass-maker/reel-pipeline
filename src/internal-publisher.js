import { readFileSync } from 'node:fs';

import { InstagramPublisher } from './publishers/instagram.js';
import { YouTubePublisher } from './publishers/youtube.js';

export const INTERNAL_CHANNELS_SCHEMA = 'fleet.internal-video-channels.v1';

export class InternalChannelPublisher {
  constructor(config, options = {}) {
    this.config = resolveChannelConfig(config, options.env ?? process.env);
    this.youtubeFactory = options.youtubeFactory ?? ((account) => new YouTubePublisher(account));
    this.instagramFactory = options.instagramFactory ?? ((account) => new InstagramPublisher(account));
    this.publishers = new Map();
  }

  async post(input) {
    const account = this.config.channels.find((entry) => entry.brand === input.project_slug && entry.channel === input.channel && entry.accountSlug === input.account_slug);
    if (!account) throw new Error(`no internal channel configured for ${input.project_slug}/${input.channel}`);
    const publisher = this.publisher(account);
    if (input.channel === 'youtube_shorts') {
      return publisher.publish({
        videoPath: input.local_path,
        title: input.title,
        caption: input.body,
        scheduledFor: input.scheduled_for,
      });
    }
    if (input.channel === 'instagram_reels') {
      return publisher.publish({
        videoUrl: input.result_url,
        caption: input.body,
        scheduledFor: input.scheduled_for,
      });
    }
    throw new Error(`internal publishing does not support ${input.channel}`);
  }

  publisher(account) {
    if (this.publishers.has(account.accountSlug)) return this.publishers.get(account.accountSlug);
    const created = account.channel === 'youtube_shorts'
      ? this.youtubeFactory(account.credentials)
      : this.instagramFactory(account.credentials);
    this.publishers.set(account.accountSlug, created);
    return created;
  }
}

export function loadInternalChannelConfig(path, options = {}) {
  return resolveChannelConfig(JSON.parse(readFileSync(path, 'utf8')), options.env ?? process.env);
}

export function resolveChannelConfig(input, env = process.env) {
  if (input?.schema !== INTERNAL_CHANNELS_SCHEMA || !Array.isArray(input.channels)) throw new Error(`channel config must use ${INTERNAL_CHANNELS_SCHEMA}`);
  const seen = new Set();
  const channels = input.channels.map((entry, index) => {
    if (!entry?.brand || !entry.channel || !entry.accountSlug || !['youtube_shorts', 'instagram_reels'].includes(entry.channel)) {
      throw new Error(`channels[${index}] requires brand, supported channel, and accountSlug`);
    }
    const id = `${entry.brand}/${entry.channel}`;
    if (seen.has(id)) throw new Error(`duplicate internal channel: ${id}`);
    seen.add(id);
    const credentials = {};
    for (const [field, envName] of Object.entries(entry.credentialEnv ?? {})) {
      if (typeof envName !== 'string' || !envName.trim()) throw new Error(`channels[${index}].credentialEnv.${field} must name an environment variable`);
      const value = env[envName];
      if (!value) throw new Error(`internal channel ${id} requires environment variable ${envName}`);
      credentials[field] = value;
    }
    return { brand: entry.brand, channel: entry.channel, accountSlug: entry.accountSlug, credentials };
  });
  return { schema: input.schema, channels };
}
