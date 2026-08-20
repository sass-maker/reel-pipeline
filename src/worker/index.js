import { assertRenderableReel, attachReelRender, createReelDraft, decideRenderedReel, decideReelDraft, listReelDrafts, R2ReelStore } from '../reel-intake.js';
import { reelDraftInputFromSignal } from '../signal-intake.js';
import { reviewPageHtml } from '../review-ui.js';
import { handleForgeWorkerRequest } from '../local-video-forge-coordinator.js';
import { GENERATIVE_MEDIA_POLICY } from '../studio/generation-policy.js';
import { timingSafeEqual } from 'node:crypto';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true });
    }

    if (isInternalRoute(request.method, url.pathname) && !(await isAuthorized(request, env))) {
      return unauthorized();
    }

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/review')) {
      return html(reviewPageHtml());
    }

    if (request.method === 'GET' && url.pathname === '/forge') {
      return html(parkedForgePageHtml(), 200, { 'cache-control': 'private, no-store' });
    }

    if (url.pathname.startsWith('/forge/')) {
      if (!['GET', 'HEAD'].includes(request.method)) {
        return json({ error: GENERATIVE_MEDIA_POLICY.blocker }, 410);
      }
      const response = await handleForgeWorkerRequest(request, env);
      if (response) return response;
    }

    if (request.method === 'POST' && url.pathname === '/reels/signal') {
      const data = await createReelDraft(reelDraftInputFromSignal(await request.json()), {
        reelStore: new R2ReelStore(env.REEL_ARTIFACTS),
      });
      return json({ data }, 201);
    }

    if (request.method === 'POST' && url.pathname === '/reels') {
      const data = await createReelDraft(await request.json(), { reelStore: new R2ReelStore(env.REEL_ARTIFACTS) });
      return json({ data }, 201);
    }

    if (request.method === 'GET' && url.pathname === '/reels') {
      const data = await listReelDrafts(Object.fromEntries(url.searchParams), {
        reelStore: new R2ReelStore(env.REEL_ARTIFACTS),
      });
      return json({ data });
    }

    const decisionMatch = request.method === 'PATCH' && url.pathname.match(/^\/reels\/([^/]+)\/decision$/);
    if (decisionMatch) {
      const data = await decideReelDraft(decodeURIComponent(decisionMatch[1]), await request.json(), {
        reelStore: new R2ReelStore(env.REEL_ARTIFACTS),
      });
      if (!data) return json({ error: 'reel not found' }, 404);
      return json({ data });
    }

    const renderMatch = request.method === 'POST' && url.pathname.match(/^\/reels\/([^/]+)\/render$/);
    if (renderMatch) {
      try {
        const reelStore = new R2ReelStore(env.REEL_ARTIFACTS);
        const id = decodeURIComponent(renderMatch[1]);
        const record = await reelStore.get(id);
        if (!record) return json({ error: 'reel not found' }, 404);
        const body = await request.json().catch(() => ({}));
        assertRenderableReel(record, { force: body.force, allowUnapproved: false });
        const variantCount = Math.max(1, Math.min(6, Number(body.variantCount ?? 1)));
        const data = await renderWorkerMockReel(record, env, reelStore, request.url, { variantCount });
        return json({ data });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
    }

    const videoDecisionMatch = request.method === 'PATCH' && url.pathname.match(/^\/reels\/([^/]+)\/video-decision$/);
    if (videoDecisionMatch) {
      const data = await decideRenderedReel(decodeURIComponent(videoDecisionMatch[1]), await request.json(), {
        reelStore: new R2ReelStore(env.REEL_ARTIFACTS),
      });
      if (!data) return json({ error: 'reel not found' }, 404);
      return json({ data });
    }

    if (request.method === 'GET' && url.pathname.startsWith('/reels/')) {
      return serveArtifact(url.pathname.slice('/reels/'.length), env, request);
    }

    return json({ error: 'not found' }, 404);
  },
};

function parkedForgePageHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local Video Forge parked</title></head><body><main><h1>Local Video Forge is parked</h1><p>${GENERATIVE_POLICY_HTML}</p><p>Existing history and artifacts remain readable. Automatic paid generation spend is $0.</p></main></body></html>`;
}

const GENERATIVE_POLICY_HTML = 'Import approved external media. Any paid generation requires a separate per-job budget and operator approval.';

function isInternalRoute(method, pathname) {
  if (pathname === '/forge' || pathname.startsWith('/forge/')) return true;
  if (method === 'GET' && ['/', '/review', '/reels'].includes(pathname)) return true;
  if (method === 'POST' && ['/reels', '/reels/signal'].includes(pathname)) return true;
  return (
    (method === 'PATCH' && /^\/reels\/[^/]+\/(?:decision|video-decision)$/.test(pathname)) ||
    (method === 'POST' && /^\/reels\/[^/]+\/render$/.test(pathname))
  );
}

async function isAuthorized(request, env) {
  const expected = typeof env.REEL_INTERNAL_TOKEN === 'string' ? env.REEL_INTERNAL_TOKEN : '';
  const provided = internalTokenFrom(request.headers.get('authorization'));
  if (!expected || !provided) return false;

  const encoder = new TextEncoder();
  const [expectedDigest, providedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
  ]);
  return timingSafeEqual(new Uint8Array(expectedDigest), new Uint8Array(providedDigest));
}

function internalTokenFrom(authorization) {
  if (!authorization) return null;
  if (authorization.startsWith('Bearer ')) return authorization.slice('Bearer '.length).trim();
  if (!authorization.startsWith('Basic ')) return null;
  try {
    const decoded = atob(authorization.slice('Basic '.length));
    const separator = decoded.indexOf(':');
    if (separator === -1 || decoded.slice(0, separator) !== 'foundry') return null;
    return decoded.slice(separator + 1);
  } catch {
    return null;
  }
}

function unauthorized() {
  return new Response(JSON.stringify({ error: 'authentication required' }), {
    status: 401,
    headers: {
      ...JSON_HEADERS,
      'cache-control': 'no-store',
      'www-authenticate': 'Basic realm="Foundry Reel Review", charset="UTF-8"',
    },
  });
}

async function renderWorkerMockReel(record, env, reelStore, requestUrl, options = {}) {
  if (!env.REEL_ARTIFACTS) throw new Error('missing REEL_ARTIFACTS binding');
  const workerUrl = new URL(requestUrl).origin;
  const variantCount = Math.max(1, Math.min(6, Number(options.variantCount ?? 1)));

  if (variantCount === 1) {
    const key = `${safeArtifactKey(record.id)}-draft.mp4`;
    await env.REEL_ARTIFACTS.put(key, `mock mp4 placeholder for ${record.title}\n`, {
      httpMetadata: { contentType: 'video/mp4' },
    });
    const job = {
      id: `worker_mock_${record.id}`,
      status: 'video_ready',
      render: {
        provider: 'worker-mock',
        externalTaskId: `worker_mock_${record.id}`,
        status: 'completed',
        videos: [`${workerUrl}/reels/${key}`],
        raw: { key },
      },
    };
    const reel = await attachReelRender(record.id, job, { reelStore });
    return { reel, job };
  }

  const variants = [];
  for (let index = 0; index < variantCount; index += 1) {
    const variantId = `v${index + 1}`;
    const key = `${safeArtifactKey(record.id)}-${variantId}.mp4`;
    await env.REEL_ARTIFACTS.put(key, `mock mp4 placeholder ${variantId} for ${record.title}\n`, {
      httpMetadata: { contentType: 'video/mp4' },
    });
    variants.push({
      variantId,
      template: ['problem_proof_cta', 'before_after', 'mini_demo', 'teardown_audit', 'changelog_proof'][index % 5],
      proofType: 'generated_card',
      hook: record.hook,
      cta: record.cta ?? null,
      captionText: record.hook,
      assetUrl: `${workerUrl}/reels/${key}`,
      thumbnailUrl: null,
      durationSeconds: 12,
      qualityScore: 0.55,
      qualityScores: {},
      qualityReasons: ['worker mock — manual review required'],
      renderLog: [`worker_mock variant ${variantId}`],
      status: 'needs_review',
      provider: 'worker-mock',
      externalTaskId: `worker_mock_${record.id}_${variantId}`,
      createdAt: new Date().toISOString(),
    });
  }
  const reel = await attachReelRender(record.id, { variants, renderLog: ['worker-mock variants'], job: { id: `worker_mock_${record.id}` } }, { reelStore });
  return { reel, variants };
}

async function serveArtifact(key, env, request) {
  if (!env.REEL_ARTIFACTS) return json({ error: 'missing REEL_ARTIFACTS binding' }, 500);
  if (!isSafeKey(key)) return json({ error: 'invalid artifact key' }, 400);

  const range = parseRange(request.headers.get('range'));
  let object;
  try {
    object = await env.REEL_ARTIFACTS.get(key, range ? { range } : undefined);
  } catch {
    // R2 throws on unsatisfiable ranges (offset at/past end of object);
    // video players probe with ranges, so answer 416 instead of 500.
    const head = await env.REEL_ARTIFACTS.head(key);
    if (!head) return json({ error: 'artifact not found' }, 404);
    return new Response(null, {
      status: 416,
      headers: {
        'content-range': `bytes */${head.size}`,
        'accept-ranges': 'bytes',
      },
    });
  }
  if (!object) return json({ error: 'artifact not found' }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('access-control-allow-origin', '*');
  headers.set('accept-ranges', 'bytes');
  if (!headers.has('content-type')) headers.set('content-type', contentTypeFor(key));
  if (range && typeof object.size === 'number') {
    // Describe the range R2 actually satisfied (object.range), clamped to
    // the object size — a request like bytes=0-999999999 on a smaller file
    // must not overstate content-length or the download truncates.
    const satisfied = object.range ?? range;
    const offset = satisfied.offset ?? 0;
    const length = Math.min(satisfied.length ?? object.size - offset, object.size - offset);
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { headers });
}

function isSafeKey(key) {
  return Boolean(key) && !key.includes('..') && !key.includes('/') && /^[A-Za-z0-9._-]+$/.test(key);
}

function safeArtifactKey(id) {
  return String(id).replace(/[^A-Za-z0-9._-]/g, '_');
}

function contentTypeFor(key) {
  if (key.endsWith('.mp4')) return 'video/mp4';
  if (key.endsWith('.json')) return 'application/json; charset=utf-8';
  if (key.endsWith('.webm')) return 'video/webm';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function parseRange(value) {
  if (!value) return null;
  const match = value.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;
  const offset = Number(match[1]);
  const end = match[2] ? Number(match[2]) : undefined;
  if (!Number.isFinite(offset) || offset < 0) return null;
  if (end !== undefined && (!Number.isFinite(end) || end < offset)) return null;
  return end === undefined ? { offset } : { offset, length: end - offset + 1 };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function html(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...extraHeaders },
  });
}
