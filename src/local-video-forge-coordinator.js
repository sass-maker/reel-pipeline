import { FALLBACK_REASONS } from './cartoon-hand-pointer.js';
import {
  assertForgeJobFilmSkill,
  filmSkillExecutionContract,
  listFilmSkills,
  resolveFilmSkill,
} from './film-skills.js';
import {
  evaluatePointerTraceBinding,
  normalizePointerTrace,
  POINTER_TRACE_SCHEMA,
} from './pointer-trace.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const JOB_PREFIX = 'video-forge/jobs/';
const ASSET_PREFIX = 'video-forge/assets/';
const CAPTURE_PREFIX = 'video-forge/captures/';
const OUTPUT_PREFIX = 'video-forge/outputs/';
const MAX_KEYFRAME_BYTES = 12 * 1024 * 1024;
const MAX_CAPTURE_BYTES = 95 * 1024 * 1024;
const MAX_CAPTURE_DURATION_MS = 90 * 1000;
const MAX_POINTER_TRACE_BYTES = 2 * 1024 * 1024;
const GUIDED_FILM_SKILLS = new Set(['guided-app-demo@1', 'guided-app-demo@2']);
const MAX_ATTEMPTS = 2;
const REVIEW_DECISIONS = new Set([
  'accepted',
  'retry',
  'change-motion',
  'change-keyframe',
  'cloud-candidate',
]);

export async function handleForgeWorkerRequest(request, env) {
  const url = new URL(request.url);
  const bucket = env.REEL_ARTIFACTS;
  if (!bucket) return responseJson({ error: 'missing REEL_ARTIFACTS binding' }, 500);

  if (request.method === 'GET' && url.pathname === '/forge/skills') {
    return responseJson({ data: listFilmSkills() });
  }

  const captureUploadMatch = request.method === 'PUT'
    && url.pathname.match(/^\/forge\/captures\/([^/]+)$/);
  if (captureUploadMatch) {
    try {
      const data = await storeForgeCapture(
        decodeURIComponent(captureUploadMatch[1]),
        request,
        { bucket },
      );
      return responseJson({ data }, 201);
    } catch (error) {
      return responseJson({ error: formatError(error) }, statusForError(error));
    }
  }

  const pointerTraceUploadMatch = request.method === 'PUT'
    && url.pathname.match(/^\/forge\/captures\/([^/]+)\/pointer-trace$/);
  if (pointerTraceUploadMatch) {
    try {
      const data = await storeForgePointerTrace(
        decodeURIComponent(pointerTraceUploadMatch[1]),
        request,
        { bucket },
      );
      return responseJson({ data }, 201);
    } catch (error) {
      return responseJson({ error: formatError(error) }, statusForError(error));
    }
  }

  const pointerTraceReadMatch = request.method === 'GET'
    && url.pathname.match(/^\/forge\/jobs\/([^/]+)\/pointer-trace$/);
  if (pointerTraceReadMatch) {
    const job = await getForgeJob(decodeURIComponent(pointerTraceReadMatch[1]), { bucket });
    if (!job) return responseJson({ error: 'forge job not found' }, 404);
    const key = job.pointerTreatment?.trace?.assetKey;
    if (!key) return responseJson({ error: 'forge pointer trace not found' }, 404);
    const object = await bucket.get(key);
    if (!object) return responseJson({ error: 'forge pointer trace not found' }, 404);
    const headers = new Headers();
    headers.set('content-type', 'application/json; charset=utf-8');
    headers.set('cache-control', 'private, no-store');
    return new Response(object.body, { headers });
  }

  if (request.method === 'POST' && url.pathname === '/forge/jobs') {
    try {
      const data = await createForgeJob(await request.json(), { bucket });
      return responseJson({ data }, 201);
    } catch (error) {
      return responseJson({ error: formatError(error) }, statusForError(error));
    }
  }

  if (request.method === 'GET' && url.pathname === '/forge/jobs') {
    const data = await listForgeJobs(Object.fromEntries(url.searchParams), { bucket });
    return responseJson({ data });
  }

  if (request.method === 'POST' && url.pathname === '/forge/jobs/claim') {
    try {
      const data = await claimForgeJob(await request.json(), { bucket });
      return data ? responseJson({ data }) : new Response(null, { status: 204 });
    } catch (error) {
      return responseJson({ error: formatError(error) }, 400);
    }
  }

  const keyframeMatch = request.method === 'GET' && url.pathname.match(/^\/forge\/jobs\/([^/]+)\/keyframe$/);
  if (keyframeMatch) {
    const job = await getForgeJob(decodeURIComponent(keyframeMatch[1]), { bucket });
    if (!job) return responseJson({ error: 'forge job not found' }, 404);
    const object = await bucket.get(job.keyframe.assetKey);
    if (!object) return responseJson({ error: 'keyframe not found' }, 404);
    const headers = new Headers();
    object.writeHttpMetadata?.(headers);
    headers.set('content-type', job.keyframe.mediaType);
    headers.set('cache-control', 'no-store');
    return new Response(object.body, { headers });
  }

  const sourceMatch = request.method === 'GET'
    && url.pathname.match(/^\/forge\/jobs\/([^/]+)\/source$/);
  if (sourceMatch) {
    const job = await getForgeJob(decodeURIComponent(sourceMatch[1]), { bucket });
    if (!job) return responseJson({ error: 'forge job not found' }, 404);
    if (!job.sourceCapture?.assetKey) {
      return responseJson({ error: 'forge source capture not found' }, 404);
    }
    const object = await bucket.get(job.sourceCapture.assetKey);
    if (!object) return responseJson({ error: 'forge source capture not found' }, 404);
    const headers = new Headers();
    object.writeHttpMetadata?.(headers);
    headers.set('content-type', job.sourceCapture.mediaType);
    headers.set('content-length', String(job.sourceCapture.bytes));
    headers.set('cache-control', 'private, no-store');
    return new Response(object.body, { headers });
  }

  const playbackMatch = ['GET', 'HEAD'].includes(request.method)
    && url.pathname.match(/^\/forge\/jobs\/([^/]+)\/artifacts\/([^/]+)$/);
  if (playbackMatch) {
    return serveForgeVariant(
      decodeURIComponent(playbackMatch[1]),
      decodeURIComponent(playbackMatch[2]),
      request,
      { bucket },
    );
  }

  const artifactMatch = request.method === 'PUT' && url.pathname.match(/^\/forge\/jobs\/([^/]+)\/artifacts\/([^/]+)$/);
  if (artifactMatch) {
    try {
      const jobId = decodeURIComponent(artifactMatch[1]);
      const variantId = safeId(decodeURIComponent(artifactMatch[2]));
      const workerId = requiredString(request.headers.get('x-forge-worker-id'), 'x-forge-worker-id');
      const job = await getForgeJob(jobId, { bucket });
      assertLeaseOwner(job, workerId);
      const key = job.activeRenderKind === 'final'
        ? `${OUTPUT_PREFIX}${safeId(jobId)}/final/attempt-${job.finalRender.attempts}/${variantId}.mp4`
        : `${OUTPUT_PREFIX}${safeId(jobId)}/attempt-${job.attempts}/${variantId}.mp4`;
      await bucket.put(key, request.body, {
        httpMetadata: { contentType: request.headers.get('content-type') ?? 'video/mp4' },
      });
      return responseJson({ data: { key, variantId } }, 201);
    } catch (error) {
      return responseJson({ error: formatError(error) }, statusForError(error));
    }
  }

  const decisionMatch = request.method === 'PATCH'
    && url.pathname.match(/^\/forge\/jobs\/([^/]+)\/decision$/);
  if (decisionMatch) {
    try {
      const data = await recordForgeDecision(
        decodeURIComponent(decisionMatch[1]),
        await request.json(),
        { bucket },
      );
      return responseJson({ data });
    } catch (error) {
      return responseJson({ error: formatError(error) }, statusForError(error));
    }
  }

  const finalRenderMatch = request.method === 'POST'
    && url.pathname.match(/^\/forge\/jobs\/([^/]+)\/final-render$/);
  if (finalRenderMatch) {
    try {
      if (!isJsonRequest(request)) {
        throw forgeError('final render requests must use application/json', 415);
      }
      const data = await requestForgeFinalRender(
        decodeURIComponent(finalRenderMatch[1]),
        await request.json(),
        { bucket },
      );
      return responseJson({ data }, 202);
    } catch (error) {
      return responseJson({ error: formatError(error) }, statusForError(error));
    }
  }

  const actionMatch = request.method === 'POST' && url.pathname.match(/^\/forge\/jobs\/([^/]+)\/(progress|complete|fail)$/);
  if (actionMatch) {
    try {
      const data = await updateForgeJob(
        decodeURIComponent(actionMatch[1]),
        actionMatch[2],
        await request.json(),
        { bucket },
      );
      return responseJson({ data });
    } catch (error) {
      return responseJson({ error: formatError(error) }, statusForError(error));
    }
  }

  const jobMatch = request.method === 'GET' && url.pathname.match(/^\/forge\/jobs\/([^/]+)$/);
  if (jobMatch) {
    const data = await getForgeJob(decodeURIComponent(jobMatch[1]), { bucket });
    return data ? responseJson({ data }) : responseJson({ error: 'forge job not found' }, 404);
  }

  return null;
}

