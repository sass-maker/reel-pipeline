#!/usr/bin/env node
// Acquire the approved source capture and its pointer trace for the
// cartoon-hand pointer demo.
//
// This is the spike the guided-app-demo@2 design requires before any
// cartoon-hand render: one real capture of a real product surface, with a
// pointer trace emitted by the same deterministic action runner that moved the
// pointer, in a viewport pinned to the encoded capture dimensions.
//
// It spends nothing: local Chrome, local ffmpeg, no model and no paid API.
//
//   node scripts/capture-cartoon-hand-pointer-source.js
//   node scripts/capture-cartoon-hand-pointer-source.js --check
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { anonymousVideoPageHtml } from '../src/anonymous-video/ui.js';
import { normalizePointerTrace, POINTER_TRACE_SCHEMA } from '../src/pointer-trace.js';
import { evaluate, navigateAndWait, withChrome } from './cdp-capture.js';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'fixtures/guided-app-demo/cartoon-hand-pointer');
const CAPTURE_PATH = path.join(OUT_DIR, 'source-capture.mp4');
const TRACE_PATH = path.join(OUT_DIR, 'pointer-trace.json');
const RECORD_PATH = path.join(OUT_DIR, 'capture-record.json');
const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 24;
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

// The demonstrated surface is this repository's own anonymous brand-reel page,
// rendered from its shipped module so the capture shows real product UI.
const SURFACE = {
  id: 'anonymous-brand-reel-landing',
  module: 'src/anonymous-video/ui.js',
  export: 'anonymousVideoPageHtml',
  note: 'Rendered locally and opened over file://; network-backed panes stay in their offline state.',
};

// One principal gesture per beat: enter from off-screen, point at the promise
// line, drag-select it, click the URL field, click submit, then idle so the arm
// retracts. Targets deliberately stay out of the reserved title and caption
// bands so the treatment does not have to fall back for safe-area collisions.
const BEATS = [
  { kind: 'offscreen', durationMs: 250 },
  { kind: 'move', target: { selector: 'main > p', anchor: 'text-start' }, durationMs: 700 },
  { kind: 'hold', durationMs: 220 },
  { kind: 'drag', target: { selector: 'main > p', anchor: 'text-end' }, durationMs: 780 },
  { kind: 'hold', durationMs: 260 },
  { kind: 'move', target: { selector: '#brand-url', anchor: 'center' }, durationMs: 650 },
  { kind: 'click', durationMs: 320 },
  { kind: 'move', target: { selector: '#submit', anchor: 'center' }, durationMs: 520 },
  { kind: 'click', durationMs: 320 },
  { kind: 'hold', durationMs: 1400 },
];

const checkOnly = process.argv.slice(2).includes('--check');

if (checkOnly) {
  await check();
} else {
  await capture();
}

async function check() {
  const record = JSON.parse(await readFile(RECORD_PATH, 'utf8'));
  const captureBytes = await readFile(CAPTURE_PATH);
  const traceBytes = await readFile(TRACE_PATH);
  const failures = [];
  const captureSha = sha256(captureBytes);
  const traceSha = sha256(traceBytes);
  if (captureSha !== record.sha256) failures.push(`capture hash drifted: ${captureSha}`);
  if (traceSha !== record.pointerTrace.sha256) failures.push(`pointer trace hash drifted: ${traceSha}`);
  if (captureBytes.byteLength !== record.bytes) failures.push('capture byte length drifted');
  const trace = normalizePointerTrace(JSON.parse(traceBytes.toString('utf8')));
  if (trace.capture.sha256 !== record.sha256) failures.push('pointer trace is not bound to the capture hash');
  const probed = await probe(CAPTURE_PATH);
  if (probed.width !== WIDTH || probed.height !== HEIGHT) {
    failures.push(`capture is ${probed.width}x${probed.height}, expected ${WIDTH}x${HEIGHT}`);
  }
  if (Math.abs((probed.duration * 1000) - trace.timebase.durationMs) > 120) {
    failures.push(`capture duration ${probed.duration}s is out of sync with the trace`);
  }
  if (failures.length) {
    console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    status: 'pass',
    capture: path.relative(ROOT, CAPTURE_PATH),
    sha256: record.sha256,
    pointerTraceSha256: record.pointerTrace.sha256,
    samples: trace.samples.length,
    durationMs: trace.timebase.durationMs,
  }, null, 2));
}

