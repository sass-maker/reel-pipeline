#!/usr/bin/env node
// Render the cartoon-hand pointer demo from the approved capture, the approved
// pointer trace, and a rights-cleared hand style.
//
// Everything here is local and free: ffmpeg, sips, and this repository's own
// deterministic overlay planner. No generation API is called, no model is
// downloaded, and nothing is published.
//
//   node scripts/render-cartoon-hand-pointer-demo.js
//   node scripts/render-cartoon-hand-pointer-demo.js --check
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  markerFullyInsideFrame,
  planCartoonHandPointer,
  representativeReviewFrames,
  reviewCartoonHandPlan,
} from '../src/cartoon-hand-pointer.js';
import {
  DEFAULT_SVG_RASTERIZER,
  loadHandStyle,
  rasterizeCartoonHandOverlay,
} from '../src/cartoon-hand-overlay.js';
import { renderGuidedAppDemoCapture } from '../src/guided-app-demo.js';
import { normalizePointerTrace } from '../src/pointer-trace.js';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_DIR = path.join(ROOT, 'fixtures/guided-app-demo/cartoon-hand-pointer');
const CAPTURE_RECORD_PATH = path.join(DEMO_DIR, 'capture-record.json');
const TRACE_PATH = path.join(DEMO_DIR, 'pointer-trace.json');
const STYLE_REF = 'fleet-mitt@1';
const EVIDENCE_PATH = path.join(DEMO_DIR, 'evidence.json');
const PROOF_FRAME_PATH = path.join(ROOT, 'assets/cartoon-hand/proof-frame-tap.png');
const OUTPUTS = {
  cartoonHand: path.join(DEMO_DIR, 'cartoon-hand-preview.mp4'),
  reducedMotion: path.join(DEMO_DIR, 'cartoon-hand-reduced-motion-preview.mp4'),
  standardCursor: path.join(DEMO_DIR, 'standard-cursor-preview.mp4'),
};
const FILM_SKILL = 'guided-app-demo@2';
const COMPOSITION = {
  width: 720,
  height: 1280,
  fps: 24,
  presenter: { position: 'bottom-right', widthFraction: 0.24, safeMarginFraction: 0.06 },
};
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';
const SIPS = DEFAULT_SVG_RASTERIZER;

const checkOnly = process.argv.slice(2).includes('--check');
const inputs = await loadInputs();

if (checkOnly) await check(inputs);
else await render(inputs);

async function loadInputs() {
  const record = JSON.parse(await readFile(CAPTURE_RECORD_PATH, 'utf8'));
  const capturePath = path.join(ROOT, record.assetKey);
  const captureBytes = await readFile(capturePath);
  const captureSha = sha256(captureBytes);
  if (captureSha !== record.sha256) {
    throw new Error(`approved capture hash mismatch: ${captureSha} != ${record.sha256}`);
  }
  const traceBytes = await readFile(TRACE_PATH);
  const traceSha = sha256(traceBytes);
  if (traceSha !== record.pointerTrace.sha256) {
    throw new Error(`approved pointer trace hash mismatch: ${traceSha}`);
  }
  const trace = normalizePointerTrace(JSON.parse(traceBytes.toString('utf8')));
  if (trace.capture.sha256 !== record.sha256) {
    throw new Error('pointer trace is not bound to the approved capture hash');
  }
  const { style, poseSources, manifestPath, checksumFailures } = await loadHandStyle(STYLE_REF, {
    root: ROOT,
  });
  const styleAssetFailures = checksumFailures;

  const plan = planCartoonHandPointer({
    filmSkillRef: FILM_SKILL,
    capture: { ...record, sha256: record.sha256 },
    trace,
    traceSha256: traceSha,
    style,
    composition: COMPOSITION,
    treatmentRequested: true,
  });
  const reducedMotionPlan = planCartoonHandPointer({
    filmSkillRef: FILM_SKILL,
    capture: { ...record, sha256: record.sha256 },
    trace,
    traceSha256: traceSha,
    style,
    composition: COMPOSITION,
    treatmentRequested: true,
    reducedMotion: true,
  });
  // The fallback is planned from the same inputs with the treatment disabled,
  // so the standard-cursor render is a recorded decision, not a missing feature.
  const fallbackPlan = planCartoonHandPointer({
    filmSkillRef: FILM_SKILL,
    capture: { ...record, sha256: record.sha256 },
    trace,
    traceSha256: traceSha,
    style,
    composition: COMPOSITION,
    treatmentRequested: false,
  });
  if (plan.treatment !== 'cartoon-hand') {
    throw new Error(`cartoon-hand plan fell back to the standard cursor: ${plan.fallbackReason} (${plan.fallbackDetail})`);
  }
  return {
    record,
    capturePath,
    captureBytes,
    captureSha,
    trace,
    traceSha,
    style,
    stylePath: manifestPath,
    poseSources,
    styleAssetFailures,
    plan,
    reducedMotionPlan,
    fallbackPlan,
  };
}

