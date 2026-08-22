import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { assertForgeJobFilmSkill, filmSkillExecutionContract } from '../src/film-skills.js';
import {
  createForgeJob,
  recordForgeDecision,
  requestForgeFinalRender,
  storeForgePointerTrace,
  updateForgeJob,
} from '../src/local-video-forge-coordinator.js';
import { POINTER_TRACE_SCHEMA } from '../src/pointer-trace.js';

const ROOT = new URL('..', import.meta.url);
const DEMO = new URL('fixtures/guided-app-demo/cartoon-hand-pointer/', ROOT);
const traceJson = await readFile(new URL('pointer-trace.json', DEMO), 'utf8');
const traceSha256 = sha256(traceJson);
const captureRecord = JSON.parse(await readFile(new URL('capture-record.json', DEMO), 'utf8'));
const evidence = JSON.parse(await readFile(new URL('evidence.json', DEMO), 'utf8'));
const STYLE_DIGEST = evidence.handStyle.digest;
const PLAN_DIGEST = evidence.plan.digest;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function createR2Bucket() {
  const objects = new Map();
  let revision = 0;
  return {
    async put(key, value, options = {}) {
      const existing = objects.get(key);
      if (options.onlyIf?.etagMatches && existing?.etag !== options.onlyIf.etagMatches) return null;
      let bytes;
      if (typeof value === 'string') bytes = new TextEncoder().encode(value);
      else if (value instanceof Uint8Array) bytes = value;
      else bytes = new Uint8Array(await new Response(value).arrayBuffer());
      const etag = `"test-${revision += 1}"`;
      objects.set(key, { bytes, etag, contentType: options.httpMetadata?.contentType });
      return { etag };
    },
    async get(key) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        body: object.bytes,
        etag: object.etag,
        httpEtag: object.etag,
        json: async () => JSON.parse(new TextDecoder().decode(object.bytes)),
        writeHttpMetadata: (headers) => headers.set('content-type', object.contentType ?? 'application/json'),
      };
    },
    async head(key) {
      const object = objects.get(key);
      return object ? { size: object.bytes.byteLength, etag: object.etag } : null;
    },
    async list({ prefix }) {
      return {
        objects: [...objects.keys()].filter((key) => key.startsWith(prefix)).sort().map((key) => ({ key })),
        truncated: false,
      };
    },
  };
}

async function seedCapture(bucket, overrides = {}) {
  const record = {
    schema: 'reel-pipeline.forge-capture.v1',
    id: 'capture-1',
    assetKey: 'video-forge/captures/capture-1.mp4',
    fileName: 'capture.mp4',
    mediaType: 'video/mp4',
    bytes: captureRecord.bytes,
    durationMs: captureRecord.durationMs,
    width: captureRecord.width,
    height: captureRecord.height,
    sha256: captureRecord.sha256,
    filmSkill: 'guided-app-demo@2',
    captureMethod: 'browser-display-media',
    displaySurface: 'browser-viewport',
    presenter: { mode: 'same-session', sync: 'same-session', position: 'bottom-right' },
    approval: { approved: true, approvedAt: '2026-08-22T00:00:00.000Z' },
    provenance: {
      sourceType: 'real-capture',
      sourceRevision: 'demo-revision',
      rights: { tier: 'production-safe', license: 'fleet-owned-product-surface', approved: true },
    },
    ...overrides,
  };
  await bucket.put(`video-forge/captures/${record.id}.json`, `${JSON.stringify(record, null, 2)}\n`);
  await bucket.put(record.assetKey, new Uint8Array(record.bytes));
  return record;
}

