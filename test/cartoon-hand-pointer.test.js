import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CARTOON_HAND_FILM_SKILL,
  FALLBACK_REASONS,
  handStyleRightsFailure,
  markerFullyInsideFrame,
  normalizeHandStyle,
  planCartoonHandPointer,
  renderCartoonHandFrameSvg,
  representativeReviewFrames,
  reviewCartoonHandPlan,
  verifyHandStylePoseDigests,
} from '../src/cartoon-hand-pointer.js';
import { handStylePath, loadHandStyle } from '../src/cartoon-hand-overlay.js';
import { assertForgeJobFilmSkill, resolveFilmSkill } from '../src/film-skills.js';
import { buildGuidedAppDemoFfmpegArgs } from '../src/guided-app-demo.js';
import {
  evaluatePointerTraceBinding,
  normalizePointerTrace,
  POINTER_TRACE_SCHEMA,
  samplePointerTrace,
} from '../src/pointer-trace.js';

const ROOT = new URL('..', import.meta.url);
const DEMO = new URL('fixtures/guided-app-demo/cartoon-hand-pointer/', ROOT);
const COMPOSITION = {
  width: 720,
  height: 1280,
  fps: 24,
  presenter: { position: 'bottom-right', widthFraction: 0.24, safeMarginFraction: 0.06 },
};

const approvedTraceJson = await readFile(new URL('pointer-trace.json', DEMO), 'utf8');
const approvedTraceSha256 = createHash('sha256').update(approvedTraceJson).digest('hex');
const approvedCapture = JSON.parse(await readFile(new URL('capture-record.json', DEMO), 'utf8'));
const { style: approvedStyle, poseSources } = await loadHandStyle('fleet-mitt@1', {
  root: new URL('.', ROOT).pathname,
});

function approvedTrace() {
  return JSON.parse(approvedTraceJson);
}

function planDemo(overrides = {}) {
  return planCartoonHandPointer({
    filmSkillRef: CARTOON_HAND_FILM_SKILL,
    capture: approvedCapture,
    trace: approvedTrace(),
    traceSha256: approvedTraceSha256,
    style: approvedStyle,
    composition: COMPOSITION,
    treatmentRequested: true,
    ...overrides,
  });
}

test('the approved pointer trace is privacy-bounded and bound to the approved capture', () => {
  const trace = normalizePointerTrace(approvedTrace());
  assert.equal(trace.schema, POINTER_TRACE_SCHEMA);
  assert.equal(trace.capture.sha256, approvedCapture.sha256);
  assert.equal(trace.acquisition.coordinateMapping, 'calibrated');
  assert.equal(trace.acquisition.capturedCursor.present, false);
  for (const sample of trace.samples) {
    assert.deepEqual(
      Object.keys(sample).sort(),
      ['inBounds', 'primaryDown', 'tMs', 'x', 'y'],
    );
  }
  const binding = evaluatePointerTraceBinding({
    trace,
    capture: approvedCapture,
    traceSha256: approvedTraceSha256,
  });
  assert.equal(binding.eligible, true);
  assert.deepEqual(binding.failures, []);
});

test('pointer traces reject keystrokes, text, selectors, and window titles', () => {
  for (const field of ['keystrokes', 'enteredText', 'cssSelector', 'windowTitle', 'appName']) {
    const trace = approvedTrace();
    trace.acquisition[field] = 'captured';
    assert.throws(
      () => normalizePointerTrace(trace),
      /must not contain input or application content/,
      `${field} should be rejected`,
    );
  }
  const withSampleField = approvedTrace();
  withSampleField.samples[3].text = 'hello';
  assert.throws(() => normalizePointerTrace(withSampleField), /must not contain input/);
  const withUnknownField = approvedTrace();
  withUnknownField.samples[3].pressure = 0.4;
  assert.throws(() => normalizePointerTrace(withUnknownField), /unrecognized field: pressure/);
});

test('pointer traces require a monotonic timebase inside the declared duration', () => {
  const unordered = approvedTrace();
  unordered.samples[5].tMs = unordered.samples[4].tMs;
  assert.throws(() => normalizePointerTrace(unordered), /must increase monotonically/);

  const overrun = approvedTrace();
  overrun.samples[overrun.samples.length - 1].tMs = overrun.timebase.durationMs + 500;
  assert.throws(() => normalizePointerTrace(overrun), /exceeds the declared duration/);

  const outside = approvedTrace();
  outside.samples[6] = { ...outside.samples[6], x: 1.4, inBounds: true };
  assert.throws(() => normalizePointerTrace(outside), /marked in-bounds but is outside/);
});

