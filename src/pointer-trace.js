import { createHash } from 'node:crypto';

export const POINTER_TRACE_SCHEMA = 'reel-pipeline.pointer-trace.v1';

// A pointer trace is the only accepted source of pointer truth for the
// cartoon-hand treatment. It is deliberately narrow: coordinates, primary
// button state, and a monotonic timebase bound to one approved capture hash.
export const POINTER_ACQUISITION_METHODS = new Set([
  // Pointer coordinates emitted by the deterministic scripted browser runner
  // while the same run captured frames.
  'scripted-browser-runner',
  // Operator-started local helper sampling a calibrated full-screen display.
  'operator-display-helper',
]);

export const POINTER_DISPLAY_SURFACES = new Set([
  'monitor',
  'browser-viewport',
  // Present for completeness; both keep the standard cursor because their
  // coordinate transform to the encoded capture is unproven.
  'window',
  'browser-tab',
]);

export const CALIBRATED_DISPLAY_SURFACES = new Set(['monitor', 'browser-viewport']);

const ALLOWED_SAMPLE_KEYS = new Set(['tMs', 'x', 'y', 'primaryDown', 'inBounds']);

const ALLOWED_TRACE_KEYS = new Set([
  'schema',
  'version',
  'traceId',
  'timebase',
  'capture',
  'acquisition',
  'samples',
]);

// Field names that would turn a pointer sidecar into input surveillance or
// application-content collection. Rejected anywhere in the payload.
const PROHIBITED_KEYS = new Set([
  'key',
  'keys',
  'keycode',
  'keycodes',
  'keystroke',
  'keystrokes',
  'char',
  'chars',
  'text',
  'value',
  'values',
  'clipboard',
  'selector',
  'selectors',
  'dom',
  'dompath',
  'element',
  'elementid',
  'aria',
  'arialabel',
  'window',
  'windowtitle',
  'title',
  'app',
  'appname',
  'application',
  'process',
  'processname',
  'bundleid',
  'url',
  'href',
  'route',
  'screenshot',
  'framedata',
  'ocr',
  'accessibility',
  'input',
  'inputs',
  'content',
]);

const PROHIBITED_KEY_PATTERNS = [
  /^key/i,
  /keystroke/i,
  /keycode/i,
  /selector/i,
  /clipboard/i,
  /screenshot/i,
  /accessibility/i,
  /(text|title|url|href|content)$/i,
];

