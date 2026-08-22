import { createHash } from 'node:crypto';

import {
  evaluatePointerTraceBinding,
  normalizePointerTrace,
  samplePointerTrace,
  stableJson,
} from './pointer-trace.js';

export const CARTOON_HAND_STYLE_SCHEMA = 'reel-pipeline.cartoon-hand-style.v1';
export const CARTOON_HAND_PLAN_SCHEMA = 'reel-pipeline.cartoon-hand-pointer-plan.v1';
export const CARTOON_HAND_PRIMITIVE = 'cartoon-hand-pointer';
export const CARTOON_HAND_FILM_SKILL = 'guided-app-demo@2';

export const HAND_POSES = ['point', 'tap', 'grab', 'release'];
export const POINTER_STATES = ['point', 'tap', 'grab', 'release', 'idle', 'off-screen'];

// Every reason the render keeps the ordinary cursor. The reason is recorded on
// the job; the output is never labelled as using the cartoon-hand treatment.
export const FALLBACK_REASONS = new Set([
  'operator-disabled',
  'presenter-anchor-missing',
  'unsupported-source-mapping',
  'trace-integrity-failure',
  'trace-source-binding-mismatch',
  'trace-synchronization-failure',
  'trace-dimension-mismatch',
  'cursor-coverage-unproven',
  'no-legible-placement',
  'hand-style-rights-missing',
  'film-skill-does-not-support-treatment',
]);

// Local pose coordinate contract: the fingertip sits at (0, 0) and the arm
// extends toward negative x. Pose assets are authored in this space so the
// renderer can rotate a pose about the exact interaction hotspot.
export const POSE_LOCAL_LENGTH = 200;

const DEFAULT_TUNING = {
  idleRetractMs: 900,
  idleFadeMs: 260,
  idleMoveThreshold: 0.0015,
  dragSpeedThreshold: 0.00035,
  releaseHoldMs: 160,
  handLengthFraction: 0.2,
  coverRadiusFraction: 0.026,
  minCoverRadiusPx: 9,
  ringRadiusFraction: 0.022,
  minRingRadiusPx: 6,
  armWidthFraction: 0.032,
  titleBandFraction: 0.12,
  captionBandFraction: 0.18,
  reducedMotionHoldMs: 420,
  hotspotTolerancePx: 2,
};

export function cartoonHandTuning(overrides = {}) {
  return { ...DEFAULT_TUNING, ...overrides };
}

export function normalizeHandStyle(input) {
  const style = requiredObject(input, 'handStyle');
  if (style.schema !== CARTOON_HAND_STYLE_SCHEMA) {
    throw new Error(`hand style schema must be ${CARTOON_HAND_STYLE_SCHEMA}`);
  }
  const id = requiredString(style.id, 'handStyle.id');
  const version = requiredInteger(style.version, 'handStyle.version');
  if (version < 1) throw new Error('handStyle.version must be at least 1');
  const handedness = requiredString(style.handedness, 'handStyle.handedness');
  if (!['left', 'right'].includes(handedness)) {
    throw new Error('handStyle.handedness must be left or right');
  }
  const palette = requiredObject(style.palette, 'handStyle.palette');
  const paletteTokens = {};
  for (const token of ['fill', 'outline', 'cuff', 'ring', 'ringOutline']) {
    paletteTokens[token] = requiredColor(palette[token], `handStyle.palette.${token}`);
  }
  const poses = requiredObject(style.poses, 'handStyle.poses');
  const normalizedPoses = {};
  for (const pose of HAND_POSES) {
    const entry = requiredObject(poses[pose], `handStyle.poses.${pose}`);
    normalizedPoses[pose] = {
      path: requiredString(entry.path, `handStyle.poses.${pose}.path`),
      sha256: requiredSha256(entry.sha256, `handStyle.poses.${pose}.sha256`),
    };
  }
  const rights = requiredObject(style.rights, 'handStyle.rights');
  const tier = requiredString(rights.tier, 'handStyle.rights.tier');
  const expiresAt = rights.expiresAt === undefined || rights.expiresAt === null
    ? null
    : requiredString(rights.expiresAt, 'handStyle.rights.expiresAt');
  const normalized = {
    schema: CARTOON_HAND_STYLE_SCHEMA,
    id,
    version,
    ref: `${id}@${version}`,
    title: requiredString(style.title, 'handStyle.title'),
    handedness,
    palette: paletteTokens,
    poses: normalizedPoses,
    rights: {
      license: requiredString(rights.license, 'handStyle.rights.license'),
      provenance: requiredString(rights.provenance, 'handStyle.rights.provenance'),
      tier,
      approved: rights.approved === true,
      verifiedAt: requiredString(rights.verifiedAt, 'handStyle.rights.verifiedAt'),
      expiresAt,
    },
    // Appearance is operator-selected only. There is no presenter-derived
    // inference path in this module by construction.
    appearanceSelection: 'operator-selected',
  };
  return Object.freeze({
    ...normalized,
    digest: sha256Hex(stableJson(normalized)),
  });
}