async function check(loaded) {
  const failures = [];
  const evidence = JSON.parse(await readFile(EVIDENCE_PATH, 'utf8'));
  if (evidence.plan.digest !== loaded.plan.digest) {
    failures.push(`cartoon-hand plan digest drifted: ${loaded.plan.digest}`);
  }
  if (evidence.plan.reducedMotionDigest !== loaded.reducedMotionPlan.digest) {
    failures.push('reduced-motion plan digest drifted');
  }
  if (evidence.plan.fallbackDigest !== loaded.fallbackPlan.digest) {
    failures.push('standard-cursor fallback plan digest drifted');
  }
  for (const output of evidence.outputs) {
    const filePath = path.join(ROOT, output.path);
    const bytes = await readFile(filePath).catch(() => null);
    if (!bytes) {
      failures.push(`missing rendered output ${output.path}`);
      continue;
    }
    if (sha256(bytes) !== output.sha256) failures.push(`${output.path} hash drifted`);
    const probed = await probe(filePath);
    if (probed.width !== output.width || probed.height !== output.height) {
      failures.push(`${output.path} is ${probed.width}x${probed.height}`);
    }
  }
  const proof = await readFile(PROOF_FRAME_PATH).catch(() => null);
  if (!proof) failures.push('missing proof frame');
  else if (sha256(proof) !== evidence.proofFrame.sha256) failures.push('proof frame hash drifted');
  if (failures.length) {
    console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    status: 'pass',
    filmSkill: FILM_SKILL,
    planDigest: loaded.plan.digest,
    outputs: evidence.outputs.map((output) => output.path),
    automatedReview: evidence.review.automatedStatus,
    ownerDecision: evidence.review.ownerDecision,
  }, null, 2));
}

