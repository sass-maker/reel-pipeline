#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, statfsSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SOURCE = Object.freeze({
  repository: 'https://github.com/ace-step/ACE-Step-1.5.git',
  tag: 'v0.1.8',
  commit: 'dce621408bee8c31b4fcf4811682eb9359e1bc94',
  license: 'MIT',
  licenseUrl: 'https://raw.githubusercontent.com/ace-step/ACE-Step-1.5/dce621408bee8c31b4fcf4811682eb9359e1bc94/LICENSE',
  normalizedLicenseSha256: 'a929229929fb11283d6fe036b69340fde61f2390a9a85c3d78193a6d4bbcaafc',
  modelRepository: 'https://huggingface.co/ACE-Step/Ace-Step1.5',
  modelRevision: '19671f406d603126926c1b7e2adc169acbcade22',
  verifiedCoreModelBytes: 10_079_024_720,
});

const checks = [];
check('Apple Silicon host', process.arch === 'arm64', process.arch);
check('At least 16 GB unified memory', os.totalmem() >= 16 * 1024 ** 3, `${Math.round(os.totalmem() / 1024 ** 3)} GB`);
const disk = statfsSync(process.cwd());
const freeBytes = Number(disk.bavail) * Number(disk.bsize);
check('At least 20 GB free for isolated runtime and core weights', freeBytes >= 20 * 1024 ** 3, `${Math.round(freeBytes / 1024 ** 3)} GB free`);

const uvVersion = command('uv', ['--version']);
check('uv is already installed', uvVersion.ok, uvVersion.output);
const python = command('uv', ['python', 'find', '3.12']);
check('Python 3.12 is already available', python.ok, python.output);
const remote = command('git', ['ls-remote', SOURCE.repository, `refs/tags/${SOURCE.tag}`]);
check('Pinned official source tag resolves', remote.ok && remote.output.startsWith(SOURCE.commit), remote.output);
const license = command('curl', ['-fsSL', SOURCE.licenseUrl]);
const licenseHash = license.ok ? createHash('sha256').update(license.output).digest('hex') : null;
check('Pinned source license is MIT and unchanged', license.ok && licenseHash === SOURCE.normalizedLicenseSha256, licenseHash ?? license.output);

const ready = checks.every((entry) => entry.pass);
const receipt = {
  schema: 'fleet.ace-step-preflight.v1',
  checkedAt: new Date().toISOString(),
  readyForIsolatedRuntimeInstall: ready,
  source: SOURCE,
  host: {
    architecture: process.arch,
    platform: process.platform,
    unifiedMemoryBytes: os.totalmem(),
    freeBytes,
    uv: uvVersion.output,
    python: python.output,
  },
  checks,
  actions: {
    sourceCloned: false,
    dependenciesInstalled: false,
    modelWeightsDownloaded: false,
    serverStarted: false,
  },
  boundary: ready
    ? 'Host and pinned official source are compatible. Stop before isolated runtime install and approximately 10 GB core-model download.'
    : 'Do not install ACE-Step on this host until every preflight check passes.',
};

if (process.argv.includes('--receipt')) {
  const receiptPath = path.resolve('artifacts/runtime-preflight/ace-step-1.5.json');
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
if (!ready) process.exitCode = 1;

function check(label, pass, evidence) {
  checks.push({ label, pass, evidence: String(evidence ?? '').trim().slice(0, 500) });
}

function command(binary, args) {
  try {
    return { ok: true, output: execFileSync(binary, args, { encoding: 'utf8', timeout: 30_000 }).trim() };
  } catch (error) {
    return { ok: false, output: String(error.stderr || error.message || error).trim().slice(0, 500) };
  }
}