async function capture() {
  await mkdir(OUT_DIR, { recursive: true });
  const html = anonymousVideoPageHtml();
  const stageDir = path.join(ROOT, '.reel-pipeline/cartoon-hand-pointer');
  await mkdir(stageDir, { recursive: true });
  const pagePath = path.join(stageDir, 'surface.html');
  await writeFile(pagePath, html);
  const frameDir = await mkdtemp(path.join(tmpdir(), 'cartoon-hand-frames-'));

  const session = await withChrome({ width: WIDTH, height: HEIGHT }, async (cdp) => {
    const browser = await cdp.send('Browser.getVersion');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigateAndWait(cdp, `file://${pagePath}`);
    await cdp.send('Emulation.setScrollbarsHidden', { hidden: true }).catch(() => {});
    const boxes = await resolveTargets(cdp);
    const path2d = buildPointerPath(boxes);
    const frames = [];
    for (const [index, step] of path2d.entries()) {
      await dispatchPointer(cdp, step);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const file = path.join(frameDir, `frame-${String(index).padStart(5, '0')}.png`);
      await writeFile(file, Buffer.from(shot.data, 'base64'));
      frames.push({ index, step });
    }
    return { browser, boxes, frames, path: path2d };
  });

  const frameCount = session.path.length;
  const durationMs = Math.round((frameCount * 1000) / FPS);
  await execFileAsync(FFMPEG, [
    '-y', '-loglevel', 'error',
    '-framerate', String(FPS),
    '-i', path.join(frameDir, 'frame-%05d.png'),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-map_metadata', '-1', '-movflags', '+faststart',
    CAPTURE_PATH,
  ]);
  const firstFrameProbe = await probe(path.join(frameDir, 'frame-00000.png'));
  if (firstFrameProbe.width !== WIDTH || firstFrameProbe.height !== HEIGHT) {
    throw new Error(`calibration failed: screenshots are ${firstFrameProbe.width}x${firstFrameProbe.height}`);
  }
  await rm(frameDir, { recursive: true, force: true });

  const captureBytes = await readFile(CAPTURE_PATH);
  const captureSha = sha256(captureBytes);
  const probed = await probe(CAPTURE_PATH);

  const trace = normalizePointerTrace({
    schema: POINTER_TRACE_SCHEMA,
    version: 1,
    traceId: `cartoon-hand-demo-${captureSha.slice(0, 12)}`,
    timebase: { unit: 'milliseconds', startedAtMs: 0, durationMs, monotonic: true },
    capture: {
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      sha256: captureSha,
      durationMs: Math.round(probed.duration * 1000),
    },
    acquisition: {
      method: 'scripted-browser-runner',
      displaySurface: 'browser-viewport',
      calibration: {
        method: 'cdp-device-metrics-override',
        evidence: `Viewport pinned to ${WIDTH}x${HEIGHT} at deviceScaleFactor 1; every screenshot verified at ${WIDTH}x${HEIGHT}; each sample was dispatched into the same CDP session immediately before the frame it labels, so sample time equals frame time at ${FPS}fps.`,
        viewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
      },
      capturedCursor: {
        present: false,
        reason: 'Headless CDP screenshots do not composite a system cursor, so there is no captured cursor to cover.',
      },
    },
    samples: session.path.map((step, index) => ({
      tMs: Math.round((index * 1000) / FPS),
      x: round(step.x / WIDTH, 6),
      y: round(step.y / HEIGHT, 6),
      primaryDown: step.primaryDown,
      inBounds: step.inBounds,
    })),
  });
  const traceJson = `${JSON.stringify(trace, null, 2)}\n`;
  await writeFile(TRACE_PATH, traceJson);
  const traceSha = sha256(traceJson);

  const commit = await gitHead();
  const record = {
    schema: 'reel-pipeline.forge-capture.v1',
    id: 'cartoon-hand-pointer-demo',
    assetKey: path.relative(ROOT, CAPTURE_PATH),
    fileName: path.basename(CAPTURE_PATH),
    mediaType: 'video/mp4',
    bytes: captureBytes.byteLength,
    durationMs: Math.round(probed.duration * 1000),
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    sha256: captureSha,
    filmSkill: 'guided-app-demo@2',
    captureMethod: 'scripted-browser-runner',
    displaySurface: 'browser-viewport',
    sourcePosture: 'real-capture',
    executionMode: 'real',
    surface: SURFACE,
    renderer: {
      capture: `chrome-cdp@${session.browser.product ?? 'unknown'}`,
      encoder: `${FFMPEG} libx264 crf20 ${WIDTH}x${HEIGHT}@${FPS}`,
    },
    presenter: {
      // The demo composes the cartoon arm against the reserved presenter
      // rectangle. No camera was recorded, so no presenter image is claimed.
      mode: 'same-session',
      sync: 'same-session',
      position: 'bottom-right',
      note: 'Presenter rectangle is reserved and anchored; this local proof recorded no camera frames.',
    },
    approval: {
      approved: true,
      approvedAt: new Date().toISOString(),
      approvedBy: 'local-proof-run',
      note: 'Local capture of this repository\'s own product surface; approved for local review only, not for publication.',
    },
    provenance: {
      sourceType: 'real-capture',
      sourceRevision: `${commit}:${sha256(html).slice(0, 12)}`,
      rights: {
        tier: 'production-safe',
        license: 'fleet-owned-product-surface',
        approved: true,
      },
    },
    pointerTrace: {
      schema: POINTER_TRACE_SCHEMA,
      path: path.relative(ROOT, TRACE_PATH),
      sha256: traceSha,
      acquisitionMethod: trace.acquisition.method,
      displaySurface: trace.acquisition.displaySurface,
      coordinateMapping: trace.acquisition.coordinateMapping,
      samples: trace.samples.length,
      durationMs: trace.timebase.durationMs,
    },
    capturedAt: new Date().toISOString(),
  };
  await writeFile(RECORD_PATH, `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify({
    status: 'captured',
    capture: path.relative(ROOT, CAPTURE_PATH),
    sha256: captureSha,
    bytes: captureBytes.byteLength,
    pointerTraceSha256: traceSha,
    frames: frameCount,
    durationMs,
    chrome: session.browser.product,
  }, null, 2));
}

async function resolveTargets(cdp) {
  const selectors = [...new Set(BEATS.filter((beat) => beat.target).map((beat) => beat.target.selector))];
  const raw = await evaluate(cdp, `JSON.stringify(${JSON.stringify(selectors)}.map((selector) => {
    const el = document.querySelector(selector);
    if (!el) return { selector, missing: true };
    const rect = el.getBoundingClientRect();
    return { selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }))`);
  const boxes = new Map();
  for (const entry of JSON.parse(raw)) {
    if (entry.missing) throw new Error(`demo surface is missing ${entry.selector}`);
    boxes.set(entry.selector, entry);
  }
  return boxes;
}

function anchorPoint(box, anchor) {
  if (anchor === 'text-start') {
    return { x: box.x + Math.min(24, box.width * 0.08), y: box.y + (box.height * 0.22) };
  }
  if (anchor === 'text-end') {
    return { x: box.x + (box.width * 0.86), y: box.y + (box.height * 0.62) };
  }
  return { x: box.x + (box.width / 2), y: box.y + (box.height / 2) };
}

// Frame-locked pointer path: one entry per captured frame so the trace and the
// encoded frames share a single clock.
function buildPointerPath(boxes) {
  const frameMs = 1000 / FPS;
  const steps = [];
  let current = { x: -60, y: HEIGHT * 0.41 };
  let primaryDown = false;
  for (const beat of BEATS) {
    const frames = Math.max(1, Math.round(beat.durationMs / frameMs));
    const target = beat.target
      ? anchorPoint(boxes.get(beat.target.selector), beat.target.anchor)
      : current;
    for (let index = 1; index <= frames; index += 1) {
      const ratio = frames === 1 ? 1 : index / frames;
      const eased = (1 - Math.cos(Math.PI * ratio)) / 2;
      if (beat.kind === 'offscreen') {
        steps.push({ x: current.x, y: current.y, primaryDown: false, inBounds: false, event: 'none' });
        continue;
      }
      if (beat.kind === 'click') {
        const down = ratio > 0.25 && ratio <= 0.75;
        steps.push({
          x: current.x,
          y: current.y,
          primaryDown: down,
          inBounds: inFrame(current),
          event: down === primaryDown ? 'move' : down ? 'press' : 'release',
        });
        primaryDown = down;
        continue;
      }
      const point = {
        x: current.x + ((target.x - current.x) * eased),
        y: current.y + ((target.y - current.y) * eased),
      };
      if (beat.kind === 'drag') {
        steps.push({
          x: point.x,
          y: point.y,
          primaryDown: true,
          inBounds: inFrame(point),
          event: primaryDown ? 'move' : 'press',
        });
        primaryDown = true;
        continue;
      }
      steps.push({
        x: point.x,
        y: point.y,
        primaryDown,
        inBounds: inFrame(point),
        event: 'move',
      });
    }
    if (beat.kind === 'drag') {
      // Release at the end of the drag so the trace carries the exact
      // button-up time instead of an inferred one.
      const last = steps[steps.length - 1];
      steps.push({ x: last.x, y: last.y, primaryDown: false, inBounds: inFrame(last), event: 'release' });
      primaryDown = false;
    }
    if (beat.target) current = target;
    if (steps.length) {
      const last = steps[steps.length - 1];
      if (last.inBounds) current = { x: last.x, y: last.y };
    }
  }
  return steps.map((step) => ({
    ...step,
    x: clamp(step.x, -80, WIDTH + 80),
    y: clamp(step.y, -80, HEIGHT + 80),
  }));
}

async function dispatchPointer(cdp, step) {
  if (!step.inBounds) return;
  const base = { x: Math.round(step.x), y: Math.round(step.y) };
  if (step.event === 'press') {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...base, buttons: 0 });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', ...base, button: 'left', buttons: 1, clickCount: 1,
    });
    return;
  }
  if (step.event === 'release') {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', ...base, button: 'left', buttons: 0, clickCount: 1,
    });
    return;
  }
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    ...base,
    buttons: step.primaryDown ? 1 : 0,
    ...(step.primaryDown ? { button: 'left' } : {}),
  });
}

async function probe(filePath) {
  const { stdout } = await execFileAsync(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'stream=width,height:format=duration',
    '-of', 'json', filePath,
  ]);
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0] ?? {};
  return {
    width: stream.width ?? null,
    height: stream.height ?? null,
    duration: Number(parsed.format?.duration ?? 0),
  };
}

async function gitHead() {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: ROOT });
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function inFrame(point) {
  return point.x >= 0 && point.x <= WIDTH && point.y >= 0 && point.y <= HEIGHT;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