export async function createForgeJob(input, options) {
  const bucket = requiredBucket(options.bucket);
  if (input?.captureId) {
    return createGuidedCaptureJob(input, { ...options, bucket });
  }
  const project = normalizeSubmittedProject(input.project);
  const shot = normalizeSubmittedShot(input.shot);
  const keyframe = normalizeKeyframe(input.keyframe);
  const filmSkill = normalizeSubmittedFilmSkill(input.filmSkill);
  const brief = normalizeSubmittedBrief(input);
  const keyframeSha256 = await sha256(keyframe.bytes);
  if (input.keyframe.sha256 && input.keyframe.sha256 !== keyframeSha256) {
    throw new Error('keyframe sha256 does not match uploaded bytes');
  }
  const id = safeId(input.id ?? `forge_${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}_${crypto.randomUUID().slice(0, 8)}`);
  await assertJobIdAvailable(bucket, id);
  const assetKey = `${ASSET_PREFIX}${id}.${extensionFor(keyframe.mediaType)}`;
  await bucket.put(assetKey, keyframe.bytes, { httpMetadata: { contentType: keyframe.mediaType } });
  const now = new Date().toISOString();
  const record = {
    schema: 'reel-pipeline.local-video-forge-job.v0.1',
    id,
    status: 'queued',
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    requiredCapabilities: ['apple-silicon', 'mlx-ltx-2.3'],
    filmSkill,
    brief,
    project,
    shot,
    keyframe: {
      assetKey,
      fileName: keyframe.fileName,
      mediaType: keyframe.mediaType,
      bytes: keyframe.bytes.byteLength,
      sha256: keyframeSha256,
      approval: {
        approved: true,
        approvedAt: now,
      },
      provenance: keyframe.provenance,
    },
    lease: null,
    progress: null,
    variants: [],
    review: {
      decisions: [],
      selection: null,
    },
    finalRender: {
      status: 'blocked',
      reason: 'an accepted preview variant is required',
    },
    createdAt: now,
    updatedAt: now,
  };
  if (record.filmSkill) assertForgeJobFilmSkill(record, { renderKind: 'preview' });
  await putJob(bucket, record);
  return record;
}

