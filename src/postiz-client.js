const DEFAULT_BASE_URL = 'https://api.postiz.com/public/v1';
const PROVIDER_FOR_CHANNEL = Object.freeze({
  instagram_reels: 'instagram',
  youtube_shorts: 'youtube',
});

export class PostizClient {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.POSTIZ_BASE_URL ?? DEFAULT_BASE_URL);
    this.apiKey = requiredSecret(options.apiKey ?? process.env.POSTIZ_API_KEY);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = positiveInteger(options.timeoutMs ?? 15_000, 'timeoutMs');
    this.now = options.now ?? (() => new Date());
    this.integrations = validateIntegrationMap(options.integrations ?? {});
    if (typeof this.fetchImpl !== 'function') throw new PostizClientError('fetch implementation is required', { code: 'POSTIZ_CONFIG' });
  }

  async listIntegrations() {
    const payload = await this.request('/integrations');
    if (!Array.isArray(payload)) throw new PostizClientError('Postiz integrations response must be an array', { code: 'POSTIZ_RESPONSE' });
    return payload.map((entry) => ({
      id: requiredString(entry?.id, 'integration.id'),
      provider: requiredString(entry?.identifier, 'integration.identifier'),
      disabled: Boolean(entry?.disabled),
      name: optionalString(entry?.name),
      profile: optionalString(entry?.profile),
    }));
  }

  async verifyMappings() {
    const live = await this.listIntegrations();
    const byId = new Map(live.map((entry) => [entry.id, entry]));
    return Object.entries(this.integrations).map(([accountSlug, configured]) => {
      const remote = byId.get(configured.integrationId);
      return {
        accountSlug,
        integrationId: configured.integrationId,
        provider: configured.provider,
        ready: Boolean(remote && !remote.disabled && remote.provider === configured.provider),
        reason: !remote ? 'missing' : remote.disabled ? 'disabled' : remote.provider !== configured.provider ? 'provider-mismatch' : null,
      };
    });
  }

  async uploadFromUrl(url) {
    const sourceUrl = stableHttpsUrl(url, 'media URL');
    const payload = await this.request('/upload-from-url', {
      method: 'POST',
      body: { url: sourceUrl },
    });
    return {
      id: requiredString(payload?.id, 'upload.id'),
      path: stableHttpsUrl(payload?.path, 'upload.path'),
    };
  }

  async post(input) {
    const accountSlug = requiredString(input?.account_slug, 'account_slug');
    const channel = requiredString(input?.channel, 'channel');
    const expectedProvider = PROVIDER_FOR_CHANNEL[channel];
    if (!expectedProvider) throw new PostizClientError(`unsupported Postiz channel: ${channel}`, { code: 'POSTIZ_INPUT' });
    const mapping = this.integrations[accountSlug];
    if (!mapping) throw new PostizClientError(`no Postiz integration mapping for ${accountSlug}`, { code: 'POSTIZ_MAPPING' });
    if (mapping.provider !== expectedProvider) {
      throw new PostizClientError(`Postiz provider mismatch for ${accountSlug}: expected ${expectedProvider}`, { code: 'POSTIZ_MAPPING' });
    }

    const requestId = requiredString(input?.id, 'id');
    validatePostMetadata(input, expectedProvider);
    const now = this.now();
    const scheduledFor = normalizeFutureSchedule(input?.scheduled_for, now);
    const media = await this.uploadFromUrl(input?.result_url);
    const body = postPayload(input, mapping.integrationId, media, expectedProvider, scheduledFor, now);
    const payload = await this.request('/posts', { method: 'POST', body, ambiguousCreate: true, requestId });
    const created = Array.isArray(payload) ? payload[0] : null;
    const postId = requiredString(created?.postId, 'post.postId');
    return {
      provider: 'postiz',
      status: scheduledFor ? 'scheduled' : 'draft',
      externalId: postId,
      externalUrl: null,
      requestId,
    };
  }

  async reconcile(input, options = {}) {
    const requestId = requiredString(input?.id, 'id');
    const accountSlug = requiredString(input?.account_slug, 'account_slug');
    const mapping = this.integrations[accountSlug];
    if (!mapping) throw new PostizClientError(`no Postiz integration mapping for ${accountSlug}`, { code: 'POSTIZ_MAPPING' });
    const content = requiredString(input?.body, 'body');
    const endDate = isoDate(options.endDate ?? this.now(), 'endDate');
    const startDate = isoDate(options.startDate ?? new Date(Date.parse(endDate) - 24 * 60 * 60 * 1000), 'startDate');
    if (Date.parse(startDate) > Date.parse(endDate)) throw new PostizClientError('startDate must not be after endDate', { code: 'POSTIZ_INPUT' });
    const payload = await this.request(`/posts?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
    if (!Array.isArray(payload?.posts)) throw new PostizClientError('Postiz posts response must contain posts', { code: 'POSTIZ_RESPONSE' });
    const candidates = payload.posts
      .filter((post) => post?.integration?.id === mapping.integrationId && post?.content === content)
      .map((post) => ({
        externalId: requiredString(post?.id, 'post.id'),
        externalUrl: optionalHttpsUrl(post?.releaseURL),
        publishDate: optionalIsoDate(post?.publishDate),
      }));
    if (candidates.length === 0) return { requestId, status: 'not-found', candidates: [] };
    if (candidates.length > 1) return { requestId, status: 'ambiguous', candidates };
    return { requestId, status: 'found', ...candidates[0], candidates };
  }

  async analytics(postId, days = 30) {
    const id = encodeURIComponent(requiredString(postId, 'postId'));
    const windowDays = positiveInteger(days, 'days');
    const payload = await this.request(`/analytics/post/${id}?date=${windowDays}`);
    if (!Array.isArray(payload)) throw new PostizClientError('Postiz analytics response must be an array', { code: 'POSTIZ_RESPONSE' });
    return {
      provider: 'postiz',
      externalId: postId,
      recordedAt: this.now().toISOString(),
      metrics: payload.map((metric) => ({
        label: requiredString(metric?.label, 'analytics.label'),
        data: Array.isArray(metric?.data) ? metric.data.map((point) => ({ date: String(point?.date ?? ''), total: String(point?.total ?? '0') })) : [],
        percentageChange: Number.isFinite(Number(metric?.percentageChange)) ? Number(metric.percentageChange) : null,
      })),
    };
  }

  async request(pathname, options = {}) {
    const method = options.method ?? 'GET';
    const headers = { authorization: this.apiKey };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${pathname}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new PostizClientError('Postiz request did not return a definitive response', {
        code: 'POSTIZ_NETWORK',
        ambiguous: Boolean(options.ambiguousCreate),
        requestId: options.requestId ?? null,
        cause: error,
      });
    }
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); }
      catch { throw new PostizClientError('Postiz returned invalid JSON', { code: 'POSTIZ_RESPONSE', status: response.status }); }
    }
    if (!response.ok) {
      throw new PostizClientError(`Postiz request failed with ${response.status}`, {
        code: 'POSTIZ_HTTP',
        status: response.status,
        ambiguous: Boolean(options.ambiguousCreate && response.status >= 500),
        requestId: options.requestId ?? null,
      });
    }
    return payload;
  }
}

export class PostizClientError extends Error {
  constructor(message, details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = 'PostizClientError';
    this.code = details.code ?? 'POSTIZ_ERROR';
    this.status = details.status ?? null;
    this.ambiguous = Boolean(details.ambiguous);
    this.requestId = details.requestId ?? null;
  }
}

function postPayload(input, integrationId, media, provider, scheduledFor, now) {
  const title = requiredString(input?.title, 'title');
  const content = requiredString(input?.body, 'body');
  const settings = provider === 'youtube'
    ? { __type: 'youtube', title, type: 'private', selfDeclaredMadeForKids: 'no', tags: [] }
    : { __type: 'instagram', post_type: 'post', is_trial_reel: false, collaborators: [] };
  return {
    type: scheduledFor ? 'schedule' : 'draft',
    date: scheduledFor ?? now.toISOString(),
    shortLink: false,
    tags: [{ value: requiredString(input?.id, 'id'), label: 'fleet-request' }],
    posts: [{
      integration: { id: integrationId },
      value: [{ content, image: [media] }],
      settings,
    }],
  };
}

function normalizeFutureSchedule(value, now) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new PostizClientError('scheduled_for must be an ISO date', { code: 'POSTIZ_INPUT' });
  }
  if (date.getTime() <= now.getTime()) {
    throw new PostizClientError('scheduled_for must be in the future', { code: 'POSTIZ_INPUT' });
  }
  return date.toISOString();
}

function validatePostMetadata(input, provider) {
  const title = requiredString(input?.title, 'title');
  requiredString(input?.body, 'body');
  if (provider === 'youtube' && (title.length < 2 || title.length > 100)) {
    throw new PostizClientError('YouTube title must contain 2 to 100 characters', { code: 'POSTIZ_INPUT' });
  }
}

function validateIntegrationMap(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PostizClientError('Postiz integrations must be an object', { code: 'POSTIZ_CONFIG' });
  const ids = new Set();
  const output = {};
  for (const [accountSlug, mapping] of Object.entries(input)) {
    const integrationId = requiredString(mapping?.integrationId, `${accountSlug}.integrationId`);
    const provider = requiredString(mapping?.provider, `${accountSlug}.provider`);
    if (!['instagram', 'youtube'].includes(provider)) throw new PostizClientError(`unsupported provider for ${accountSlug}`, { code: 'POSTIZ_CONFIG' });
    if (ids.has(integrationId)) throw new PostizClientError(`duplicate Postiz integration id: ${integrationId}`, { code: 'POSTIZ_CONFIG' });
    ids.add(integrationId);
    output[accountSlug] = Object.freeze({ integrationId, provider });
  }
  return Object.freeze(output);
}

function normalizeBaseUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new PostizClientError('POSTIZ_BASE_URL must be an absolute URL', { code: 'POSTIZ_CONFIG' }); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new PostizClientError('POSTIZ_BASE_URL must use http or https and contain no credentials', { code: 'POSTIZ_CONFIG' });
  }
  return url.toString().replace(/\/$/, '');
}

function stableHttpsUrl(value, field) {
  let url;
  try { url = new URL(requiredString(value, field)); }
  catch { throw new PostizClientError(`${field} must be an absolute URL`, { code: 'POSTIZ_INPUT' }); }
  if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new PostizClientError(`${field} must be a public HTTPS URL`, { code: 'POSTIZ_INPUT' });
  }
  return url.toString();
}

function isoDate(value, field) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new PostizClientError(`${field} must be an ISO date`, { code: 'POSTIZ_INPUT' });
  return date.toISOString();
}

function optionalIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function optionalHttpsUrl(value) {
  if (!value) return null;
  try { return stableHttpsUrl(value, 'releaseURL'); }
  catch { return null; }
}

function requiredSecret(value) {
  if (typeof value !== 'string' || !value.trim()) throw new PostizClientError('POSTIZ_API_KEY is required', { code: 'POSTIZ_CONFIG' });
  return value.trim();
}
function optionalString(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function requiredString(value, field) { const text = optionalString(value); if (!text) throw new PostizClientError(`${field} is required`, { code: 'POSTIZ_INPUT' }); return text; }
function positiveInteger(value, field) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1) throw new PostizClientError(`${field} must be a positive integer`, { code: 'POSTIZ_INPUT' }); return parsed; }
