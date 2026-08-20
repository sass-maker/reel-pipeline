#!/usr/bin/env node
/**
 * Compare Rust vs JS watcher candidate selection against the live worker.
 *
 * Fetches approved reels, applies the JS `needsRender` filter, then runs the
 * Rust watcher in dry-run once and checks the reel id sets match.
 *
 * Usage:
 *   node scripts/validate-watcher-parity.mjs
 *   REEL_WORKER_URL=https://... node scripts/validate-watcher-parity.mjs
 *
 * Exit 0 when parity holds (including both empty). Exit 1 on mismatch or fetch error.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { reelWorkerHeaders } from '../src/reel-worker-auth.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerUrl = (process.env.REEL_WORKER_URL ?? 'https://reel-pipeline-artifacts.sarthakagrawal927.workers.dev').replace(/\/$/, '');
const workerHeaders = reelWorkerHeaders();

const jsCandidates = await fetchJsCandidates(workerUrl);
const rustCandidates = runRustDryRun(repoRoot);

const jsIds = jsCandidates.map((r) => r.id).sort();
const rustIds = rustCandidates.sort();

console.log(`▸ worker: ${workerUrl}`);
console.log(`▸ JS candidates (${jsIds.length}): ${jsIds.join(', ') || '(none)'}`);
console.log(`▸ Rust candidates (${rustIds.length}): ${rustIds.join(', ') || '(none)'}`);

const onlyJs = jsIds.filter((id) => !rustIds.includes(id));
const onlyRust = rustIds.filter((id) => !jsIds.includes(id));

if (onlyJs.length || onlyRust.length) {
  console.error('× watcher parity mismatch');
  if (onlyJs.length) console.error(`  only JS: ${onlyJs.join(', ')}`);
  if (onlyRust.length) console.error(`  only Rust: ${onlyRust.join(', ')}`);
  process.exit(1);
}

console.log('✓ watcher parity OK');
process.exit(0);

async function fetchJsCandidates(baseUrl) {
  const res = await fetch(`${baseUrl}/reels?status=approved`, {
    headers: workerHeaders,
  });
  if (!res.ok) throw new Error(`worker /reels?status=approved → ${res.status}`);
  const payload = await res.json();
  const reels = payload.data ?? [];
  return reels.filter(needsRender);
}

function needsRender(reel) {
  if (reel.renderJobId) return false;
  if (Array.isArray(reel.variants) && reel.variants.length > 0) return false;
  return true;
}

function runRustDryRun(root) {
  const result = spawnSync(
    'cargo',
    [
      'run',
      '--quiet',
      '--manifest-path',
      path.join(root, 'reel/Cargo.toml'),
      '--',
      'watch',
      '--once',
      '--repo-root',
      root,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, REEL_WORKER_URL: workerUrl },
    },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    throw new Error(`rust watch dry-run failed (exit ${result.status})`);
  }
  const ids = [];
  for (const line of (result.stdout ?? '').split('\n')) {
    const match = line.match(/\[dry-run\] would render (\S+)/);
    if (match) ids.push(match[1]);
  }
  return ids;
}