export function handStyleRightsFailure(style, now = new Date()) {
  if (style.rights.approved !== true) return 'hand style rights are not approved';
  if (style.rights.tier !== 'production-safe') {
    return `hand style rights tier ${style.rights.tier} is not production-safe`;
  }
  if (style.rights.expiresAt && Date.parse(style.rights.expiresAt) <= now.getTime()) {
    return `hand style rights expired at ${style.rights.expiresAt}`;
  }
  return null;
}

export function verifyHandStylePoseDigests(style, poseSources) {
  const failures = [];
  for (const pose of HAND_POSES) {
    const source = poseSources?.[pose];
    if (typeof source !== 'string' || source.trim() === '') {
      failures.push(`${pose} pose asset is missing`);
      continue;
    }
    const digest = sha256Hex(source);
    if (digest !== style.poses[pose].sha256) {
      failures.push(`${pose} pose asset checksum mismatch`);
    }
  }
  return failures;
}

export function planCartoonHandPointer(input) {
  const filmSkillRef = requiredString(input.filmSkillRef, 'filmSkillRef');
  const composition = normalizeComposition(input.composition);
  const tuning = cartoonHandTuning(input.tuning);
  const reducedMotion = input.reducedMotion === true;
  const capture = requiredObject(input.capture, 'capture');
  const trace = normalizePointerTrace(input.trace);
  const style = input.style?.schema === CARTOON_HAND_STYLE_SCHEMA && Object.isFrozen(input.style)
    ? input.style
    : normalizeHandStyle(input.style);

  const binding = evaluatePointerTraceBinding({
    trace,
    capture,
    ...(input.traceSha256 === undefined ? {} : { traceSha256: input.traceSha256 }),
    ...(input.durationToleranceMs === undefined
      ? {}
      : { durationToleranceMs: input.durationToleranceMs }),
  });

  const base = {
    schema: CARTOON_HAND_PLAN_SCHEMA,
    filmSkill: filmSkillRef,
    reducedMotion,
    composition,
    binding: {
      ...binding.binding,
      styleRef: style.ref,
      styleDigest: style.digest,
      filmSkill: filmSkillRef,
      reducedMotion,
    },
  };

  const rejection = firstRejection({
    filmSkillRef,
    treatmentRequested: input.treatmentRequested !== false,
    presenterMode: capture.presenter?.mode ?? 'none',
    bindingFailures: binding.failures,
    style,
    now: input.now ?? new Date(),
  });
  if (rejection) return finalizeFallback(base, rejection);

  const presenter = presenterAnchorRect(composition);
  const safeAreas = safeAreaBands(composition, tuning, presenter);
  const geometry = {
    handLengthPx: composition.width * tuning.handLengthFraction,
    coverRadiusPx: Math.max(
      tuning.minCoverRadiusPx,
      composition.width * tuning.coverRadiusFraction,
    ),
    ringRadiusPx: Math.max(tuning.minRingRadiusPx, composition.width * tuning.ringRadiusFraction),
    armWidthPx: composition.width * tuning.armWidthFraction,
  };

  const capturedCursor = trace.acquisition.capturedCursor;
  if (capturedCursor.present) {
    const requiredRadiusPx = (Number(capturedCursor.sizePx) * Math.SQRT2) / 2;
    if (geometry.coverRadiusPx < requiredRadiusPx) {
      return finalizeFallback(base, {
        reason: 'cursor-coverage-unproven',
        detail: `fingertip cover radius ${round(geometry.coverRadiusPx)}px cannot cover a ${capturedCursor.sizePx}px captured cursor`,
      });
    }
  }

  const frameCount = Math.max(1, Math.round((trace.timebase.durationMs / 1000) * composition.fps));
  const frames = [];
  let illegibleFrames = 0;
  let interactionFrames = 0;
  let lastTransitionMs = null;
  let lastMovementMs = 0;
  let previousSample = samplePointerTrace(trace, 0);
  let previousDown = previousSample.primaryDown;

  for (let index = 0; index < frameCount; index += 1) {
    const timeMs = (index * 1000) / composition.fps;
    const sample = samplePointerTrace(trace, timeMs);
    const dt = Math.max(1, timeMs - previousSample.tMs);
    const distance = Math.hypot(sample.x - previousSample.x, sample.y - previousSample.y);
    const speed = distance / dt;
    if (distance > tuning.idleMoveThreshold) lastMovementMs = timeMs;
    if (sample.primaryDown !== previousDown) lastTransitionMs = timeMs;

    const state = resolvePointerState({
      sample,
      previousDown,
      speed,
      timeMs,
      lastMovementMs,
      lastTransitionMs,
      tuning,
      reducedMotion,
    });
    const opacity = resolveOpacity({ state, timeMs, lastMovementMs, lastTransitionMs, tuning, reducedMotion });
    const frame = composeFrame({
      index,
      timeMs,
      state,
      opacity,
      sample,
      composition,
      presenter,
      safeAreas,
      geometry,
      reducedMotion,
    });
    if (frame.visible && !frame.legible) illegibleFrames += 1;
    if (['tap', 'grab', 'release'].includes(state)) interactionFrames += 1;
    frames.push(frame);
    previousSample = sample;
    previousDown = sample.primaryDown;
  }

  if (illegibleFrames > 0) {
    return finalizeFallback(base, {
      reason: 'no-legible-placement',
      detail: `${illegibleFrames} of ${frames.length} frames had no legible hand placement`,
    });
  }

  const plan = {
    ...base,
    treatment: 'cartoon-hand',
    fallbackReason: null,
    fallbackDetail: null,
    style: {
      ref: style.ref,
      digest: style.digest,
      handedness: style.handedness,
      palette: style.palette,
      poses: style.poses,
    },
    presenter,
    safeAreas,
    geometry: {
      handLengthPx: round(geometry.handLengthPx),
      coverRadiusPx: round(geometry.coverRadiusPx),
      ringRadiusPx: round(geometry.ringRadiusPx),
      armWidthPx: round(geometry.armWidthPx),
    },
    capturedCursor: {
      present: capturedCursor.present,
      reason: capturedCursor.reason,
      ...(capturedCursor.sizePx === undefined ? {} : { sizePx: capturedCursor.sizePx }),
    },
    frameCount,
    frames,
    measurements: {
      frameCount,
      interactionFrames,
      illegibleFrames,
      visibleFrames: frames.filter((frame) => frame.visible).length,
      states: countStates(frames),
    },
  };
  return Object.freeze({ ...plan, digest: sha256Hex(stableJson(plan)) });
}