test('sampling interpolates position and steps the button state', () => {
  const trace = normalizePointerTrace({
    schema: POINTER_TRACE_SCHEMA,
    version: 1,
    traceId: 'unit',
    timebase: { unit: 'milliseconds', startedAtMs: 0, durationMs: 200, monotonic: true },
    capture: { width: 720, height: 1280, fps: 24, sha256: 'a'.repeat(64) },
    acquisition: {
      method: 'operator-display-helper',
      displaySurface: 'monitor',
      calibration: {
        method: 'display-corner-probe',
        evidence: 'four corner probes matched the encoded capture',
        viewport: { width: 720, height: 1280, deviceScaleFactor: 1 },
      },
      capturedCursor: { present: true, sizePx: 18, reason: 'macOS cursor is composited into the display capture' },
    },
    samples: [
      { tMs: 0, x: 0, y: 0, primaryDown: false, inBounds: true },
      { tMs: 100, x: 1, y: 0.5, primaryDown: true, inBounds: true },
      { tMs: 200, x: 1, y: 0.5, primaryDown: false, inBounds: true },
    ],
  });
  const midpoint = samplePointerTrace(trace, 50);
  assert.equal(midpoint.x, 0.5);
  assert.equal(midpoint.y, 0.25);
  assert.equal(midpoint.primaryDown, false, 'button state must not be averaged');
  assert.equal(samplePointerTrace(trace, 150).primaryDown, true);
  assert.equal(samplePointerTrace(trace, 999).tMs, 200);
});

test('binding rejects the wrong capture, an unproven surface, and a desynchronized trace', () => {
  const wrongHash = evaluatePointerTraceBinding({
    trace: approvedTrace(),
    capture: { ...approvedCapture, sha256: 'b'.repeat(64) },
  });
  assert.equal(wrongHash.eligible, false);
  assert.equal(wrongHash.failures[0].code, 'trace-source-binding-mismatch');

  const windowTrace = approvedTrace();
  windowTrace.acquisition.displaySurface = 'window';
  const unmapped = evaluatePointerTraceBinding({ trace: windowTrace, capture: approvedCapture });
  assert.equal(unmapped.eligible, false);
  assert.ok(unmapped.failures.some((failure) => failure.code === 'unsupported-source-mapping'));

  const desynced = evaluatePointerTraceBinding({
    trace: approvedTrace(),
    capture: { ...approvedCapture, durationMs: approvedCapture.durationMs + 900 },
  });
  assert.ok(desynced.failures.some((failure) => failure.code === 'trace-synchronization-failure'));

  const resized = evaluatePointerTraceBinding({
    trace: approvedTrace(),
    capture: { ...approvedCapture, width: 1080 },
  });
  assert.ok(resized.failures.some((failure) => failure.code === 'trace-dimension-mismatch'));

  const tampered = evaluatePointerTraceBinding({
    trace: approvedTrace(),
    capture: { ...approvedCapture, pointerTrace: { sha256: 'c'.repeat(64) } },
    traceSha256: approvedTraceSha256,
  });
  assert.ok(tampered.failures.some((failure) => failure.code === 'trace-integrity-failure'));
});

test('hand styles require explicit rights, checksums, and an operator-selected appearance', async () => {
  assert.equal(handStylePath('fleet-mitt@1'), 'assets/cartoon-hand/fleet-mitt-v1.json');
  assert.equal(approvedStyle.appearanceSelection, 'operator-selected');
  assert.equal(handStyleRightsFailure(approvedStyle), null);
  assert.deepEqual(verifyHandStylePoseDigests(approvedStyle, poseSources), []);

  const tampered = { ...poseSources, tap: `${poseSources.tap}<!-- edited -->` };
  assert.deepEqual(verifyHandStylePoseDigests(approvedStyle, tampered), ['tap pose asset checksum mismatch']);

  const manifest = JSON.parse(await readFile(new URL(handStylePath('fleet-mitt@1'), ROOT), 'utf8'));
  const expired = normalizeHandStyle({
    ...manifest,
    rights: { ...manifest.rights, expiresAt: '2020-01-01T00:00:00.000Z' },
  });
  assert.match(handStyleRightsFailure(expired), /expired/);
  const unapproved = normalizeHandStyle({
    ...manifest,
    rights: { ...manifest.rights, approved: false },
  });
  assert.match(handStyleRightsFailure(unapproved), /not approved/);
  const proofOnly = normalizeHandStyle({
    ...manifest,
    rights: { ...manifest.rights, tier: 'proof-only' },
  });
  assert.match(handStyleRightsFailure(proofOnly), /not production-safe/);
});

