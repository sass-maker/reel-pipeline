#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const FIXTURE = 'test/fixtures/render-mode-brief.json';
const MODE_MATRIX = 'config/render-modes.json';
const REPORT_PATH = process.env.RENDER_MODE_SMOKE_REPORT ?? 'tmp/render-mode-smoke/report.json';
const GROK_ASSET_DIR = 'tmp/render-mode-smoke/grok-assets';
const GROK_ASSET = path.join(GROK_ASSET_DIR, 'smoke-grok-imagine.mp4');
const DEFAULT_COMMAND_TIMEOUT_MS = parsePositiveInt(process.env.RENDER_MODE_SMOKE_TIMEOUT_MS, 10 * 60 * 1000);

if (isMain()) {
  main();
}

function main() {
  const matrix = JSON.parse(readFileSync(MODE_MATRIX, 'utf8'));
  const checks = matrix.modes.map(runModeSmoke);
  const report = buildReport({ matrix, checks });
  writeReport(REPORT_PATH, report);

  let failed = false;
  for (const check of checks) {
    if (check.status === 'fail') failed = true;
    const detail = check.detail ? `: ${check.detail}` : '';
    console.log(`${check.status} ${check.name}${detail}`);
    if (check.hint) console.log(`  ${check.hint}`);
  }

  console.log(`report ${REPORT_PATH}`);

  if (failed) process.exit(1);
}

export function buildReport({ matrix, checks, now = new Date() }) {
  const summary = checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] ?? 0) + 1;
    return acc;
  }, {});
  return {
    schema: 'reel-pipeline.render-mode-smoke.v1',
    generatedAt: now.toISOString(),
    matrixSchema: matrix.$schema ?? null,
    matrixPath: MODE_MATRIX,
    summary,
    checks: checks.map((check) => ({
      name: check.name,
      status: check.status,
      detail: check.detail ?? null,
      hint: check.hint ?? null,
    })),
  };
}

function writeReport(reportPath, payload) {
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

export function runModeSmoke(mode) {
  const smoke = mode.smoke ?? {};
  if (smoke.type === 'renderFixture') {
    return runRenderFixture(mode.id, {
      env: smoke.env,
      note: smoke.note,
      expectedProvider: mode.provider,
      timeoutMs: smoke.timeoutMs,
    });
  }
  if (smoke.type === 'grokFixture') {
    return runGrokVideoSmoke(mode);
  }
  if (smoke.type === 'service') {
    const base = (process.env[smoke.urlEnv] ?? smoke.defaultUrl ?? '').replace(/\/$/, '');
    return optionalServiceCheck({
      name: mode.id,
      url: `${base}${smoke.path ?? ''}`,
      hint: smoke.hint,
    });
  }
  if (smoke.type === 'command') {
    return optionalCommandCheck({
      name: mode.id,
      command: smoke.command,
      args: smoke.args ?? [],
      hint: smoke.hint,
      timeoutMs: smoke.timeoutMs,
    });
  }
  return {
    name: mode.id,
    status: 'fail',
    detail: `unsupported smoke type: ${smoke.type ?? 'none'}`,
  };
}

function runRenderFixture(mode, options = {}) {
  const timeoutMs = commandTimeoutMs(options);
  const env = { ...process.env, ...(options.env ?? {}) };
  const result = spawnSync('npm', [
    'run',
    'render:fixture',
    '--',
    '--fixture',
    FIXTURE,
    '--mode',
    mode,
    '--limit',
    '1',
  ], {
    encoding: 'utf8',
    env,
    maxBuffer: 1024 * 1024 * 20,
    timeout: timeoutMs,
  });
  if (result.status !== 0) {
    return {
      name: mode,
      status: 'fail',
      detail: commandFailureDetail(result, timeoutMs),
      hint: options.note,
    };
  }
  const payload = parseLastJson(result.stdout);
  const provider = payload?.results?.[0]?.provider ?? 'unknown';
  const status = payload?.results?.[0]?.status ?? 'unknown';
  const manifestPath = payload?.results?.[0]?.artifact_manifest_path ?? null;
  if (options.expectedProvider && provider !== options.expectedProvider) {
    return {
      name: mode,
      status: 'fail',
      detail: `expected provider=${options.expectedProvider}, got ${provider}`,
      hint: options.note,
    };
  }
  if (status === 'completed' && !manifestPath) {
    return {
      name: mode,
      status: 'fail',
      detail: `provider=${provider} completed without Content Factory manifest`,
      hint: options.note,
    };
  }
  return {
    name: mode,
    status: 'ok',
    detail: `provider=${provider} status=${status} manifest=${manifestPath ?? 'pending'}`,
    hint: options.note,
  };
}

function runGrokVideoSmoke(mode) {
  mkdirSync(GROK_ASSET_DIR, { recursive: true });
  const makeAsset = spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=black:s=360x640:d=1',
    '-an',
    GROK_ASSET,
  ], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 5,
    timeout: 30_000,
  });
  if (makeAsset.status !== 0) {
    return {
      name: 'grok-video',
      status: 'fail',
      detail: lastUsefulLine(makeAsset),
      hint: 'ffmpeg is required to create the temporary local MP4 fixture.',
    };
  }
  return runRenderFixture(mode.id, {
    env: { GROK_VIDEO_ASSET_DIR: GROK_ASSET_DIR },
    expectedProvider: mode.provider,
  });
}

function optionalCommandCheck({ name, command, args, hint, timeoutMs: configuredTimeoutMs }) {
  const timeoutMs = commandTimeoutMs({ timeoutMs: configuredTimeoutMs });
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: timeoutMs,
  });
  if (result.status !== 0) {
    return {
      name,
      status: 'skip',
      detail: commandFailureDetail(result, timeoutMs),
      hint,
    };
  }
  return { name, status: 'check', detail: `${command} ${args.join(' ')}`, hint };
}

function optionalServiceCheck({ name, url, hint }) {
  const result = spawnSync(process.execPath, [
    '-e',
    `fetch(${JSON.stringify(url)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`,
  ], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (result.status !== 0) {
    return { name, status: 'skip', detail: `not reachable at ${url}`, hint };
  }
  return { name, status: 'check', detail: `reachable at ${url}`, hint };
}

function parseLastJson(stdout) {
  const start = stdout.lastIndexOf('\n{');
  const raw = start >= 0 ? stdout.slice(start + 1) : stdout;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function lastUsefulLine(result) {
  return [result.stderr, result.stdout]
    .filter(Boolean)
    .join('\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-1)[0] ?? `exit ${result.status}`;
}

function commandFailureDetail(result, timeoutMs) {
  if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM') {
    return `timed out after ${timeoutMs}ms`;
  }
  return lastUsefulLine(result);
}

function commandTimeoutMs(config) {
  return parsePositiveInt(config.timeoutMs, DEFAULT_COMMAND_TIMEOUT_MS);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