function traceRequest(body = traceJson) {
  return new Request('https://forge.test/forge/captures/capture-1/pointer-trace', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

test('an approved capture accepts a bound pointer trace and records its provenance', async () => {
  const bucket = createR2Bucket();
  await seedCapture(bucket);
  const record = await storeForgePointerTrace('capture-1', traceRequest(), { bucket });
  assert.equal(record.pointerTrace.schema, POINTER_TRACE_SCHEMA);
  assert.equal(record.pointerTrace.sha256, traceSha256);
  assert.equal(record.pointerTrace.eligible, true);
  assert.equal(record.pointerTrace.acquisitionMethod, 'scripted-browser-runner');
  assert.equal(record.pointerTrace.coordinateMapping, 'calibrated');
  const stored = await bucket.get('video-forge/captures/capture-1.pointer-trace.json');
  assert.ok(stored, 'the sidecar is stored beside the capture');
});

test('a pointer trace for the wrong capture or an older film skill is refused', async () => {
  const bucket = createR2Bucket();
  await seedCapture(bucket, { filmSkill: 'guided-app-demo@1' });
  await assert.rejects(
    storeForgePointerTrace('capture-1', traceRequest(), { bucket }),
    /pointer traces require a guided-app-demo@2 capture/,
  );

  const other = createR2Bucket();
  await seedCapture(other);
  const rebound = JSON.parse(traceJson);
  rebound.capture.sha256 = 'd'.repeat(64);
  const record = await storeForgePointerTrace('capture-1', traceRequest(JSON.stringify(rebound)), {
    bucket: other,
  });
  assert.equal(record.pointerTrace.eligible, false);
  assert.equal(record.pointerTrace.failures[0].code, 'trace-source-binding-mismatch');
});

test('an unsupported capture surface stays renderable with the standard cursor', async () => {
  const bucket = createR2Bucket();
  await seedCapture(bucket);
  const windowTrace = JSON.parse(traceJson);
  windowTrace.acquisition.displaySurface = 'window';
  await storeForgePointerTrace('capture-1', traceRequest(JSON.stringify(windowTrace)), { bucket });
  const job = await createForgeJob({
    captureId: 'capture-1',
    filmSkill: { id: 'guided-app-demo', version: 2 },
    project: { name: 'demo', aspectRatio: '9:16', fps: 24, style: 'clean' },
    prompt: 'Guide the viewer through one real product action.',
    context: 'Use the approved capture and pointer trace.',
    pointerTreatment: { requested: true, styleRef: 'fleet-mitt@1', styleDigest: STYLE_DIGEST, styleRightsApproved: true },
  }, { bucket });
  assert.equal(job.pointerTreatment.outcome, 'standard-cursor');
  assert.equal(job.pointerTreatment.fallbackReason, 'unsupported-source-mapping');
  assert.deepEqual(job.requiredCapabilities, ['ffmpeg', 'guided-app-demo']);
});

test('a requested treatment queues a cartoon-hand job and binds it through review and final render', async () => {
  const bucket = createR2Bucket();
  await seedCapture(bucket);
  await storeForgePointerTrace('capture-1', traceRequest(), { bucket });
  const job = await createForgeJob({
    id: 'forge-cartoon-hand',
    captureId: 'capture-1',
    filmSkill: { id: 'guided-app-demo', version: 2 },
    project: { name: 'demo', aspectRatio: '9:16', fps: 24, style: 'clean' },
    prompt: 'Guide the viewer through one real product action.',
    context: 'Use the approved capture and pointer trace.',
    pointerTreatment: {
      requested: true,
      styleRef: 'fleet-mitt@1',
      styleDigest: STYLE_DIGEST,
      styleRightsApproved: true,
    },
  }, { bucket });
  assert.deepEqual(job.requiredCapabilities, ['ffmpeg', 'guided-app-demo', 'cartoon-hand-pointer']);
  assert.equal(job.pointerTreatment.trace.sha256, traceSha256);
  assert.equal(job.pointerTreatment.plan, null, 'the plan digest arrives with the render');

  const claimed = await updateForgeJob('forge-cartoon-hand', 'progress', {
    workerId: 'mac-1',
    progress: { stage: 'encoding-approved-capture' },
  }, { bucket }).catch((error) => error);
  assert.ok(claimed instanceof Error, 'an unleased worker cannot report progress');

  const leased = await bucket.get('video-forge/jobs/forge-cartoon-hand.json');
  const record = await leased.json();
  await bucket.put('video-forge/jobs/forge-cartoon-hand.json', `${JSON.stringify({
    ...record,
    status: 'running',
    activeRenderKind: 'preview',
    attempts: 1,
    lease: { workerId: 'mac-1', expiresAt: new Date(Date.now() + 3.6e6).toISOString() },
  }, null, 2)}\n`);
  await bucket.put('video-forge/outputs/forge-cartoon-hand/attempt-1/guided-preview.mp4', new Uint8Array(16));

  await assert.rejects(updateForgeJob('forge-cartoon-hand', 'complete', {
    workerId: 'mac-1',
    variants: [{
      variantId: 'guided-preview',
      artifactKey: 'video-forge/outputs/forge-cartoon-hand/attempt-1/guided-preview.mp4',
      sourceSha256: captureRecord.sha256,
    }],
  }, { bucket }), /must report the pointer treatment used/);

  await assert.rejects(updateForgeJob('forge-cartoon-hand', 'complete', {
    workerId: 'mac-1',
    variants: [{
      variantId: 'guided-preview',
      artifactKey: 'video-forge/outputs/forge-cartoon-hand/attempt-1/guided-preview.mp4',
      sourceSha256: captureRecord.sha256,
      pointerTreatment: {
        outcome: 'cartoon-hand',
        planDigest: PLAN_DIGEST,
        fallbackReason: 'operator-disabled',
        traceSha256,
      },
    }],
  }, { bucket }), /must not carry a fallback reason/);

  const completed = await updateForgeJob('forge-cartoon-hand', 'complete', {
    workerId: 'mac-1',
    variants: [{
      variantId: 'guided-preview',
      artifactKey: 'video-forge/outputs/forge-cartoon-hand/attempt-1/guided-preview.mp4',
      sourceSha256: captureRecord.sha256,
      pointerTreatment: {
        outcome: 'cartoon-hand',
        planDigest: PLAN_DIGEST,
        fallbackReason: null,
        traceSha256,
        styleRef: 'fleet-mitt@1',
      },
    }],
  }, { bucket });
  assert.equal(completed.status, 'completed');

  const reviewed = await recordForgeDecision('forge-cartoon-hand', {
    decision: 'accepted',
    variantId: 'guided-preview',
  }, { bucket });
  assert.equal(reviewed.review.selection.pointerTreatmentDigest, PLAN_DIGEST);
  assert.equal(reviewed.review.selection.pointerTreatmentOutcome, 'cartoon-hand');

  const queued = await requestForgeFinalRender('forge-cartoon-hand', {}, { bucket });
  assert.equal(queued.finalRender.pointerTreatmentDigest, PLAN_DIGEST);
  assert.equal(queued.pointerTreatment.plan.digest, PLAN_DIGEST);
});

test('film skill gates refuse a treatment that version one cannot render or a final that drifts', () => {
  const contract = filmSkillExecutionContract('guided-app-demo@2');
  const base = {
    filmSkill: { ref: 'guided-app-demo@2', contract },
    brief: { prompt: 'Guide one real action.', context: 'Approved capture.' },
    project: { aspectRatio: '9:16' },
    sourceCapture: {
      assetKey: 'video-forge/captures/capture-1.mp4',
      sha256: captureRecord.sha256,
      approval: { approved: true },
      provenance: {
        sourceType: 'real-capture',
        sourceRevision: 'demo-revision',
        rights: { tier: 'production-safe', license: 'fleet-owned', approved: true },
      },
      presenter: { mode: 'same-session', sync: 'same-session' },
    },
    pointerTreatment: {
      requested: true,
      trace: {
        schema: POINTER_TRACE_SCHEMA,
        sha256: traceSha256,
        digest: PLAN_DIGEST,
        sourceSha256: captureRecord.sha256,
      },
      style: { ref: 'fleet-mitt@1', digest: STYLE_DIGEST, rightsApproved: true, tier: 'production-safe' },
      plan: { digest: PLAN_DIGEST, outcome: 'cartoon-hand', fallbackReason: null },
    },
    review: {
      selection: {
        variantId: 'guided-preview',
        seed: null,
        sourceSha256: captureRecord.sha256,
        pointerTreatmentDigest: PLAN_DIGEST,
      },
    },
    finalRender: {
      approvedVariantId: 'guided-preview',
      seed: null,
      sourceSha256: captureRecord.sha256,
      pointerTreatmentDigest: PLAN_DIGEST,
    },
  };

  const preview = assertForgeJobFilmSkill(base, { renderKind: 'preview' });
  assert.equal(preview.pointerTreatment.outcome, 'cartoon-hand');
  const final = assertForgeJobFilmSkill(base, { renderKind: 'final' });
  assert.equal(final.pointerTreatment.planDigest, PLAN_DIGEST);

  const versionOne = {
    ...base,
    filmSkill: { ref: 'guided-app-demo@1', contract: filmSkillExecutionContract('guided-app-demo@1') },
  };
  assert.throws(
    () => assertForgeJobFilmSkill(versionOne, { renderKind: 'preview' }),
    /does not support the cartoon-hand pointer/,
  );

  const unbound = structuredClone(base);
  unbound.pointerTreatment.trace.sourceSha256 = 'e'.repeat(64);
  assert.throws(
    () => assertForgeJobFilmSkill(unbound, { renderKind: 'preview' }),
    /pointer-trace-integrity/,
  );

  const drifted = structuredClone(base);
  drifted.finalRender.pointerTreatmentDigest = 'f'.repeat(64);
  assert.throws(
    () => assertForgeJobFilmSkill(drifted, { renderKind: 'final' }),
    /must record the accepted pointer treatment digest/,
  );

  const mislabelled = structuredClone(base);
  mislabelled.pointerTreatment.plan = {
    digest: PLAN_DIGEST,
    outcome: 'cartoon-hand',
    fallbackReason: 'operator-disabled',
  };
  assert.throws(
    () => assertForgeJobFilmSkill(mislabelled, { renderKind: 'preview' }),
    /cannot label a fallen-back render/,
  );

  const unapprovedStyle = structuredClone(base);
  unapprovedStyle.pointerTreatment.style.rightsApproved = false;
  assert.throws(
    () => assertForgeJobFilmSkill(unapprovedStyle, { renderKind: 'preview' }),
    /hand-style-rights/,
  );

  const noPresenter = structuredClone(base);
  noPresenter.sourceCapture.presenter = { mode: 'none', sync: 'none' };
  assert.throws(
    () => assertForgeJobFilmSkill(noPresenter, { renderKind: 'preview' }),
    /without a same-session presenter/,
  );
});

test('the committed demo evidence matches the committed bytes and claims no spend', async () => {
  assert.equal(evidence.filmSkill, 'guided-app-demo@2');
  assert.equal(evidence.spend.paidGenerationCalls, 0);
  assert.equal(evidence.source.sha256, captureRecord.sha256);
  assert.equal(evidence.pointerTrace.sha256, traceSha256);
  assert.equal(evidence.review.automatedStatus, 'pass');
  assert.equal(evidence.review.ownerDecision, null, 'automated gates are not an owner approval');
  assert.equal(evidence.review.publication, 'blocked-pending-owner-review');
  assert.equal(evidence.handStyle.checksumFailures.length, 0);

  for (const output of evidence.outputs) {
    const bytes = await readFile(new URL(output.path, ROOT));
    assert.equal(sha256(bytes), output.sha256, `${output.path} hash must match the evidence`);
    assert.equal(bytes.byteLength, output.bytes);
    assert.equal(output.width, 720);
    assert.equal(output.height, 1280);
  }
  const proofFrame = await readFile(new URL(evidence.proofFrame.path, ROOT));
  assert.equal(sha256(proofFrame), evidence.proofFrame.sha256);

  const measured = evidence.measurements.hotspotSamples.filter((sample) => !sample.clipped);
  assert.ok(measured.length >= 4, 'the review measured several representative frames');
  for (const sample of measured) {
    assert.ok(sample.errorPx <= evidence.measurements.hotspotTolerancePx);
    assert.equal(sample.compositedRingPresent, true);
  }
  assert.ok(evidence.outputs.some((output) => output.treatment === 'standard-cursor'));
});