test('the approved demo plans a cartoon-hand treatment with the fingertip on every hotspot', () => {
  const plan = planDemo();
  assert.equal(plan.treatment, 'cartoon-hand');
  assert.equal(plan.fallbackReason, null);
  assert.equal(plan.binding.sourceSha256, approvedCapture.sha256);
  assert.equal(plan.binding.traceSha256, approvedTraceSha256);
  assert.equal(plan.binding.styleRef, 'fleet-mitt@1');
  assert.equal(plan.measurements.illegibleFrames, 0);
  for (const state of ['point', 'tap', 'grab', 'release', 'off-screen']) {
    assert.ok(plan.measurements.states[state] > 0, `expected ${state} frames`);
  }
  for (const frame of plan.frames) {
    if (!frame.visible) continue;
    assert.deepEqual(frame.fingertip, frame.hotspot);
    assert.ok(frame.ring.radiusPx >= 6);
    assert.ok(frame.cover.radiusPx > 0);
  }
  assert.equal(planDemo().digest, plan.digest, 'planning must be deterministic');
});

test('the treatment falls back to the standard cursor with a recorded reason', () => {
  const disabled = planDemo({ treatmentRequested: false });
  assert.equal(disabled.treatment, 'standard-cursor');
  assert.equal(disabled.fallbackReason, 'operator-disabled');
  assert.deepEqual(disabled.frames, []);

  const noPresenter = planDemo({ capture: { ...approvedCapture, presenter: { mode: 'none' } } });
  assert.equal(noPresenter.fallbackReason, 'presenter-anchor-missing');

  const wrongSkill = planDemo({ filmSkillRef: 'guided-app-demo@1' });
  assert.equal(wrongSkill.fallbackReason, 'film-skill-does-not-support-treatment');

  const windowTrace = approvedTrace();
  windowTrace.acquisition.displaySurface = 'browser-tab';
  assert.equal(planDemo({ trace: windowTrace }).fallbackReason, 'unsupported-source-mapping');

  const cursorTrace = approvedTrace();
  cursorTrace.acquisition.capturedCursor = {
    present: true,
    sizePx: 96,
    reason: 'oversized system cursor is baked into the display capture',
  };
  assert.equal(planDemo({ trace: cursorTrace }).fallbackReason, 'cursor-coverage-unproven');

  const expiredStyle = normalizeHandStyle({
    ...JSON.parse(JSON.stringify({ ...approvedStyle, digest: undefined })),
    rights: { ...approvedStyle.rights, expiresAt: '2020-01-01T00:00:00.000Z' },
  });
  assert.equal(planDemo({ style: expiredStyle }).fallbackReason, 'hand-style-rights-missing');

  for (const plan of [disabled, noPresenter, wrongSkill]) {
    assert.ok(FALLBACK_REASONS.has(plan.fallbackReason));
  }
});

test('the reduced-motion variant keeps pointing without drag animation', () => {
  const plan = planDemo({ reducedMotion: true });
  assert.equal(plan.treatment, 'cartoon-hand');
  assert.notEqual(plan.digest, planDemo().digest);
  assert.equal(plan.measurements.states.grab, undefined);
  assert.ok(plan.measurements.states.tap > 0);
  for (const frame of plan.frames) {
    if (!frame.visible) continue;
    assert.ok(['point', 'tap', 'release'].includes(frame.state));
  }
});

test('overlay frames draw the hotspot marker at the traced coordinate and scale by viewBox', () => {
  const plan = planDemo();
  const frame = representativeReviewFrames(plan).find((candidate) => candidate.state === 'tap');
  assert.ok(frame, 'expected a tap frame for review');
  assert.equal(markerFullyInsideFrame(plan, frame), true);
  const svg = renderCartoonHandFrameSvg(plan, frame, poseSources);
  assert.ok(svg.includes(`cx="${frame.hotspot.x}" cy="${frame.hotspot.y}"`));
  assert.ok(svg.includes('width="720" height="1280" viewBox="0 0 720 1280"'));
  assert.ok(!svg.includes('{{fill}}'), 'palette tokens must be substituted');

  const scaled = renderCartoonHandFrameSvg(plan, frame, poseSources, { scale: 1.5 });
  assert.ok(scaled.includes('width="1080" height="1920" viewBox="0 0 720 1280"'));

  const hidden = plan.frames.find((candidate) => !candidate.visible);
  assert.ok(renderCartoonHandFrameSvg(plan, hidden, poseSources).includes('fill="none"'));
  assert.throws(
    () => renderCartoonHandFrameSvg(plan, frame, { ...poseSources, tap: '' }),
    /missing pose asset for tap/,
  );
  assert.equal(renderCartoonHandFrameSvg(planDemo({ treatmentRequested: false }), frame, poseSources), null);
});