// A hotspot marker that runs off the frame edge cannot be centroid-measured,
// so review prefers frames whose marker is fully inside the composition.
export function markerFullyInsideFrame(plan, frame) {
  if (!frame?.visible) return false;
  const extent = Math.max(plan.geometry.ringRadiusPx, plan.geometry.coverRadiusPx) + 1;
  return frame.hotspot.x - extent >= 0
    && frame.hotspot.y - extent >= 0
    && frame.hotspot.x + extent <= plan.composition.width
    && frame.hotspot.y + extent <= plan.composition.height;
}

export function representativeReviewFrames(plan, limit = 6) {
  if (plan.treatment !== 'cartoon-hand') return [];
  const wanted = ['tap', 'grab', 'release', 'point'];
  const chosen = [];
  const measurable = plan.frames.filter((frame) => markerFullyInsideFrame(plan, frame));
  for (const state of wanted) {
    const frame = measurable.find(
      (candidate) => candidate.state === state && !chosen.includes(candidate),
    );
    if (frame) chosen.push(frame);
  }
  for (const frame of measurable) {
    if (chosen.length >= limit) break;
    if (!chosen.includes(frame)) chosen.push(frame);
  }
  return chosen.slice(0, limit).sort((left, right) => left.index - right.index);
}

// Deterministic transparent overlay for one frame. The plan is authored in one
// reference composition and the SVG is emitted at `scale` with an unchanged
// viewBox, so a preview and a final render share the same plan digest while
// rasterizing crisply at their own sizes.
export function renderCartoonHandFrameSvg(plan, frame, poseSources, options = {}) {
  if (plan.treatment !== 'cartoon-hand') return null;
  const scale = Number(options.scale ?? 1);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('overlay scale must be positive');
  const { width, height } = plan.composition;
  const outputWidth = Math.round(width * scale);
  const outputHeight = Math.round(height * scale);
  if (!frame.visible) return blankOverlaySvg(width, height, scale);
  const pose = poseSources?.[frame.pose];
  if (typeof pose !== 'string' || pose.trim() === '') {
    throw new Error(`missing pose asset for ${frame.pose}`);
  }
  const palette = plan.style.palette;
  const poseFragment = applyPaletteTokens(pose, palette);
  const arm = frame.arm;
  const armPath = `M ${arm.shoulder.x} ${arm.shoulder.y} C ${arm.control1.x} ${arm.control1.y}, ${arm.control2.x} ${arm.control2.y}, ${arm.wrist.x} ${arm.wrist.y}`;
  const poseScale = round(frame.hand.lengthPx / POSE_LOCAL_LENGTH, 5);
  const mirror = plan.style.handedness === 'left' ? ' scale(1,-1)' : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}">`,
    `<g opacity="${round(frame.opacity, 3)}">`,
    `<path d="${armPath}" fill="none" stroke="${palette.outline}" stroke-width="${round(arm.width + (arm.width * 0.45))}" stroke-linecap="round"/>`,
    `<path d="${armPath}" fill="none" stroke="${palette.cuff}" stroke-width="${round(arm.width)}" stroke-linecap="round"/>`,
    `<g transform="translate(${frame.fingertip.x} ${frame.fingertip.y}) rotate(${round(frame.hand.angleDeg, 3)}) scale(${poseScale})${mirror}">`,
    poseFragment,
    '</g>',
    `<circle cx="${frame.hotspot.x}" cy="${frame.hotspot.y}" r="${round(frame.cover.radiusPx)}" fill="${palette.fill}" stroke="${palette.outline}" stroke-width="${round(Math.max(2, frame.cover.radiusPx * 0.18))}"/>`,
    `<circle cx="${frame.hotspot.x}" cy="${frame.hotspot.y}" r="${round(frame.ring.radiusPx)}" fill="none" stroke="${palette.ringOutline}" stroke-width="${round(frame.ring.strokeWidthPx + 2)}"/>`,
    `<circle cx="${frame.hotspot.x}" cy="${frame.hotspot.y}" r="${round(frame.ring.radiusPx)}" fill="none" stroke="${palette.ring}" stroke-width="${round(frame.ring.strokeWidthPx)}"/>`,
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}