async function render(loaded) {
  const { plan, reducedMotionPlan, fallbackPlan } = loaded;
  await mkdir(DEMO_DIR, { recursive: true });
  const overlayRoot = await mkdtemp(path.join(tmpdir(), 'cartoon-hand-overlay-'));
  const cartoonFrames = await rasterizeCartoonHandOverlay({
    plan,
    poseSources: loaded.poseSources,
    dir: path.join(overlayRoot, 'cartoon'),
  });
  const reducedFrames = await rasterizeCartoonHandOverlay({
    plan: reducedMotionPlan,
    poseSources: loaded.poseSources,
    dir: path.join(overlayRoot, 'reduced'),
  });

  const renders = [];
  renders.push({
    key: 'cartoonHand',
    treatment: 'cartoon-hand',
    planDigest: plan.digest,
    result: await renderGuidedAppDemoCapture({
      inputPath: loaded.capturePath,
      outputPath: OUTPUTS.cartoonHand,
      renderKind: 'preview',
      overlay: { framePattern: cartoonFrames.framePattern, fps: cartoonFrames.fps },
    }),
  });
  renders.push({
    key: 'reducedMotion',
    treatment: 'cartoon-hand-reduced-motion',
    planDigest: reducedMotionPlan.digest,
    result: await renderGuidedAppDemoCapture({
      inputPath: loaded.capturePath,
      outputPath: OUTPUTS.reducedMotion,
      renderKind: 'preview',
      overlay: { framePattern: reducedFrames.framePattern, fps: reducedFrames.fps },
    }),
  });
  renders.push({
    key: 'standardCursor',
    treatment: 'standard-cursor',
    planDigest: fallbackPlan.digest,
    result: await renderGuidedAppDemoCapture({
      inputPath: loaded.capturePath,
      outputPath: OUTPUTS.standardCursor,
      renderKind: 'preview',
    }),
  });

  const representative = representativeReviewFrames(plan);
  const hotspotSamples = [];
  for (const frame of representative) {
    const overlayPath = path.join(cartoonFrames.dir, `overlay-${String(frame.index).padStart(5, '0')}.png`);
    const measured = await measureRingCentroid(overlayPath, frame, plan);
    const composited = await ringPresentInVideoFrame(OUTPUTS.cartoonHand, frame, plan);
    hotspotSamples.push({
      frameIndex: frame.index,
      state: frame.state,
      clipped: !markerFullyInsideFrame(plan, frame),
      expected: frame.hotspot,
      measured: measured.centroid,
      errorPx: measured.errorPx,
      ringPixels: measured.pixels,
      compositedRingPixels: composited.pixels,
      compositedRingPresent: composited.present,
    });
  }

  const tapFrame = representative.find((frame) => frame.state === 'tap') ?? representative[0];
  await extractVideoFrame(OUTPUTS.cartoonHand, tapFrame.index, PROOF_FRAME_PATH);

  const review = reviewCartoonHandPlan(plan, {
    hotspotSamples,
    styleAssetFailures: loaded.styleAssetFailures,
    previewDigest: plan.digest,
    finalDigest: plan.digest,
    reducedMotionPlanDigest: reducedMotionPlan.digest,
    fallbackProofDigest: fallbackPlan.digest,
    capturedCursorCovered: undefined,
  });

  const outputs = [];
  for (const entry of renders) {
    const filePath = entry.result.outputPath;
    const bytes = await readFile(filePath);
    const probed = await probe(filePath);
    outputs.push({
      key: entry.key,
      path: path.relative(ROOT, filePath),
      treatment: entry.treatment,
      planDigest: entry.planDigest,
      sha256: sha256(bytes),
      bytes: bytes.byteLength,
      width: probed.width,
      height: probed.height,
      durationSeconds: round(probed.duration, 3),
      renderer: {
        compositor: 'reel-pipeline guided-app-demo@2 overlay compositor',
        video: `${FFMPEG} libx264 crf${entry.result.profile.crf} ${entry.result.profile.width}x${entry.result.profile.height}`,
        overlayRasterizer: entry.key === 'standardCursor' ? null : `${SIPS} svg-to-png (rgba)`,
        profile: entry.result.profile.label,
        renderDurationMs: entry.result.renderDurationMs,
      },
    });
  }

  const proofBytes = await readFile(PROOF_FRAME_PATH);
  const evidence = {
    schema: 'reel-pipeline.cartoon-hand-pointer-proof.v1',
    filmSkill: FILM_SKILL,
    generatedAt: new Date().toISOString(),
    spend: {
      paidGenerationCalls: 0,
      note: 'Local Chrome capture, local SVG rasterization, and local ffmpeg only. No generation API was called.',
    },
    source: {
      path: path.relative(ROOT, loaded.capturePath),
      sha256: loaded.captureSha,
      bytes: loaded.captureBytes.byteLength,
      posture: loaded.record.sourcePosture,
      executionMode: loaded.record.executionMode,
      surface: loaded.record.surface,
      capturedBy: loaded.record.renderer,
      rights: loaded.record.provenance.rights,
      approval: loaded.record.approval,
    },
    pointerTrace: {
      path: path.relative(ROOT, TRACE_PATH),
      sha256: loaded.traceSha,
      digest: plan.binding.traceDigest,
      schema: loaded.trace.schema,
      acquisition: loaded.trace.acquisition,
      samples: loaded.trace.samples.length,
      durationMs: loaded.trace.timebase.durationMs,
    },
    handStyle: {
      path: path.relative(ROOT, loaded.stylePath),
      ref: loaded.style.ref,
      digest: loaded.style.digest,
      rights: loaded.style.rights,
      poses: loaded.style.poses,
      checksumFailures: loaded.styleAssetFailures,
      appearanceSelection: loaded.style.appearanceSelection,
    },
    plan: {
      digest: plan.digest,
      reducedMotionDigest: reducedMotionPlan.digest,
      fallbackDigest: fallbackPlan.digest,
      fallbackReason: fallbackPlan.fallbackReason,
      composition: plan.composition,
      geometry: plan.geometry,
      presenter: plan.presenter,
      safeAreas: plan.safeAreas,
      capturedCursor: plan.capturedCursor,
      measurements: plan.measurements,
    },
    outputs,
    proofFrame: {
      path: path.relative(ROOT, PROOF_FRAME_PATH),
      sha256: sha256(proofBytes),
      frameIndex: tapFrame.index,
      state: tapFrame.state,
      source: path.relative(ROOT, OUTPUTS.cartoonHand),
    },
    measurements: {
      method: 'Ring-colour centroid measured on the rasterized overlay plate that was composited into the encoded video, plus a presence check for the same ring inside the encoded frame. Frames whose marker is clipped by the composition edge cannot be centroid-measured and are excluded from the precision gate.',
      hotspotTolerancePx: 2,
      hotspotSamples,
    },
    review: {
      ...review,
      // Automated gates are not an approval. Publication stays blocked until an
      // owner records a decision through the existing review gates.
      ownerDecision: null,
      publication: 'blocked-pending-owner-review',
      channelPolicy: 'none-configured',
    },
  };
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  await rm(overlayRoot, { recursive: true, force: true });

  console.log(JSON.stringify({
    status: 'rendered',
    filmSkill: FILM_SKILL,
    planDigest: plan.digest,
    treatment: plan.treatment,
    frames: plan.frameCount,
    outputs: outputs.map((output) => ({ path: output.path, bytes: output.bytes, sha256: output.sha256 })),
    maxHotspotErrorPx: hotspotSamples.length
      ? Math.max(...hotspotSamples.map((sample) => sample.errorPx ?? Number.POSITIVE_INFINITY))
      : null,
    automatedReview: evidence.review.automatedStatus,
    unmeasuredGates: evidence.review.unmeasured,
    ownerDecision: evidence.review.ownerDecision,
  }, null, 2));
}