export function normalizePointerTrace(input) {
  const trace = requiredObject(input, 'pointerTrace');
  if (trace.schema !== POINTER_TRACE_SCHEMA) {
    throw new Error(`pointer trace schema must be ${POINTER_TRACE_SCHEMA}`);
  }
  if (trace.version !== 1) throw new Error('pointer trace version must be 1');
  assertNoProhibitedFields(trace, 'pointerTrace');
  assertOnlyKeys(trace, ALLOWED_TRACE_KEYS, 'pointerTrace');

  const traceId = requiredString(trace.traceId, 'pointerTrace.traceId');
  const timebase = requiredObject(trace.timebase, 'pointerTrace.timebase');
  if (timebase.unit !== 'milliseconds') {
    throw new Error('pointerTrace.timebase.unit must be milliseconds');
  }
  if (timebase.monotonic !== true) {
    throw new Error('pointerTrace.timebase.monotonic must be true');
  }
  const startedAtMs = requiredNumber(timebase.startedAtMs, 'pointerTrace.timebase.startedAtMs');
  if (startedAtMs !== 0) {
    throw new Error('pointerTrace.timebase.startedAtMs must be 0 relative to the capture start');
  }
  const durationMs = requiredNumber(timebase.durationMs, 'pointerTrace.timebase.durationMs');
  if (durationMs <= 0) throw new Error('pointerTrace.timebase.durationMs must be positive');

  const capture = requiredObject(trace.capture, 'pointerTrace.capture');
  const width = requiredInteger(capture.width, 'pointerTrace.capture.width');
  const height = requiredInteger(capture.height, 'pointerTrace.capture.height');
  if (width < 16 || height < 16) throw new Error('pointerTrace.capture dimensions are implausible');
  const fps = requiredNumber(capture.fps, 'pointerTrace.capture.fps');
  if (fps <= 0 || fps > 240) throw new Error('pointerTrace.capture.fps is out of range');
  const sourceSha256 = requiredSha256(capture.sha256, 'pointerTrace.capture.sha256');
  const durationToleranceMs = capture.durationMs === undefined
    ? null
    : requiredNumber(capture.durationMs, 'pointerTrace.capture.durationMs');

  const acquisition = requiredObject(trace.acquisition, 'pointerTrace.acquisition');
  const method = requiredString(acquisition.method, 'pointerTrace.acquisition.method');
  if (!POINTER_ACQUISITION_METHODS.has(method)) {
    throw new Error(`unsupported pointer acquisition method: ${method}`);
  }
  const displaySurface = requiredString(
    acquisition.displaySurface,
    'pointerTrace.acquisition.displaySurface',
  );
  if (!POINTER_DISPLAY_SURFACES.has(displaySurface)) {
    throw new Error(`unsupported pointer display surface: ${displaySurface}`);
  }
  const calibration = requiredObject(acquisition.calibration, 'pointerTrace.acquisition.calibration');
  const calibrationMethod = requiredString(
    calibration.method,
    'pointerTrace.acquisition.calibration.method',
  );
  const calibrationEvidence = requiredString(
    calibration.evidence,
    'pointerTrace.acquisition.calibration.evidence',
  );
  const calibrationViewport = requiredObject(
    calibration.viewport,
    'pointerTrace.acquisition.calibration.viewport',
  );
  const viewportWidth = requiredInteger(
    calibrationViewport.width,
    'pointerTrace.acquisition.calibration.viewport.width',
  );
  const viewportHeight = requiredInteger(
    calibrationViewport.height,
    'pointerTrace.acquisition.calibration.viewport.height',
  );
  const deviceScaleFactor = requiredNumber(
    calibrationViewport.deviceScaleFactor,
    'pointerTrace.acquisition.calibration.viewport.deviceScaleFactor',
  );
  const capturedCursor = requiredObject(
    acquisition.capturedCursor,
    'pointerTrace.acquisition.capturedCursor',
  );
  if (typeof capturedCursor.present !== 'boolean') {
    throw new Error('pointerTrace.acquisition.capturedCursor.present must be a boolean');
  }
  const capturedCursorReason = requiredString(
    capturedCursor.reason,
    'pointerTrace.acquisition.capturedCursor.reason',
  );
  const capturedCursorSizePx = capturedCursor.present
    ? requiredNumber(capturedCursor.sizePx, 'pointerTrace.acquisition.capturedCursor.sizePx')
    : null;

  const samples = requiredArray(trace.samples, 'pointerTrace.samples').map(normalizeSample);
  if (samples.length < 2) throw new Error('pointerTrace.samples must contain at least two samples');
  let previous = -1;
  for (const [index, sample] of samples.entries()) {
    if (sample.tMs <= previous) {
      throw new Error(`pointerTrace.samples[${index}].tMs must increase monotonically`);
    }
    previous = sample.tMs;
    if (sample.tMs > durationMs) {
      throw new Error(`pointerTrace.samples[${index}].tMs exceeds the declared duration`);
    }
    if (sample.inBounds && (sample.x < 0 || sample.x > 1 || sample.y < 0 || sample.y > 1)) {
      throw new Error(`pointerTrace.samples[${index}] is marked in-bounds but is outside the capture`);
    }
  }

  return Object.freeze({
    schema: POINTER_TRACE_SCHEMA,
    version: 1,
    traceId,
    timebase: { unit: 'milliseconds', startedAtMs, durationMs, monotonic: true },
    capture: {
      width,
      height,
      fps,
      sha256: sourceSha256,
      ...(durationToleranceMs === null ? {} : { durationMs: durationToleranceMs }),
    },
    acquisition: {
      method,
      displaySurface,
      coordinateMapping: CALIBRATED_DISPLAY_SURFACES.has(displaySurface) ? 'calibrated' : 'unproven',
      calibration: {
        method: calibrationMethod,
        evidence: calibrationEvidence,
        viewport: { width: viewportWidth, height: viewportHeight, deviceScaleFactor },
      },
      capturedCursor: {
        present: capturedCursor.present,
        reason: capturedCursorReason,
        ...(capturedCursorSizePx === null ? {} : { sizePx: capturedCursorSizePx }),
      },
    },
    samples: Object.freeze(samples.map((sample) => Object.freeze(sample))),
  });
}

// Canonical hash of the sidecar content. The file hash is recorded separately;
// this digest keeps preview and final render comparisons independent of
// formatting.
export function pointerTraceDigest(trace) {
  return sha256Hex(stableJson(normalizePointerTrace(trace)));
}

export function pointerTraceFileDigest(bytes) {
  return sha256Hex(bytes);
}