test('review gates fail on drifted fingertips and pass on measured ones', () => {
  const plan = planDemo();
  const frames = representativeReviewFrames(plan);
  const measured = frames.map((frame) => ({
    frameIndex: frame.index,
    expected: frame.hotspot,
    errorPx: 0.3,
    clipped: false,
  }));
  const passing = reviewCartoonHandPlan(plan, {
    hotspotSamples: measured,
    styleAssetFailures: [],
    previewDigest: plan.digest,
    finalDigest: plan.digest,
    reducedMotionPlanDigest: planDemo({ reducedMotion: true }).digest,
    fallbackProofDigest: planDemo({ treatmentRequested: false }).digest,
  });
  assert.equal(passing.automatedStatus, 'pass');
  assert.deepEqual(passing.failed, []);
  assert.equal(
    passing.gates.find((gate) => gate.id === 'captured-cursor-coverage').status,
    'not-applicable',
  );

  const drifted = reviewCartoonHandPlan(plan, {
    hotspotSamples: [...measured, { frameIndex: 99, errorPx: 6.2, clipped: false }],
    styleAssetFailures: [],
  });
  assert.equal(drifted.automatedStatus, 'fail');
  assert.ok(drifted.failed.includes('fingertip-hotspot-precision'));

  const missing = reviewCartoonHandPlan(plan, {
    hotspotSamples: [{ frameIndex: 4, errorPx: null, clipped: false }],
    styleAssetFailures: ['tap pose asset checksum mismatch'],
  });
  assert.ok(missing.failed.includes('fingertip-hotspot-precision'));
  assert.ok(missing.failed.includes('hand-style-rights'));

  const fallbackReview = reviewCartoonHandPlan(planDemo({ treatmentRequested: false }), {});
  assert.equal(fallbackReview.treatment, 'standard-cursor');
  assert.equal(fallbackReview.automatedStatus, 'pass');
});

test('guided-app-demo@1 stays unchanged while version 2 registers the treatment', () => {
  const one = resolveFilmSkill('guided-app-demo@1');
  assert.equal(one.scenePrimitives.includes('cartoon-hand-pointer'), false);
  assert.equal(one.defaults.cartoonHandPointer, undefined);
  assert.deepEqual(one.qualityGates.map((gate) => gate.id), [
    'real-app-capture',
    'authentic-presenter-sync',
    'presenter-safe-area',
    'mobile-legibility',
    'publication-rights',
  ]);

  const two = resolveFilmSkill('guided-app-demo@2');
  assert.equal(two.ref, CARTOON_HAND_FILM_SKILL);
  assert.ok(two.scenePrimitives.includes('cartoon-hand-pointer'));
  assert.equal(two.defaults.cartoonHandPointer.fallback, 'standard-cursor');
  assert.equal(two.defaults.cartoonHandPointer.pointerTraceSchema, POINTER_TRACE_SCHEMA);
  for (const gate of [
    'pointer-trace-integrity',
    'fingertip-hotspot-precision',
    'captured-cursor-coverage',
    'hand-style-rights',
    'standard-cursor-fallback',
  ]) {
    assert.ok(two.qualityGates.some((entry) => entry.id === gate), `missing gate ${gate}`);
  }
  assert.equal(two.reference.manifest, 'examples/coherent-films/guided-app-demo-v2.template.json');
});

test('the overlay compositor only changes the encoder when a treatment is rendered', () => {
  const plain = buildGuidedAppDemoFfmpegArgs({
    inputPath: '/tmp/capture.mp4',
    outputPath: '/tmp/preview.mp4',
    renderKind: 'preview',
    hasAudio: true,
  });
  assert.ok(plain.includes('-vf'));
  assert.equal(plain.includes('-filter_complex'), false);

  const composited = buildGuidedAppDemoFfmpegArgs({
    inputPath: '/tmp/capture.mp4',
    outputPath: '/tmp/preview.mp4',
    renderKind: 'final',
    hasAudio: true,
    overlay: { framePattern: '/tmp/overlay-%05d.png', fps: 24 },
  });
  const filter = composited[composited.indexOf('-filter_complex') + 1];
  assert.ok(filter.includes('[1:v]scale=1080:1920'));
  assert.ok(filter.includes('overlay=0:0:eof_action=pass'));
  assert.ok(composited.includes('[composited]'));
});