// Reads the rasterized overlay around the expected hotspot and returns the
// centroid of the ring colour. A drifted fingertip shows up here as a
// pixel-space error, not as an assertion about the plan.
async function measureRingCentroid(pngPath, frame, plan) {
  const half = Math.ceil(plan.geometry.ringRadiusPx * 3);
  const window = clampWindow(frame.hotspot, half, plan.composition);
  const raw = await cropRgba(pngPath, window);
  const target = hexToRgb(plan.style.palette.ring);
  let sumX = 0;
  let sumY = 0;
  let pixels = 0;
  for (let index = 0; index < raw.length; index += 4) {
    const alpha = raw[index + 3];
    if (alpha < 200) continue;
    if (
      Math.abs(raw[index] - target.r) > 10
      || Math.abs(raw[index + 1] - target.g) > 10
      || Math.abs(raw[index + 2] - target.b) > 10
    ) continue;
    const offset = index / 4;
    sumX += (offset % window.width) + 0.5;
    sumY += Math.floor(offset / window.width) + 0.5;
    pixels += 1;
  }
  if (pixels === 0) return { centroid: null, errorPx: null, pixels: 0 };
  const centroid = {
    x: round(window.x + (sumX / pixels), 3),
    y: round(window.y + (sumY / pixels), 3),
  };
  return {
    centroid,
    pixels,
    errorPx: round(Math.hypot(centroid.x - frame.hotspot.x, centroid.y - frame.hotspot.y), 3),
  };
}

async function ringPresentInVideoFrame(videoPath, frame, plan) {
  const half = Math.ceil(plan.geometry.ringRadiusPx * 3);
  const window = clampWindow(frame.hotspot, half, plan.composition);
  const raw = await cropRgbaFromVideo(videoPath, frame.index, window);
  const target = hexToRgb(plan.style.palette.ring);
  let pixels = 0;
  for (let index = 0; index < raw.length; index += 4) {
    if (
      Math.abs(raw[index] - target.r) <= 16
      && Math.abs(raw[index + 1] - target.g) <= 16
      && Math.abs(raw[index + 2] - target.b) <= 16
    ) pixels += 1;
  }
  return { pixels, present: pixels > 0 };
}

function clampWindow(hotspot, half, composition) {
  const x = Math.max(0, Math.min(composition.width - 1, Math.round(hotspot.x - half)));
  const y = Math.max(0, Math.min(composition.height - 1, Math.round(hotspot.y - half)));
  return {
    x,
    y,
    width: Math.min(composition.width - x, half * 2),
    height: Math.min(composition.height - y, half * 2),
  };
}

async function cropRgba(pngPath, window) {
  const { stdout } = await execFileAsync(FFMPEG, [
    '-v', 'error', '-i', pngPath,
    '-vf', `crop=${window.width}:${window.height}:${window.x}:${window.y}`,
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-',
  ], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function cropRgbaFromVideo(videoPath, frameIndex, window) {
  const { stdout } = await execFileAsync(FFMPEG, [
    '-v', 'error', '-i', videoPath,
    '-vf', `select=eq(n\\,${frameIndex}),crop=${window.width}:${window.height}:${window.x}:${window.y}`,
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-',
  ], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function extractVideoFrame(videoPath, frameIndex, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await execFileAsync(FFMPEG, [
    '-y', '-v', 'error', '-i', videoPath,
    '-vf', `select=eq(n\\,${frameIndex})`,
    '-frames:v', '1', outputPath,
  ]);
  await stat(outputPath);
}

async function probe(filePath) {
  const { stdout } = await execFileAsync(FFPROBE, [
    '-v', 'error', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', filePath,
  ]);
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.find((entry) => entry.width) ?? {};
  return {
    width: stream.width ?? null,
    height: stream.height ?? null,
    duration: Number(parsed.format?.duration ?? 0),
  };
}

function hexToRgb(hex) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}
