import { readFile, stat } from 'node:fs/promises';

const DEFAULT_OAUTH_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';
const TOKEN_SAFETY_WINDOW_MS = 60_000;

export class YouTubePublisher {
  constructor(options = {}) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.refreshToken = options.refreshToken;
    this.oauthUrl = options.oauthUrl ?? DEFAULT_OAUTH_URL;
    this.uploadUrl = options.uploadUrl ?? DEFAULT_UPLOAD_URL;
    this.defaultPrivacy = options.defaultPrivacy ?? 'private';
    this.categoryId = options.categoryId ?? '22';
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.readFileImpl = options.readFileImpl ?? readFile;
    this.statImpl = options.statImpl ?? stat;
    this.now = options.now ?? (() => Date.now());
    this.tokenCache = null;
  }

  async accessToken() {
    if (this.tokenCache && this.tokenCache.expiresAt - TOKEN_SAFETY_WINDOW_MS > this.now()) return this.tokenCache.token;
    if (!this.clientId || !this.clientSecret || !this.refreshToken) throw new InternalPublisherError('YouTube account credentials are not configured', 'needs_reconnect');
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
    });
    const response = await this.fetchImpl(this.oauthUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!response.ok) throw classifiedResponseError('YouTube token refresh', response.status, await response.text());
    const payload = await response.json();
    if (!payload.access_token) throw new InternalPublisherError('YouTube token refresh returned no access token', 'provider_down');
    this.tokenCache = {
      token: payload.access_token,
      expiresAt: this.now() + Number(payload.expires_in ?? 3600) * 1000,
    };
    return this.tokenCache.token;
  }

  async publish(input) {
    if (!input?.videoPath) throw new InternalPublisherError('YouTube publishing requires a local video path', 'bad_asset');
    const title = requiredText(input.title, 'title');
    if (title.length > 100) throw new InternalPublisherError('YouTube title must not exceed 100 characters', 'bad_caption');
    const description = /#shorts/i.test(input.caption ?? '') ? input.caption : `${input.caption ?? ''}\n\n#Shorts`.trim();
    const publishAt = futureDate(input.scheduledFor);
    const metadata = {
      snippet: { title, description, categoryId: this.categoryId },
      status: {
        privacyStatus: publishAt ? 'private' : this.defaultPrivacy,
        selfDeclaredMadeForKids: false,
        ...(publishAt ? { publishAt } : {}),
      },
    };
    const file = await this.statImpl(input.videoPath);
    if (!file.isFile() || file.size < 1) throw new InternalPublisherError('YouTube video is missing or empty', 'bad_asset');
    const token = await this.accessToken();
    const start = await this.fetchImpl(`${this.uploadUrl}?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-type': 'video/*',
        'x-upload-content-length': String(file.size),
      },
      body: JSON.stringify(metadata),
    });
    if (!start.ok) throw classifiedResponseError('YouTube upload initialization', start.status, await start.text());
    const session = start.headers.get('location');
    if (!session) throw new InternalPublisherError('YouTube returned no upload session', 'provider_down');
    const upload = await this.fetchImpl(session, {
      method: 'PUT',
      headers: { 'content-type': 'video/*', 'content-length': String(file.size) },
      body: await this.readFileImpl(input.videoPath),
    });
    if (!upload.ok) throw classifiedResponseError('YouTube upload', upload.status, await upload.text());
    const payload = await upload.json();
    if (!payload.id) throw new InternalPublisherError('YouTube returned no video id', 'provider_down');
    return {
      provider: 'youtube',
      status: publishAt ? 'scheduled' : 'posted',
      externalId: payload.id,
      externalUrl: `https://youtube.com/shorts/${payload.id}`,
    };
  }
}

export class InternalPublisherError extends Error {
  constructor(message, classification, options = {}) {
    super(message);
    this.name = 'InternalPublisherError';
    this.classification = classification;
    this.status = options.status ?? null;
    this.retryable = ['rate_limited', 'provider_down'].includes(classification);
  }
}

function classifiedResponseError(action, status, detail) {
  const classification = status === 401 || status === 403 ? 'needs_reconnect'
    : status === 429 ? 'rate_limited'
      : status >= 500 ? 'provider_down'
        : status === 400 ? 'bad_caption' : 'provider_down';
  return new InternalPublisherError(`${action} failed with ${status}: ${detail}`, classification, { status });
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new InternalPublisherError(`${field} is required`, 'bad_caption');
  return value.trim();
}

function futureDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date <= new Date()) throw new InternalPublisherError('scheduledFor must be a future ISO date', 'bad_caption');
  return date.toISOString();
}
