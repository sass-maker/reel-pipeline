import http from 'node:http';
import { FileReelStore } from '../file-reel-store.js';
import { createDraftVideo, createRenderResponse, getDraftVideoStatus, renderReelDraft } from '../pipeline.js';
import { createReelDraft, decideRenderedReel, decideReelDraft, listReelDrafts } from '../reel-intake.js';
import { reelDraftInputFromSignal } from '../signal-intake.js';
import { reviewPageHtml } from '../review-ui.js';
import { studioPageHtml } from '../studio/ui.js';
import { handleStudioRequest } from '../studio/api.js';
import {
  FileLessonStore,
  createLessonDraft,
  decideLessonScript,
  decideLessonVideo,
  getLesson,
  listLessons,
} from '../lesson-intake.js';
import { generateScripts, renderLesson } from '../lesson-pipeline.js';
import { anonymousVideoPageHtml } from '../anonymous-video/ui.js';
import { sendAnonymousArtifact } from '../anonymous-video/artifact-response.js';

const port = Number(process.env.PORT ?? 4317);

export function createServer(options = {}) {
  const reelOptions = { ...options, reelStore: options.reelStore ?? new FileReelStore(options.reelStoreOptions) };
  const lessonOptions = { ...options, lessonStore: options.lessonStore ?? new FileLessonStore(options.lessonStoreOptions) };
  const studioOptions = options.studio ?? {};
  return http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && requestUrl.pathname === '/health') {
        return json(res, 200, { ok: true });
      }
      if (req.method === 'GET' && requestUrl.pathname === '/') {
        return anonymousHtml(res, anonymousVideoPageHtml());
      }
      if (req.method === 'GET' && requestUrl.pathname === '/review') {
        return html(res, 200, reviewPageHtml());
      }
      if (req.method === 'GET' && requestUrl.pathname === '/studio') {
        return html(res, 200, studioPageHtml());
      }
      if (req.url?.startsWith('/studio/')) {
        const result = await handleStudioRequest(
          req.method,
          requestUrl.pathname,
          () => readJson(req),
          studioOptions,
          Object.fromEntries(requestUrl.searchParams),
        );
        if (result?.raw) {
          return sendAnonymousArtifact(req, res, {
            state: 'completed',
            reviewed: true,
            ...result.raw,
          }, { cors: true });
        }
        if (result) return json(res, result.status, result.body);
      }
      if (req.method === 'POST' && req.url === '/api/videos') {
        const service = await resolveAnonymousVideoService(options);
        const body = await readJson(req);
        const data = await service.create({ url: body.url });
        return json(res, 202, { data });
      }
      const anonymousVideoMatch = req.url?.match(/^\/api\/videos\/([^/?#]+)(?:\/(preview|download))?$/);
      if (req.method === 'GET' && anonymousVideoMatch) {
        const service = await resolveAnonymousVideoService(options);
        const id = decodeURIComponent(anonymousVideoMatch[1]);
        const action = anonymousVideoMatch[2];
        if (!action) {
          const data = await service.get(id);
          if (!data) return json(res, 404, { error: { code: 'not_found', message: 'video not found' } });
          return json(res, 200, { data });
        }
        const opened = await service.openArtifact(id);
        return sendAnonymousArtifact(req, res, opened, { download: action === 'download' });
      }
      if (req.method === 'POST' && req.url === '/reels/signal') {
        const body = await readJson(req);
        const data = await createReelDraft(reelDraftInputFromSignal(body), reelOptions);
        return json(res, 201, { data });
      }
      if (req.method === 'POST' && req.url === '/reels') {
        const body = await readJson(req);
        const data = await createReelDraft(body, reelOptions);
        return json(res, 201, { data });
      }
      if (req.method === 'GET' && req.url?.startsWith('/reels')) {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname === '/reels') {
          const data = await listReelDrafts(Object.fromEntries(url.searchParams), reelOptions);
          return json(res, 200, { data });
        }
      }
      const decisionMatch = req.method === 'PATCH' && req.url?.match(/^\/reels\/([^/?#]+)\/decision$/);
      if (decisionMatch) {
        const body = await readJson(req);
        const data = await decideReelDraft(decodeURIComponent(decisionMatch[1]), body, reelOptions);
        if (!data) return json(res, 404, { error: 'reel not found' });
        return json(res, 200, { data });
      }
      const renderReelMatch = req.method === 'POST' && req.url?.match(/^\/reels\/([^/?#]+)\/render$/);
      if (renderReelMatch) {
        const body = await readJson(req);
        const data = await renderReelDraft(decodeURIComponent(renderReelMatch[1]), {
          ...options,
          reelStore: reelOptions.reelStore,
          mode: body.mode,
          force: body.force,
          allowUnapproved: options.allowUnapproved ?? false,
          variantCount: body.variantCount,
        });
        if (!data) return json(res, 404, { error: 'reel not found' });
        return json(res, 200, { data });
      }
      const videoDecisionMatch = req.method === 'PATCH' && req.url?.match(/^\/reels\/([^/?#]+)\/video-decision$/);
      if (videoDecisionMatch) {
        const body = await readJson(req);
        const data = await decideRenderedReel(decodeURIComponent(videoDecisionMatch[1]), body, reelOptions);
        if (!data) return json(res, 404, { error: 'reel not found' });
        return json(res, 200, { data });
      }
      if (req.method === 'POST' && req.url === '/renders') {
        const body = await readJson(req);
        const data = await createDraftVideo(body, options);
        return json(res, 201, { data: createRenderResponse(data) });
      }
      if (req.method === 'POST' && req.url === '/lessons') {
        const body = await readJson(req);
        const data = await createLessonDraft(body, lessonOptions);
        return json(res, 201, { data });
      }
      if (req.method === 'GET' && req.url?.startsWith('/lessons')) {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname === '/lessons') {
          const data = await listLessons(Object.fromEntries(url.searchParams), lessonOptions);
          return json(res, 200, { data });
        }
        const showMatch = url.pathname.match(/^\/lessons\/([^/?#]+)$/);
        if (showMatch) {
          const data = await getLesson(decodeURIComponent(showMatch[1]), lessonOptions);
          if (!data) return json(res, 404, { error: 'lesson not found' });
          return json(res, 200, { data });
        }
      }
      const generateScriptsMatch = req.method === 'POST' && req.url?.match(/^\/lessons\/([^/?#]+)\/scripts$/);
      if (generateScriptsMatch) {
        const id = decodeURIComponent(generateScriptsMatch[1]);
        const data = await generateScripts({ id }, lessonOptions);
        return json(res, 200, { data });
      }
      const lessonScriptDecisionMatch = req.method === 'PATCH' && req.url?.match(/^\/lessons\/([^/?#]+)\/script-decision$/);
      if (lessonScriptDecisionMatch) {
        const body = await readJson(req);
        const data = await decideLessonScript(decodeURIComponent(lessonScriptDecisionMatch[1]), body, lessonOptions);
        if (!data) return json(res, 404, { error: 'lesson not found' });
        return json(res, 200, { data });
      }
      const lessonRenderMatch = req.method === 'POST' && req.url?.match(/^\/lessons\/([^/?#]+)\/render$/);
      if (lessonRenderMatch) {
        const body = await readJson(req);
        const data = await renderLesson(decodeURIComponent(lessonRenderMatch[1]), {
          ...lessonOptions,
          allowUnapproved: body.allowUnapproved ?? false,
        });
        return json(res, 200, { data });
      }
      const lessonVideoDecisionMatch = req.method === 'PATCH' && req.url?.match(/^\/lessons\/([^/?#]+)\/video-decision$/);
      if (lessonVideoDecisionMatch) {
        const body = await readJson(req);
        const data = await decideLessonVideo(decodeURIComponent(lessonVideoDecisionMatch[1]), body, lessonOptions);
        if (!data) return json(res, 404, { error: 'lesson not found' });
        return json(res, 200, { data });
      }
      const statusMatch = req.method === 'GET' && req.url?.match(/^\/renders\/([^/?#]+)$/);
      if (statusMatch) {
        const data = await getDraftVideoStatus(decodeURIComponent(statusMatch[1]), options);
        if (!data) return json(res, 404, { error: 'render not found' });
        return json(res, 200, { data: createRenderResponse(data) });
      }
      return json(res, 404, { error: 'not found' });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

function html(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

function anonymousHtml(res, body) {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

async function resolveAnonymousVideoService(options) {
  if (options.anonymousVideoService) return options.anonymousVideoService;
  const module = await import('../anonymous-video/service.js');
  if (typeof module.createAnonymousVideoService === 'function') {
    options.anonymousVideoService = module.createAnonymousVideoService(options.anonymousVideo ?? options);
    return options.anonymousVideoService;
  }
  throw new Error('anonymous video service is unavailable');
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().listen(port, () => {
    console.log(`reel-pipeline listening on http://127.0.0.1:${port}`);
  });
}
