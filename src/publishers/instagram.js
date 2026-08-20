const TERMINAL = new Set(['FINISHED', 'ERROR', 'EXPIRED']);

export class InstagramPublisher {
  constructor(options = {}) {
    this.userId = options.userId;
    this.accessToken = options.accessToken;
    this.baseUrl = (options.baseUrl ?? 'https://graph.instagram.com/v22.0').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.sleepImpl = options.sleepImpl ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.pollIntervalMs = options.pollIntervalMs ?? 3_000;
    this.pollLimit = options.pollLimit ?? 100;
  }

  async publish(input) {
    if (!this.userId || !this.accessToken) throw new InstagramPublisherError('Instagram account credentials are not configured', 'needs_reconnect');
    if (!isPublicHttps(input.videoUrl)) throw new InstagramPublisherError('Instagram requires a public HTTPS video URL', 'bad_asset');
    if (input.scheduledFor) throw new InstagramPublisherError('Instagram native scheduling is not supported by the internal publisher', 'bad_caption');
    const create = await this.request(`/${this.userId}/media`, {
      method: 'POST',
      body: new URLSearchParams({ media_type: 'REELS', video_url: input.videoUrl, caption: input.caption ?? '', access_token: this.accessToken }),
    });
    if (!create.id) throw new InstagramPublisherError('Instagram returned no media container id', 'provider_down');
    for (let attempt = 0; attempt < this.pollLimit; attempt += 1) {
      const status = await this.request(`/${create.id}?fields=status_code&access_token=${encodeURIComponent(this.accessToken)}`);
      if (status.status_code === 'FINISHED') break;
      if (TERMINAL.has(status.status_code)) throw new InstagramPublisherError(`Instagram media container ended in ${status.status_code}`, 'bad_asset');
      if (attempt === this.pollLimit - 1) throw new InstagramPublisherError('Instagram media processing timed out', 'provider_down');
      await this.sleepImpl(this.pollIntervalMs);
    }
    const published = await this.request(`/${this.userId}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: create.id, access_token: this.accessToken }),
    });
    if (!published.id) throw new InstagramPublisherError('Instagram returned no published media id', 'provider_down');
    return {
      provider: 'instagram',
      status: 'posted',
      externalId: published.id,
      externalUrl: `https://www.instagram.com/reel/${published.id}/`,
    };
  }

  async request(pathname, options = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}${pathname}`, {
      method: options.method ?? 'GET',
      headers: options.body ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined,
      body: options.body?.toString(),
    });
    if (!response.ok) {
      const classification = response.status === 401 || response.status === 403 ? 'needs_reconnect'
        : response.status === 429 ? 'rate_limited'
          : response.status >= 500 ? 'provider_down' : 'bad_caption';
      throw new InstagramPublisherError(`Instagram request failed with ${response.status}: ${await response.text()}`, classification);
    }
    return response.json();
  }
}

export class InstagramPublisherError extends Error {
  constructor(message, classification) {
    super(message);
    this.name = 'InstagramPublisherError';
    this.classification = classification;
    this.retryable = ['rate_limited', 'provider_down'].includes(classification);
  }
}

function isPublicHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}