export async function storeForgeCapture(idInput, request, options) {
  const bucket = requiredBucket(options.bucket);
  const id = safeId(idInput);
  const mediaType = requiredString(request.headers.get('content-type'), 'content-type')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!['video/webm', 'video/mp4'].includes(mediaType)) {
    throw new Error(`unsupported capture media type: ${mediaType}`);
  }
  const bytes = boundedInteger(
    request.headers.get('content-length'),
    'content-length',
    1,
    MAX_CAPTURE_BYTES,
  );
  const durationMs = boundedInteger(
    request.headers.get('x-forge-duration-ms'),
    'x-forge-duration-ms',
    250,
    MAX_CAPTURE_DURATION_MS,
  );
  const sha256Value = requiredString(request.headers.get('x-forge-sha256'), 'x-forge-sha256')
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256Value)) {
    throw new Error('x-forge-sha256 must be a 64-character hexadecimal hash');
  }
  const filmSkill = resolveFilmSkill(
    requiredString(request.headers.get('x-forge-film-skill'), 'x-forge-film-skill'),
  );
  if (!GUIDED_FILM_SKILLS.has(filmSkill.ref)) {
    throw new Error(`browser capture requires ${[...GUIDED_FILM_SKILLS].join(' or ')}`);
  }
  const presenterMode = requiredString(
    request.headers.get('x-forge-presenter-mode') ?? 'none',
    'x-forge-presenter-mode',
  );
  if (!['none', 'same-session'].includes(presenterMode)) {
    throw new Error(`unsupported presenter mode: ${presenterMode}`);
  }
  const sourceRevision = requiredString(
    request.headers.get('x-forge-source-revision'),
    'x-forge-source-revision',
  );
  const license = requiredString(request.headers.get('x-forge-license'), 'x-forge-license');
  if (request.headers.get('x-forge-rights-approved') !== 'true') {
    throw new Error('capture rights must be explicitly approved');
  }
  if (!request.body) throw new Error('capture body is required');

  const metadataKey = `${CAPTURE_PREFIX}${id}.json`;
  if (await bucket.head?.(metadataKey)) {
    throw forgeError('forge capture already exists', 409);
  }
  const extension = mediaType === 'video/mp4' ? 'mp4' : 'webm';
  const assetKey = `${CAPTURE_PREFIX}${id}.${extension}`;
  await bucket.put(assetKey, request.body, {
    sha256: sha256Value,
    httpMetadata: { contentType: mediaType },
  });
  const stored = await bucket.head?.(assetKey);
  if (stored && Number(stored.size) !== bytes) {
    throw new Error('stored capture size does not match content-length');
  }

  const now = options.now?.() ?? new Date();
  const record = {
    schema: 'reel-pipeline.forge-capture.v1',
    id,
    assetKey,
    fileName: safeFileName(
      request.headers.get('x-forge-file-name') ?? `guided-app-demo.${extension}`,
    ),
    mediaType,
    bytes,
    durationMs,
    sha256: sha256Value,
    filmSkill: filmSkill.ref,
    captureMethod: 'browser-display-media',
    displaySurface: optionalString(request.headers.get('x-forge-display-surface')) ?? 'unknown',
    presenter: {
      mode: presenterMode,
      sync: presenterMode === 'same-session' ? 'same-session' : 'none',
      position: presenterMode === 'same-session' ? 'bottom-right' : null,
    },
    approval: {
      approved: true,
      approvedAt: now.toISOString(),
    },
    provenance: {
      sourceType: 'real-capture',
      sourceRevision,
      rights: {
        tier: 'production-safe',
        license,
        approved: true,
      },
    },
    capturedAt: now.toISOString(),
  };
  await bucket.put(metadataKey, `${JSON.stringify(record, null, 2)}\n`, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
  return record;
}