export function blankOverlaySvg(width, height, scale = 1) {
  const outputWidth = Math.round(width * scale);
  const outputHeight = Math.round(height * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="none"/></svg>\n`;
}

// Review gates. `measurements` carries observations taken from rendered
// frames; nothing here assumes a gate passed because the plan intended it to.
export function reviewCartoonHandPlan(plan, measurements = {}) {
  const gates = [];
  const tolerancePx = Number(measurements.hotspotTolerancePx ?? DEFAULT_TUNING.hotspotTolerancePx);

  gates.push(plan.treatment === 'cartoon-hand'
    ? { id: 'pointer-trace-integrity', status: 'pass', detail: `trace ${plan.binding.traceDigest.slice(0, 12)} bound to capture ${plan.binding.sourceSha256.slice(0, 12)}` }
    : { id: 'pointer-trace-integrity', status: 'fallback', detail: `standard cursor: ${plan.fallbackReason}` });

  if (plan.treatment !== 'cartoon-hand') {
    gates.push({
      id: 'standard-cursor-fallback',
      status: FALLBACK_REASONS.has(plan.fallbackReason) ? 'pass' : 'fail',
      detail: `recorded fallback reason ${plan.fallbackReason}`,
    });
    return summarizeGates(gates, plan, { treatment: 'standard-cursor' });
  }

  const allSamples = Array.isArray(measurements.hotspotSamples) ? measurements.hotspotSamples : [];
  const clipped = allSamples.filter((sample) => sample.clipped === true);
  const samples = allSamples.filter((sample) => sample.clipped !== true);
  const located = samples.filter((sample) => Number.isFinite(sample.errorPx));
  const maxErrorPx = located.length ? Math.max(...located.map((sample) => sample.errorPx)) : null;
  gates.push(samples.length === 0
    ? { id: 'fingertip-hotspot-precision', status: 'unmeasured', detail: 'no rendered-frame hotspot measurements supplied' }
    : located.length !== samples.length
      ? { id: 'fingertip-hotspot-precision', status: 'fail', detail: `${samples.length - located.length} representative frames had no locatable hotspot marker` }
      : maxErrorPx > tolerancePx
        ? { id: 'fingertip-hotspot-precision', status: 'fail', detail: `max fingertip-to-hotspot error ${round(maxErrorPx, 3)}px exceeds ${tolerancePx}px` }
        : { id: 'fingertip-hotspot-precision', status: 'pass', detail: `max fingertip-to-hotspot error ${round(maxErrorPx, 3)}px over ${samples.length} representative frames${clipped.length ? `; ${clipped.length} edge-clipped frames excluded from centroid measurement` : ''}` });

  gates.push(plan.capturedCursor.present
    ? measurements.capturedCursorCovered === true
      ? { id: 'captured-cursor-coverage', status: 'pass', detail: 'captured cursor proven inside the fingertip cover' }
      : { id: 'captured-cursor-coverage', status: 'fail', detail: 'captured cursor coverage was not proven on representative frames' }
    : { id: 'captured-cursor-coverage', status: 'not-applicable', detail: plan.capturedCursor.reason });

  gates.push(plan.measurements.illegibleFrames === 0
    ? { id: 'presenter-safe-area', status: 'pass', detail: 'arm and hand cleared the presenter, title, and caption bands on every frame' }
    : { id: 'presenter-safe-area', status: 'fail', detail: `${plan.measurements.illegibleFrames} frames collided with a safe area` });

  gates.push(plan.geometry.ringRadiusPx >= DEFAULT_TUNING.minRingRadiusPx
    ? { id: 'mobile-legibility', status: 'pass', detail: `hotspot ring radius ${plan.geometry.ringRadiusPx}px at ${plan.composition.width}px wide` }
    : { id: 'mobile-legibility', status: 'fail', detail: 'hotspot ring is too small to read at phone size' });

  const styleFailures = Array.isArray(measurements.styleAssetFailures)
    ? measurements.styleAssetFailures
    : null;
  gates.push(styleFailures === null
    ? { id: 'hand-style-rights', status: 'unmeasured', detail: 'no hand-style checksum verification supplied' }
    : styleFailures.length === 0
      ? { id: 'hand-style-rights', status: 'pass', detail: `${plan.style.ref} rights and pose checksums verified` }
      : { id: 'hand-style-rights', status: 'fail', detail: styleFailures.join('; ') });

  const previewDigest = measurements.previewDigest ?? null;
  const finalDigest = measurements.finalDigest ?? null;
  gates.push(previewDigest && finalDigest
    ? previewDigest === finalDigest
      ? { id: 'preview-final-binding', status: 'pass', detail: `preview and final share plan digest ${previewDigest.slice(0, 12)}` }
      : { id: 'preview-final-binding', status: 'fail', detail: 'preview and final treatment inputs differ' }
    : { id: 'preview-final-binding', status: 'unmeasured', detail: 'preview or final plan digest missing' });

  gates.push(measurements.reducedMotionPlanDigest
    ? { id: 'reduced-motion', status: 'pass', detail: `reduced-motion variant planned (${measurements.reducedMotionPlanDigest.slice(0, 12)})` }
    : { id: 'reduced-motion', status: 'unmeasured', detail: 'no reduced-motion variant planned' });

  gates.push({
    id: 'standard-cursor-fallback',
    status: measurements.fallbackProofDigest ? 'pass' : 'unmeasured',
    detail: measurements.fallbackProofDigest
      ? `standard-cursor fallback render proven (${String(measurements.fallbackProofDigest).slice(0, 12)})`
      : 'no standard-cursor fallback render supplied',
  });

  return summarizeGates(gates, plan, { treatment: 'cartoon-hand' });
}

function summarizeGates(gates, plan, extra) {
  const failed = gates.filter((gate) => gate.status === 'fail');
  const unmeasured = gates.filter((gate) => gate.status === 'unmeasured');
  return {
    schema: 'reel-pipeline.cartoon-hand-pointer-review.v1',
    filmSkill: plan.filmSkill,
    planDigest: plan.digest,
    ...extra,
    // An automated pass is not an owner approval; the publishing gates still
    // require a recorded human decision.
    automatedStatus: failed.length ? 'fail' : unmeasured.length ? 'incomplete' : 'pass',
    failed: failed.map((gate) => gate.id),
    unmeasured: unmeasured.map((gate) => gate.id),
    gates,
  };
}

function firstRejection({ filmSkillRef, treatmentRequested, presenterMode, bindingFailures, style, now }) {
  if (filmSkillRef !== CARTOON_HAND_FILM_SKILL) {
    return {
      reason: 'film-skill-does-not-support-treatment',
      detail: `${filmSkillRef} does not register the cartoon-hand pointer primitive`,
    };
  }
  if (!treatmentRequested) {
    return { reason: 'operator-disabled', detail: 'the operator disabled the cartoon-hand treatment' };
  }
  if (presenterMode !== 'same-session') {
    return {
      reason: 'presenter-anchor-missing',
      detail: 'the cartoon arm requires a same-session presenter frame to anchor to',
    };
  }
  if (bindingFailures.length) {
    const failure = bindingFailures[0];
    return { reason: failure.code, detail: failure.detail };
  }
  const rightsFailure = handStyleRightsFailure(style, now);
  if (rightsFailure) return { reason: 'hand-style-rights-missing', detail: rightsFailure };
  return null;
}

function finalizeFallback(base, { reason, detail }) {
  if (!FALLBACK_REASONS.has(reason)) throw new Error(`unknown cartoon-hand fallback reason: ${reason}`);
  const plan = {
    ...base,
    treatment: 'standard-cursor',
    fallbackReason: reason,
    fallbackDetail: detail,
    frameCount: 0,
    frames: [],
    measurements: {
      frameCount: 0,
      interactionFrames: 0,
      illegibleFrames: 0,
      visibleFrames: 0,
      states: {},
    },
  };
  return Object.freeze({ ...plan, digest: sha256Hex(stableJson(plan)) });
}

function resolvePointerState({
  sample,
  previousDown,
  speed,
  timeMs,
  lastMovementMs,
  lastTransitionMs,
  tuning,
  reducedMotion,
}) {
  if (!sample.inBounds) return 'off-screen';
  if (sample.primaryDown) {
    if (reducedMotion) return 'tap';
    return speed > tuning.dragSpeedThreshold ? 'grab' : 'tap';
  }
  if (
    previousDown === true
    || (lastTransitionMs !== null && timeMs - lastTransitionMs <= tuning.releaseHoldMs)
  ) {
    return 'release';
  }
  if (timeMs - lastMovementMs >= tuning.idleRetractMs) return 'idle';
  if (reducedMotion) {
    const nearTransition = lastTransitionMs !== null
      && timeMs - lastTransitionMs <= tuning.reducedMotionHoldMs;
    return nearTransition ? 'point' : 'idle';
  }
  return 'point';
}

function resolveOpacity({ state, timeMs, lastMovementMs, tuning, reducedMotion }) {
  if (state === 'off-screen') return 0;
  if (state !== 'idle') return 1;
  // A reduced-motion render shows the hand at interaction moments only, so it
  // never travels or lingers between them.
  if (reducedMotion) return 0;
  const idleFor = timeMs - lastMovementMs - tuning.idleRetractMs;
  if (idleFor <= 0) return 1;
  return Math.max(0, 1 - (idleFor / tuning.idleFadeMs));
}

function composeFrame({
  index,
  timeMs,
  state,
  opacity,
  sample,
  composition,
  presenter,
  safeAreas,
  geometry,
  reducedMotion,
}) {
  const hotspot = {
    x: round(sample.x * composition.width),
    y: round(sample.y * composition.height),
  };
  const visible = opacity > 0.02 && state !== 'off-screen';
  if (!visible) {
    return {
      index,
      timeMs: round(timeMs, 3),
      state,
      pose: null,
      visible: false,
      legible: true,
      opacity: 0,
      hotspot,
    };
  }

  const pose = state === 'grab'
    ? 'grab'
    : state === 'release'
      ? 'release'
      : state === 'tap'
        ? 'tap'
        : 'point';
  const shoulder = nearestPresenterAnchor(presenter, hotspot);
  const dx = hotspot.x - shoulder.x;
  const dy = hotspot.y - shoulder.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const handLengthPx = Math.min(geometry.handLengthPx, length * 0.9);
  const wrist = {
    x: round(hotspot.x - (ux * handLengthPx * 0.62)),
    y: round(hotspot.y - (uy * handLengthPx * 0.62)),
  };

  let chosen = null;
  for (const side of [1, -1]) {
    const candidate = armGeometry({
      shoulder,
      wrist,
      hotspot,
      side,
      length,
      composition,
      safeAreas,
      presenter,
      armWidthPx: geometry.armWidthPx,
      handLengthPx,
      reducedMotion,
    });
    if (candidate.legible) {
      chosen = candidate;
      break;
    }
    if (!chosen || candidate.clearance > chosen.clearance) chosen = candidate;
  }

  return {
    index,
    timeMs: round(timeMs, 3),
    state,
    pose,
    visible: true,
    legible: chosen.legible,
    opacity: round(opacity, 3),
    hotspot,
    fingertip: hotspot,
    hand: {
      side: chosen.side,
      angleDeg: round(angleDeg, 3),
      lengthPx: round(handLengthPx),
    },
    arm: {
      shoulder,
      control1: chosen.control1,
      control2: chosen.control2,
      wrist,
      width: round(geometry.armWidthPx),
    },
    cover: { radiusPx: round(geometry.coverRadiusPx) },
    ring: {
      radiusPx: round(geometry.ringRadiusPx),
      strokeWidthPx: round(Math.max(2, geometry.ringRadiusPx * 0.28)),
    },
  };
}

function armGeometry({
  shoulder,
  wrist,
  hotspot,
  side,
  length,
  composition,
  safeAreas,
  presenter,
  armWidthPx,
  handLengthPx,
  reducedMotion,
}) {
  const dx = wrist.x - shoulder.x;
  const dy = wrist.y - shoulder.y;
  const norm = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / norm;
  const ny = dx / norm;
  // Cartoon stretch: bow the arm away from the pointer path, reduced until the
  // curve clears every safe band, then reported as illegible if it never does.
  const maxBow = reducedMotion ? 0 : Math.min(length * 0.26, composition.width * 0.22);
  for (let attempt = 0; attempt <= 4; attempt += 1) {
    const bow = maxBow * (1 - (attempt * 0.25)) * side;
    const control1 = {
      x: round(shoulder.x + (dx * 0.34) + (nx * bow)),
      y: round(shoulder.y + (dy * 0.34) + (ny * bow)),
    };
    const control2 = {
      x: round(shoulder.x + (dx * 0.72) + (nx * bow * 0.55)),
      y: round(shoulder.y + (dy * 0.72) + (ny * bow * 0.55)),
    };
    const clearance = curveClearance({
      shoulder,
      control1,
      control2,
      wrist,
      hotspot,
      safeAreas,
      presenter,
      composition,
      armWidthPx,
      handLengthPx,
      side,
      nx,
      ny,
    });
    if (clearance > 0) return { side, control1, control2, legible: true, clearance };
    if (attempt === 4) return { side, control1, control2, legible: false, clearance };
  }
  throw new Error('unreachable arm geometry search');
}

function curveClearance({
  shoulder,
  control1,
  control2,
  wrist,
  hotspot,
  safeAreas,
  presenter,
  composition,
  armWidthPx,
  handLengthPx,
  side,
  nx,
  ny,
}) {
  const margin = armWidthPx / 2;
  let clearance = Number.POSITIVE_INFINITY;
  // Sample the arm curve and the palm centre. The fingertip itself is exempt:
  // it must sit exactly on the interaction hotspot even inside a safe band.
  const points = [];
  for (let step = 1; step <= 10; step += 1) {
    const t = step / 12;
    points.push(cubicPoint(shoulder, control1, control2, wrist, t));
  }
  points.push({
    x: hotspot.x + (nx * side * handLengthPx * 0.18) - ((hotspot.x - wrist.x) * 0.35),
    y: hotspot.y + (ny * side * handLengthPx * 0.18) - ((hotspot.y - wrist.y) * 0.35),
  });
  for (const point of points) {
    if (
      point.x < margin
      || point.y < margin
      || point.x > composition.width - margin
      || point.y > composition.height - margin
    ) {
      return -1;
    }
    for (const band of safeAreas.bands) {
      if (pointInRect(point, band.rect)) return -1;
      clearance = Math.min(clearance, rectDistance(point, band.rect));
    }
    if (pointInRect(point, presenter.rect)) return -1;
    clearance = Math.min(clearance, rectDistance(point, presenter.rect));
  }
  return clearance === Number.POSITIVE_INFINITY ? 1 : clearance;
}

function presenterAnchorRect(composition) {
  const width = composition.width * composition.presenter.widthFraction;
  const height = width * (4 / 3);
  const margin = composition.width * composition.presenter.safeMarginFraction;
  const rect = composition.presenter.position === 'bottom-left'
    ? { x: margin, y: composition.height - margin - height, width, height }
    : { x: composition.width - margin - width, y: composition.height - margin - height, width, height };
  return {
    position: composition.presenter.position,
    rect: {
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height),
    },
    anchors: {
      top: { x: round(rect.x + (rect.width / 2)), y: round(rect.y) },
      inner: composition.presenter.position === 'bottom-left'
        ? { x: round(rect.x + rect.width), y: round(rect.y + (rect.height / 2)) }
        : { x: round(rect.x), y: round(rect.y + (rect.height / 2)) },
    },
  };
}

function nearestPresenterAnchor(presenter, hotspot) {
  const { top, inner } = presenter.anchors;
  const toTop = Math.hypot(hotspot.x - top.x, hotspot.y - top.y);
  const toInner = Math.hypot(hotspot.x - inner.x, hotspot.y - inner.y);
  return toTop <= toInner ? top : inner;
}

function safeAreaBands(composition, tuning, presenter) {
  return {
    bands: [
      {
        id: 'title',
        rect: {
          x: 0,
          y: 0,
          width: composition.width,
          height: round(composition.height * tuning.titleBandFraction),
        },
      },
      {
        id: 'captions',
        rect: {
          x: 0,
          y: round(composition.height * (1 - tuning.captionBandFraction)),
          width: round(presenter.rect.x),
          height: round(composition.height * tuning.captionBandFraction),
        },
      },
    ],
  };
}

function normalizeComposition(input) {
  const composition = requiredObject(input, 'composition');
  const width = requiredInteger(composition.width, 'composition.width');
  const height = requiredInteger(composition.height, 'composition.height');
  const fps = requiredInteger(composition.fps, 'composition.fps');
  if (fps <= 0 || fps > 120) throw new Error('composition.fps is out of range');
  const presenter = requiredObject(composition.presenter, 'composition.presenter');
  const position = requiredString(presenter.position, 'composition.presenter.position');
  if (!['bottom-right', 'bottom-left'].includes(position)) {
    throw new Error('composition.presenter.position must be bottom-right or bottom-left');
  }
  return {
    width,
    height,
    fps,
    presenter: {
      position,
      widthFraction: requiredNumber(presenter.widthFraction, 'composition.presenter.widthFraction'),
      safeMarginFraction: requiredNumber(
        presenter.safeMarginFraction,
        'composition.presenter.safeMarginFraction',
      ),
    },
  };
}

function applyPaletteTokens(source, palette) {
  return source.replace(/\{\{([a-zA-Z]+)\}\}/g, (match, token) => {
    if (!(token in palette)) throw new Error(`pose asset references unknown palette token: ${token}`);
    return palette[token];
  }).trim();
}

function countStates(frames) {
  const counts = {};
  for (const frame of frames) counts[frame.state] = (counts[frame.state] ?? 0) + 1;
  return counts;
}

function cubicPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: (mt ** 3 * p0.x) + (3 * mt ** 2 * t * p1.x) + (3 * mt * t ** 2 * p2.x) + (t ** 3 * p3.x),
    y: (mt ** 3 * p0.y) + (3 * mt ** 2 * t * p1.y) + (3 * mt * t ** 2 * p2.y) + (t ** 3 * p3.y),
  };
}

function pointInRect(point, rect) {
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}

function rectDistance(point, rect) {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value.trim();
}

function requiredNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number`);
  return number;
}

function requiredInteger(value, label) {
  const number = requiredNumber(value, label);
  if (!Number.isInteger(number)) throw new Error(`${label} must be an integer`);
  return number;
}

function requiredColor(value, label) {
  const text = requiredString(value, label);
  if (!/^#[0-9a-fA-F]{6}$/.test(text)) throw new Error(`${label} must be a #rrggbb color`);
  return text;
}

function requiredSha256(value, label) {
  const text = requiredString(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) throw new Error(`${label} must be a 64-character sha256 hash`);
  return text;
}