// Binds a trace to the approved capture record. Never throws for an
// untrustworthy trace: the caller must be able to fall back to the standard
// cursor and record why.
export function evaluatePointerTraceBinding(input) {
  const trace = normalizePointerTrace(input.trace);
  const capture = requiredObject(input.capture, 'capture');
  const failures = [];

  const captureSha256 = typeof capture.sha256 === 'string' ? capture.sha256.toLowerCase() : null;
  if (!captureSha256 || captureSha256 !== trace.capture.sha256) {
    failures.push({
      code: 'trace-source-binding-mismatch',
      detail: 'the pointer trace is not bound to the approved capture hash',
    });
  }
  if (input.traceSha256 !== undefined) {
    const declared = requiredSha256(input.traceSha256, 'traceSha256');
    const approved = typeof capture.pointerTrace?.sha256 === 'string'
      ? capture.pointerTrace.sha256.toLowerCase()
      : null;
    if (approved && approved !== declared) {
      failures.push({
        code: 'trace-integrity-failure',
        detail: 'the pointer trace hash differs from the approved capture record',
      });
    }
  }
  if (trace.acquisition.coordinateMapping !== 'calibrated') {
    failures.push({
      code: 'unsupported-source-mapping',
      detail: `${trace.acquisition.displaySurface} capture has no proven pointer coordinate mapping`,
    });
  }
  const captureDurationMs = Number(capture.durationMs);
  if (Number.isFinite(captureDurationMs) && captureDurationMs > 0) {
    const toleranceMs = Number(input.durationToleranceMs ?? 120);
    if (Math.abs(captureDurationMs - trace.timebase.durationMs) > toleranceMs) {
      failures.push({
        code: 'trace-synchronization-failure',
        detail: `trace duration ${trace.timebase.durationMs}ms is outside ${toleranceMs}ms of the capture`,
      });
    }
  }
  const captureWidth = Number(capture.width);
  const captureHeight = Number(capture.height);
  if (
    Number.isFinite(captureWidth) && Number.isFinite(captureHeight)
    && (captureWidth !== trace.capture.width || captureHeight !== trace.capture.height)
  ) {
    failures.push({
      code: 'trace-dimension-mismatch',
      detail: 'trace capture dimensions differ from the approved capture',
    });
  }

  return {
    eligible: failures.length === 0,
    failures,
    binding: {
      sourceSha256: trace.capture.sha256,
      traceDigest: pointerTraceDigest(trace),
      ...(input.traceSha256 === undefined
        ? {}
        : { traceSha256: String(input.traceSha256).toLowerCase() }),
      durationMs: trace.timebase.durationMs,
      width: trace.capture.width,
      height: trace.capture.height,
      acquisitionMethod: trace.acquisition.method,
      displaySurface: trace.acquisition.displaySurface,
    },
  };
}

// Linear interpolation for position, step interpolation for button state:
// a button transition is a fact at a time, not a value to average.
export function samplePointerTrace(trace, timeMs) {
  const normalized = Object.isFrozen(trace) && trace.schema === POINTER_TRACE_SCHEMA
    ? trace
    : normalizePointerTrace(trace);
  const samples = normalized.samples;
  const time = Number(timeMs);
  if (!Number.isFinite(time)) throw new Error('timeMs must be a finite number');
  if (time <= samples[0].tMs) return { ...samples[0], interpolated: false };
  const last = samples[samples.length - 1];
  if (time >= last.tMs) return { ...last, interpolated: false };

  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (samples[mid].tMs <= time) low = mid;
    else high = mid;
  }
  const before = samples[low];
  const after = samples[high];
  const span = after.tMs - before.tMs;
  const ratio = span === 0 ? 0 : (time - before.tMs) / span;
  const crossesBounds = before.inBounds !== after.inBounds;
  return {
    tMs: time,
    x: crossesBounds ? before.x : before.x + ((after.x - before.x) * ratio),
    y: crossesBounds ? before.y : before.y + ((after.y - before.y) * ratio),
    primaryDown: before.primaryDown,
    inBounds: before.inBounds,
    interpolated: true,
  };
}

function normalizeSample(input, index) {
  const label = `pointerTrace.samples[${index}]`;
  const sample = requiredObject(input, label);
  assertNoProhibitedFields(sample, label);
  assertOnlyKeys(sample, ALLOWED_SAMPLE_KEYS, label);
  const tMs = requiredNumber(sample.tMs, `${label}.tMs`);
  if (tMs < 0) throw new Error(`${label}.tMs must not be negative`);
  if (typeof sample.primaryDown !== 'boolean') {
    throw new Error(`${label}.primaryDown must be a boolean`);
  }
  if (typeof sample.inBounds !== 'boolean') {
    throw new Error(`${label}.inBounds must be a boolean`);
  }
  return {
    tMs,
    x: requiredNumber(sample.x, `${label}.x`),
    y: requiredNumber(sample.y, `${label}.y`),
    primaryDown: sample.primaryDown,
    inBounds: sample.inBounds,
  };
}

function assertNoProhibitedFields(value, label) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoProhibitedFields(entry, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (isProhibitedKey(key)) {
      throw new Error(`pointer trace must not contain input or application content: ${label}.${key}`);
    }
    assertNoProhibitedFields(entry, `${label}.${key}`);
  }
}

function isProhibitedKey(key) {
  if (PROHIBITED_KEYS.has(key.toLowerCase())) return true;
  return PROHIBITED_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function assertOnlyKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} has an unrecognized field: ${key}`);
    }
  }
}

export function stableJson(value) {
  return JSON.stringify(sortObject(value));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
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

function requiredArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must not be empty`);
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

function requiredSha256(value, label) {
  const text = requiredString(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) throw new Error(`${label} must be a 64-character sha256 hash`);
  return text;
}