// Stores the privacy-bounded pointer sidecar next to an approved capture.
// An ineligible trace is still recorded: the job stays renderable with the
// standard cursor and carries the reason instead of silently dropping it.
export async function storeForgePointerTrace(captureId, request, options) {
  const bucket = requiredBucket(options.bucket);
  const id = safeId(captureId);
  const metadataKey = `${CAPTURE_PREFIX}${id}.json`;
  const captureObject = await bucket.get(metadataKey);
  if (!captureObject) throw forgeError('approved forge capture not found', 404);
  const capture = await captureObject.json();
  if (capture.filmSkill !== 'guided-app-demo@2') {
    throw new Error('pointer traces require a guided-app-demo@2 capture');
  }
  const body = await request.text();
  if (body.length > MAX_POINTER_TRACE_BYTES) {
    throw new Error(`pointer trace exceeds ${MAX_POINTER_TRACE_BYTES} bytes`);
  }
  const trace = normalizePointerTrace(JSON.parse(body));
  const evaluation = evaluatePointerTraceBinding({ trace, capture });
  const sha256Value = await sha256Hex(body);
  const assetKey = `${CAPTURE_PREFIX}${id}.pointer-trace.json`;
  await bucket.put(assetKey, body, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
  const now = options.now?.() ?? new Date();
  const record = {
    ...capture,
    pointerTrace: {
      schema: POINTER_TRACE_SCHEMA,
      assetKey,
      sha256: sha256Value,
      digest: evaluation.binding.traceDigest,
      acquisitionMethod: trace.acquisition.method,
      displaySurface: trace.acquisition.displaySurface,
      coordinateMapping: trace.acquisition.coordinateMapping,
      capturedCursor: trace.acquisition.capturedCursor,
      samples: trace.samples.length,
      durationMs: trace.timebase.durationMs,
      eligible: evaluation.eligible,
      failures: evaluation.failures,
      storedAt: now.toISOString(),
    },
  };
  await bucket.put(metadataKey, `${JSON.stringify(record, null, 2)}\n`, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
  return record;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Builds the job-side pointer treatment record. The plan digest is produced by
// the renderer, so at queue time this only proves the request is coherent.
function normalizeSubmittedPointerTreatment(input, capture, filmSkillRef) {
  const requested = input?.requested === true;
  if (filmSkillRef !== 'guided-app-demo@2') {
    if (requested) throw new Error('the cartoon-hand pointer requires guided-app-demo@2');
    return null;
  }
  if (!requested) {
    return { requested: false, outcome: 'standard-cursor', fallbackReason: 'operator-disabled' };
  }
  const trace = capture.pointerTrace;
  if (!trace?.sha256) {
    throw new Error('the cartoon-hand pointer requires an approved pointer trace on the capture');
  }
  if (trace.eligible !== true) {
    const reason = trace.failures?.[0]?.code ?? 'unsupported-source-mapping';
    if (!FALLBACK_REASONS.has(reason)) {
      throw new Error(`unrecognized pointer trace failure: ${reason}`);
    }
    return {
      requested: true,
      outcome: 'standard-cursor',
      fallbackReason: reason,
      fallbackDetail: trace.failures?.[0]?.detail ?? null,
      trace: pointerTraceReference(trace, capture),
    };
  }
  const styleRef = requiredString(input.styleRef, 'pointerTreatment.styleRef');
  return {
    requested: true,
    filmSkill: filmSkillRef,
    trace: pointerTraceReference(trace, capture),
    style: {
      ref: styleRef,
      digest: requiredString(input.styleDigest, 'pointerTreatment.styleDigest').toLowerCase(),
      rightsApproved: input.styleRightsApproved === true,
      tier: requiredString(input.styleTier ?? 'production-safe', 'pointerTreatment.styleTier'),
    },
    reducedMotion: input.reducedMotion === true,
    plan: null,
  };
}

function pointerTraceReference(trace, capture) {
  return {
    schema: POINTER_TRACE_SCHEMA,
    assetKey: trace.assetKey,
    sha256: trace.sha256,
    digest: trace.digest,
    sourceSha256: capture.sha256,
    acquisitionMethod: trace.acquisitionMethod,
    displaySurface: trace.displaySurface,
    coordinateMapping: trace.coordinateMapping,
    durationMs: trace.durationMs,
    samples: trace.samples,
  };
}

async function createGuidedCaptureJob(input, options) {
  const bucket = requiredBucket(options.bucket);
  const project = normalizeSubmittedProject(input.project);
  const filmSkill = normalizeSubmittedFilmSkill(input.filmSkill);
  if (!GUIDED_FILM_SKILLS.has(filmSkill?.ref)) {
    throw new Error(`capture jobs require ${[...GUIDED_FILM_SKILLS].join(' or ')}`);
  }
  const brief = normalizeSubmittedBrief(input);
  const captureId = safeId(input.captureId);
  const captureObject = await bucket.get(`${CAPTURE_PREFIX}${captureId}.json`);
  if (!captureObject) throw forgeError('approved forge capture not found', 404);
  const sourceCapture = await captureObject.json();
  if (sourceCapture.filmSkill !== filmSkill.ref) {
    throw new Error('capture film skill does not match the requested film style');
  }
  const pointerTreatment = normalizeSubmittedPointerTreatment(
    input.pointerTreatment,
    sourceCapture,
    filmSkill.ref,
  );
  const id = safeId(
    input.id
    ?? `forge_${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}_${crypto.randomUUID().slice(0, 8)}`,
  );
  await assertJobIdAvailable(bucket, id);
  const now = options.now?.() ?? new Date();
  const record = {
    schema: 'reel-pipeline.local-video-forge-job.v0.2',
    id,
    sourceKind: 'guided-app-capture',
    status: 'queued',
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    requiredCapabilities: pointerTreatment?.requested === true
      && pointerTreatment.outcome !== 'standard-cursor'
      ? ['ffmpeg', 'guided-app-demo', 'cartoon-hand-pointer']
      : ['ffmpeg', 'guided-app-demo'],
    filmSkill,
    brief,
    project,
    shot: {
      id: optionalString(input.shot?.id) ?? 'guided-app-demo',
      mode: 'guided-app-demo',
      preview: { preset: 'guided-preview', seeds: [] },
    },
    sourceCapture,
    ...(pointerTreatment ? { pointerTreatment } : {}),
    lease: null,
    progress: null,
    variants: [],
    review: {
      decisions: [],
      selection: null,
    },
    finalRender: {
      status: 'blocked',
      reason: 'an accepted preview variant is required',
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  assertForgeJobFilmSkill(record, { renderKind: 'preview' });
  await putJob(bucket, record);
  return record;
}

export async function listForgeJobs(filters = {}, options) {
  const bucket = requiredBucket(options.bucket);
  const records = [];
  let cursor;
  do {
    const listed = await bucket.list({
      prefix: JOB_PREFIX,
      ...(cursor ? { cursor } : {}),
    });
    for (const item of listed.objects ?? []) {
      const object = await bucket.get(item.key);
      if (!object) continue;
      const record = await object.json();
      if (
        filters.status
        && record.status !== filters.status
        && record.finalRender?.status !== filters.status
      ) continue;
      if (filters.project && record.project.name !== filters.project) continue;
      records.push(record);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
    if (listed.truncated && !cursor) {
      throw new Error('forge job listing was truncated without a cursor');
    }
  } while (cursor);
  return records.sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
}

export async function getForgeJob(id, options) {
  const object = await requiredBucket(options.bucket).get(jobKey(id));
  return object ? object.json() : null;
}

export async function claimForgeJob(input, options) {
  const bucket = requiredBucket(options.bucket);
  const workerId = requiredString(input.workerId, 'workerId');
  const capabilities = Array.isArray(input.capabilities) ? input.capabilities.map(String) : [];
  const leaseSeconds = Math.max(60, Math.min(6 * 60 * 60, Number(input.leaseSeconds ?? 4 * 60 * 60)));
  const now = options.now?.() ?? new Date();
  const candidates = await listForgeJobs({}, { bucket });
  for (const candidate of candidates) {
    const candidateKind = claimableRenderKind(candidate, capabilities, now);
    if (!candidateKind) continue;
    const object = await bucket.get(jobKey(candidate.id));
    if (!object) continue;
    const current = await object.json();
    const renderKind = claimableRenderKind(current, capabilities, now);
    if (!renderKind) continue;
    if (current.filmSkill) assertForgeJobFilmSkill(current, { renderKind });
    const lease = {
      workerId,
      claimedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + leaseSeconds * 1000).toISOString(),
    };
    const next = renderKind === 'final'
      ? {
          ...current,
          activeRenderKind: 'final',
          lease,
          finalRender: {
            ...current.finalRender,
            status: 'running',
            attempts: Number(current.finalRender?.attempts ?? 0) + 1,
            lease,
            progress: { stage: 'claimed' },
          },
          updatedAt: now.toISOString(),
        }
      : {
          ...current,
          activeRenderKind: 'preview',
          status: 'running',
          attempts: Number(current.attempts ?? 0) + 1,
          lease,
          updatedAt: now.toISOString(),
        };
    const stored = await putJob(bucket, next, { etag: object.etag });
    if (stored) return next;
  }
  return null;
}

export async function updateForgeJob(id, action, input, options) {
  const bucket = requiredBucket(options.bucket);
  const object = await bucket.get(jobKey(id));
  if (!object) throw forgeError('forge job not found', 404);
  const current = await object.json();
  const workerId = requiredString(input.workerId, 'workerId');
  assertLeaseOwner(current, workerId);
  const now = options.now?.() ?? new Date();
  let next;

  if (current.activeRenderKind === 'final') {
    if (action === 'progress') {
      const lease = {
        ...current.lease,
        expiresAt: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(),
      };
      next = {
        ...current,
        lease,
        finalRender: {
          ...current.finalRender,
          progress: input.progress ?? null,
          lease,
        },
        updatedAt: now.toISOString(),
      };
    } else if (action === 'complete') {
      const variant = normalizeFinalVariant(input.variants, current);
      await assertStoredVariants(bucket, [variant], current, 'final');
      next = {
        ...current,
        activeRenderKind: null,
        lease: null,
        finalRender: {
          ...current.finalRender,
          status: 'completed',
          progress: { stage: 'completed' },
          variant,
          lease: null,
          completedAt: now.toISOString(),
        },
        updatedAt: now.toISOString(),
      };
    } else if (action === 'fail') {
      const retryable = Number(current.finalRender?.attempts ?? 0) < MAX_ATTEMPTS;
      next = {
        ...current,
        activeRenderKind: null,
        lease: null,
        finalRender: {
          ...current.finalRender,
          status: retryable ? 'queued' : 'failed',
          error: optionalString(input.error) ?? 'final render worker failed',
          progress: { stage: retryable ? 'retry-queued' : 'failed' },
          lease: null,
          failedAt: now.toISOString(),
        },
        updatedAt: now.toISOString(),
      };
    } else {
      throw new Error(`unsupported forge action: ${action}`);
    }
    const stored = await putJob(bucket, next, { etag: object.etag });
    if (!stored) throw forgeError('forge job changed concurrently', 409);
    return next;
  }

  if (action === 'progress') {
    next = {
      ...current,
      progress: input.progress ?? null,
      lease: { ...current.lease, expiresAt: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString() },
      updatedAt: now.toISOString(),
    };
  } else if (action === 'complete') {
    const variants = normalizeCompletedVariants(input.variants, current);
    await assertStoredVariants(bucket, variants, current, 'preview');
    next = {
      ...current,
      activeRenderKind: null,
      status: 'completed',
      progress: { stage: 'completed' },
      variants,
      lease: null,
      completedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  } else if (action === 'fail') {
    const retryable = Number(current.attempts ?? 0) < Number(current.maxAttempts ?? MAX_ATTEMPTS);
    next = {
      ...current,
      activeRenderKind: null,
      status: retryable ? 'queued' : 'failed',
      error: optionalString(input.error) ?? 'worker failed',
      progress: { stage: retryable ? 'retry-queued' : 'failed' },
      lease: null,
      failedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  } else {
    throw new Error(`unsupported forge action: ${action}`);
  }

  const stored = await putJob(bucket, next, { etag: object.etag });
  if (!stored) throw forgeError('forge job changed concurrently', 409);
  return next;
}

export async function recordForgeDecision(id, input, options) {
  const bucket = requiredBucket(options.bucket);
  const object = await bucket.get(jobKey(id));
  if (!object) throw forgeError('forge job not found', 404);
  const current = await object.json();
  if (current.status !== 'completed') {
    throw forgeError('preview variants must be completed before review', 409);
  }
  if (['queued', 'running', 'completed'].includes(current.finalRender?.status)) {
    throw forgeError('review is locked after the final render is queued', 409);
  }

  const decision = requiredString(input.decision, 'decision');
  if (!REVIEW_DECISIONS.has(decision)) {
    throw new Error(`unsupported review decision: ${decision}`);
  }
  const variantId = requiredString(input.variantId, 'variantId');
  const variant = current.variants.find((candidate) => candidate.variantId === variantId);
  if (!variant) throw forgeError('forge variant not found', 404);

  const now = options.now?.() ?? new Date();
  const entry = {
    decision,
    variantId,
    seed: Number.isInteger(Number(variant.seed)) ? Number(variant.seed) : null,
    note: optionalString(input.note) ?? null,
    decidedAt: now.toISOString(),
  };
  const selection = decision === 'accepted'
    ? {
        variantId,
        seed: entry.seed,
        sourceSha256: variant.sourceSha256
          ?? current.sourceCapture?.sha256
          ?? current.keyframe?.sha256
          ?? null,
        ...(variant.pointerTreatment
          ? {
            pointerTreatmentDigest: variant.pointerTreatment.planDigest ?? null,
            pointerTreatmentOutcome: variant.pointerTreatment.outcome ?? null,
            pointerTreatmentFallbackReason: variant.pointerTreatment.fallbackReason ?? null,
          }
          : {}),
        acceptedAt: entry.decidedAt,
      }
    : current.review?.selection?.variantId === variantId
      ? null
      : current.review?.selection ?? null;
  const next = {
    ...current,
    review: {
      decisions: [...(current.review?.decisions ?? []), entry],
      selection,
    },
    finalRender: selection
      ? {
          status: 'ready',
          reason: null,
          approvedVariantId: selection.variantId,
          seed: selection.seed,
        }
      : {
          status: 'blocked',
          reason: 'an accepted preview variant is required',
        },
    updatedAt: now.toISOString(),
  };
  const stored = await putJob(bucket, next, { etag: object.etag });
  if (!stored) throw forgeError('forge job changed concurrently', 409);
  return next;
}

export async function requestForgeFinalRender(id, input, options) {
  const bucket = requiredBucket(options.bucket);
  const object = await bucket.get(jobKey(id));
  if (!object) throw forgeError('forge job not found', 404);
  const current = await object.json();
  if (current.status !== 'completed') {
    throw forgeError('preview variants must be completed before final render approval', 409);
  }

  const selection = current.review?.selection;
  const variant = current.variants.find((candidate) => candidate.variantId === selection?.variantId);
  if (!selection || !variant) {
    throw forgeError('an accepted preview variant is required before final render', 409);
  }
  const approvedSource = current.sourceCapture ?? current.keyframe;
  if (approvedSource?.approval?.approved !== true) {
    throw forgeError('an explicitly approved source is required before final render', 409);
  }
  if (!current.filmSkill?.ref) {
    throw forgeError('an exact film skill version is required before final render', 409);
  }
  const rights = approvedSource?.provenance?.rights;
  if (rights?.approved !== true || rights?.tier !== 'production-safe') {
    throw forgeError('production-safe source rights approval is required before final render', 409);
  }
  if (['queued', 'running', 'completed'].includes(current.finalRender?.status)) return current;

  const now = options.now?.() ?? new Date();
  const acceptedTreatment = variant.pointerTreatment ?? null;
  const next = {
    ...current,
    ...(current.pointerTreatment && acceptedTreatment
      ? {
        pointerTreatment: {
          ...current.pointerTreatment,
          plan: {
            digest: acceptedTreatment.planDigest ?? null,
            outcome: acceptedTreatment.outcome ?? null,
            fallbackReason: acceptedTreatment.fallbackReason ?? null,
          },
        },
      }
      : {}),
    finalRender: {
      status: 'queued',
      attempts: 0,
      requestedAt: now.toISOString(),
      approvedVariantId: variant.variantId,
      seed: Number.isInteger(Number(variant.seed)) ? Number(variant.seed) : null,
      sourceSha256: approvedSource.sha256,
      filmSkill: current.filmSkill.ref,
      ...(acceptedTreatment
        ? {
          pointerTreatmentDigest: acceptedTreatment.planDigest ?? null,
          pointerTreatmentOutcome: acceptedTreatment.outcome ?? null,
        }
        : {}),
      note: optionalString(input.note) ?? null,
    },
    updatedAt: now.toISOString(),
  };
  assertForgeJobFilmSkill(next, { renderKind: 'final' });
  const stored = await putJob(bucket, next, { etag: object.etag });
  if (!stored) throw forgeError('forge job changed concurrently', 409);
  return next;
}

function claimableRenderKind(job, capabilities, now) {
  const capable = (job.requiredCapabilities ?? []).every((capability) => capabilities.includes(capability));
  if (!capable) return null;

  const finalExpired = job.finalRender?.status === 'running'
    && Date.parse(job.finalRender?.lease?.expiresAt ?? job.lease?.expiresAt ?? '') <= now.getTime();
  if (
    (job.finalRender?.status === 'queued' || finalExpired)
    && Number(job.finalRender?.attempts ?? 0) < MAX_ATTEMPTS
  ) {
    return 'final';
  }

  const previewExpired = job.status === 'running'
    && Date.parse(job.lease?.expiresAt ?? '') <= now.getTime();
  if (
    (job.status === 'queued' || previewExpired)
    && Number(job.attempts ?? 0) < Number(job.maxAttempts ?? MAX_ATTEMPTS)
  ) {
    return 'preview';
  }
  return null;
}

function normalizeSubmittedProject(project) {
  if (!project || typeof project !== 'object') throw new Error('project is required');
  return {
    name: requiredString(project.name, 'project.name'),
    aspectRatio: requiredString(project.aspectRatio, 'project.aspectRatio'),
    fps: Number(project.fps ?? 24),
    style: optionalString(project.style) ?? '',
  };
}

function normalizeSubmittedFilmSkill(reference) {
  if (reference === undefined || reference === null || reference === '') return null;
  const skill = resolveFilmSkill(reference);
  return {
    id: skill.id,
    version: skill.version,
    ref: skill.ref,
    title: skill.title,
    contract: filmSkillExecutionContract(skill.ref),
  };
}

function normalizeSubmittedBrief(input) {
  return {
    prompt: optionalString(input.prompt) ?? '',
    context: optionalString(input.context) ?? '',
  };
}

function normalizeSubmittedShot(shot) {
  if (!shot || typeof shot !== 'object') throw new Error('shot is required');
  if (shot.keyframeApproved !== true) throw new Error('shot keyframe is not explicitly approved');
  const seeds = shot.preview?.seeds;
  if (!Array.isArray(seeds) || seeds.length !== 3 || seeds.some((seed) => !Number.isInteger(Number(seed)))) {
    throw new Error('shot preview requires exactly three integer seeds');
  }
  return {
    ...shot,
    id: requiredString(shot.id, 'shot.id'),
    motionPrompt: requiredString(shot.motionPrompt, 'shot.motionPrompt'),
    keyframeApproved: true,
    preview: { ...shot.preview, seeds: seeds.map(Number) },
  };
}

function normalizeKeyframe(keyframe) {
  if (!keyframe || typeof keyframe !== 'object') throw new Error('keyframe is required');
  const fileName = safeFileName(requiredString(keyframe.fileName, 'keyframe.fileName'));
  const mediaType = requiredString(keyframe.mediaType, 'keyframe.mediaType');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mediaType)) throw new Error('keyframe media type is unsupported');
  const dataBase64 = requiredString(keyframe.dataBase64, 'keyframe.dataBase64');
  if (dataBase64.length > Math.ceil(MAX_KEYFRAME_BYTES / 3) * 4 + 4) {
    throw new Error('keyframe must be between 1 byte and 12 MB');
  }
  const bytes = Uint8Array.from(atob(dataBase64), (character) => character.charCodeAt(0));
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_KEYFRAME_BYTES) throw new Error('keyframe must be between 1 byte and 12 MB');
  return {
    fileName,
    mediaType,
    bytes,
    provenance: normalizeKeyframeProvenance(keyframe.provenance),
  };
}

function normalizeKeyframeProvenance(provenance) {
  if (!provenance) {
    return {
      sourceType: 'operator-upload',
      sourceRevision: null,
      rights: {
        tier: 'proof-only',
        license: 'unrecorded',
        approved: false,
      },
    };
  }
  const tier = requiredString(provenance.rights?.tier, 'keyframe.provenance.rights.tier');
  if (!['production-safe', 'proof-only', 'restricted'].includes(tier)) {
    throw new Error(`unsupported keyframe rights tier: ${tier}`);
  }
  const sourceType = requiredString(provenance.sourceType, 'keyframe.provenance.sourceType');
  const sourceRevision = optionalString(provenance.sourceRevision) ?? null;
  if ((sourceType === 'real-capture' || tier === 'production-safe') && !sourceRevision) {
    throw new Error('keyframe.provenance.sourceRevision is required for production evidence');
  }
  return {
    sourceType,
    sourceRevision,
    rights: {
      tier,
      license: requiredString(provenance.rights?.license, 'keyframe.provenance.rights.license'),
      approved: provenance.rights?.approved === true,
    },
  };
}

async function serveForgeVariant(jobId, variantIdInput, request, options) {
  const bucket = requiredBucket(options.bucket);
  const job = await getForgeJob(jobId, { bucket });
  if (!job) return responseJson({ error: 'forge job not found' }, 404);
  const variantId = safeId(variantIdInput);
  const variant = [
    ...(job.variants ?? []),
    job.finalRender?.variant,
  ].filter(Boolean).find((candidate) => candidate.variantId === variantId);
  if (!variant) return responseJson({ error: 'forge variant not found' }, 404);
  const allowedPrefix = `${OUTPUT_PREFIX}${safeId(job.id)}/`;
  if (
    typeof variant.artifactKey !== 'string'
    || !variant.artifactKey.startsWith(allowedPrefix)
    || variant.artifactKey.includes('..')
  ) {
    return responseJson({ error: 'forge artifact key is invalid' }, 400);
  }

  const range = parseByteRange(request.headers.get('range'));
  let object;
  try {
    object = await bucket.get(variant.artifactKey, range ? { range } : undefined);
  } catch {
    const head = await bucket.head?.(variant.artifactKey);
    if (!head) return responseJson({ error: 'forge artifact not found' }, 404);
    return new Response(null, {
      status: 416,
      headers: {
        'content-range': `bytes */${head.size}`,
        'accept-ranges': 'bytes',
      },
    });
  }
  if (!object) return responseJson({ error: 'forge artifact not found' }, 404);

  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set('content-type', 'video/mp4');
  headers.set('cache-control', 'private, no-store');
  headers.set('accept-ranges', 'bytes');
  const body = request.method === 'HEAD' ? null : object.body;
  if (range && typeof object.size === 'number') {
    const satisfied = object.range ?? range;
    const offset = satisfied.offset ?? 0;
    const length = Math.min(satisfied.length ?? object.size - offset, object.size - offset);
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
    return new Response(body, { status: 206, headers });
  }
  if (typeof object.size === 'number') headers.set('content-length', String(object.size));
  return new Response(body, { headers });
}

function parseByteRange(value) {
  if (!value) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(value);
  if (!match) return null;
  const offset = Number(match[1]);
  const end = match[2] ? Number(match[2]) : undefined;
  if (!Number.isFinite(offset) || offset < 0) return null;
  if (end !== undefined && (!Number.isFinite(end) || end < offset)) return null;
  return end === undefined ? { offset } : { offset, length: end - offset + 1 };
}

function normalizeCompletedVariants(variants, job) {
  const expectedCount = job?.sourceKind === 'guided-app-capture' ? 1 : 3;
  if (!Array.isArray(variants) || variants.length !== expectedCount) {
    throw new Error(expectedCount === 1
      ? 'completed forge job requires exactly one variant'
      : 'completed forge job requires exactly three variants');
  }
  const ids = new Set();
  const seeds = new Set();
  const expectedSeeds = new Set((job.shot?.preview?.seeds ?? []).map(Number));
  for (const variant of variants) {
    const variantId = requiredString(variant?.variantId, 'variant.variantId');
    requiredString(variant?.artifactKey, 'variant.artifactKey');
    if (
      job?.sourceKind === 'guided-app-capture'
      && variant?.sourceSha256 !== job.sourceCapture?.sha256
    ) {
      throw new Error('guided app-demo preview must preserve the approved source hash');
    }
    if (job?.pointerTreatment?.requested === true) {
      assertVariantPointerTreatment(variant, job);
    }
    if (job?.sourceKind !== 'guided-app-capture') {
      const seed = Number(variant?.seed);
      if (!Number.isInteger(seed) || !expectedSeeds.has(seed)) {
        throw new Error('completed forge variants must preserve the requested preview seeds');
      }
      seeds.add(seed);
    }
    ids.add(variantId);
  }
  if (ids.size !== expectedCount) throw new Error('completed forge variants must have unique ids');
  if (job?.sourceKind !== 'guided-app-capture' && seeds.size !== expectedSeeds.size) {
    throw new Error('completed forge variants must preserve the requested preview seeds');
  }
  return variants;
}

// The renderer must say which treatment the bytes actually used, so a
// standard-cursor fallback can never be reported as the cartoon hand.
function assertVariantPointerTreatment(variant, job) {
  const reported = variant?.pointerTreatment;
  if (!reported) throw new Error('guided-app-demo@2 variants must report the pointer treatment used');
  if (!['cartoon-hand', 'standard-cursor'].includes(reported.outcome)) {
    throw new Error('reported pointer treatment outcome is unsupported');
  }
  if (!/^[a-f0-9]{64}$/i.test(String(reported.planDigest ?? ''))) {
    throw new Error('reported pointer treatment must carry a plan digest');
  }
  if (reported.outcome === 'cartoon-hand') {
    if (reported.fallbackReason) {
      throw new Error('a cartoon-hand variant must not carry a fallback reason');
    }
    const expectedTrace = job.pointerTreatment?.trace?.sha256;
    if (expectedTrace && String(reported.traceSha256).toLowerCase() !== expectedTrace) {
      throw new Error('reported pointer treatment trace hash does not match the approved trace');
    }
  } else if (!FALLBACK_REASONS.has(reported.fallbackReason)) {
    throw new Error('a standard-cursor variant must record a known fallback reason');
  }
}

function normalizeFinalVariant(variants, job) {
  if (!Array.isArray(variants) || variants.length !== 1) {
    throw new Error('completed final forge render requires exactly one variant');
  }
  const variant = variants[0];
  requiredString(variant?.variantId, 'variant.variantId');
  requiredString(variant?.artifactKey, 'variant.artifactKey');
  if (
    job?.sourceKind === 'guided-app-capture'
    && variant?.sourceSha256 !== job.sourceCapture?.sha256
  ) {
    throw new Error('guided app-demo final must preserve the approved source hash');
  }
  if (
    job?.sourceKind !== 'guided-app-capture'
    && Number(variant?.seed) !== Number(job.finalRender?.seed)
  ) {
    throw new Error('completed final forge render must preserve the accepted seed');
  }
  return variant;
}

async function assertStoredVariants(bucket, variants, job, renderKind) {
  const attempt = renderKind === 'final'
    ? Number(job.finalRender?.attempts)
    : Number(job.attempts);
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error(`forge ${renderKind} attempt is invalid`);
  }
  const prefix = renderKind === 'final'
    ? `${OUTPUT_PREFIX}${safeId(job.id)}/final/attempt-${attempt}/`
    : `${OUTPUT_PREFIX}${safeId(job.id)}/attempt-${attempt}/`;
  for (const variant of variants) {
    const variantId = requiredString(variant.variantId, 'variant.variantId');
    if (safeId(variantId) !== variantId) {
      throw new Error(`forge variant id is unsafe: ${variantId}`);
    }
    const expectedKey = `${prefix}${variantId}.mp4`;
    if (variant.artifactKey !== expectedKey) {
      throw forgeError('forge variant artifact does not match the active job attempt', 409);
    }
    if (!(await bucketObjectExists(bucket, expectedKey))) {
      throw forgeError('forge variant artifact was not uploaded', 409);
    }
  }
}

function assertLeaseOwner(job, workerId) {
  if (!job) throw forgeError('forge job not found', 404);
  const running = job.activeRenderKind === 'final'
    ? job.finalRender?.status === 'running'
    : job.status === 'running';
  if (!running || job.lease?.workerId !== workerId) {
    throw forgeError('forge job lease is not owned by this worker', 409);
  }
}

async function putJob(bucket, record, options = {}) {
  return bucket.put(jobKey(record.id), `${JSON.stringify(record, null, 2)}\n`, {
    ...(options.etag ? { onlyIf: { etagMatches: options.etag } } : {}),
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

async function assertJobIdAvailable(bucket, id) {
  if (await bucketObjectExists(bucket, jobKey(id))) {
    throw forgeError(`forge job already exists: ${id}`, 409);
  }
}

async function bucketObjectExists(bucket, key) {
  if (typeof bucket.head === 'function') return Boolean(await bucket.head(key));
  return Boolean(await bucket.get(key));
}

function requiredBucket(bucket) {
  if (!bucket) throw new Error('bucket is required');
  return bucket;
}

function jobKey(id) {
  return `${JOB_PREFIX}${safeId(id)}.json`;
}

function safeId(value) {
  const result = String(value).replace(/[^a-zA-Z0-9_.-]/g, '_');
  if (!result) throw new Error('id is required');
  return result;
}

function safeFileName(value) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function extensionFor(mediaType) {
  if (mediaType === 'image/png') return 'png';
  if (mediaType === 'image/webp') return 'webp';
  return 'jpg';
}

function requiredString(value, name) {
  const result = optionalString(value);
  if (!result) throw new Error(`${name} is required`);
  return result;
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function boundedInteger(value, name, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return number;
}

function responseJson(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isJsonRequest(request) {
  return request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    === 'application/json';
}

function forgeError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function statusForError(error) {
  return Number(error?.status ?? 400);
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
