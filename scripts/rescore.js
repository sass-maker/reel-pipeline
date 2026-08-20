#!/usr/bin/env node
/**
 * Metadata-only rescore: fetch each reel record from R2 (via the worker),
 * recompute qualityScore from existing variant fields using the current
 * scoreVariantHonest, and patch the record back. No video re-render.
 */
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { reelWorkerHeaders } from '../src/reel-worker-auth.js';

const execFileAsync = promisify(execFile);

const BASE = process.env.REEL_WORKER_URL ?? 'https://reel-pipeline-artifacts.sarthakagrawal927.workers.dev';
const WORKER_HEADERS = reelWorkerHeaders();
const BUCKET = process.env.REEL_ARTIFACT_R2_BUCKET ?? 'reel-artifacts';
const WORK = path.resolve('./tmp/rescore');
await mkdir(WORK, { recursive: true });

const reels = await listReels(['video_ready', 'needs_review', 'video_rejected', 'ready_to_post']);
const summary = [];

for (const reel of reels) {
  if (!Array.isArray(reel.variants) || reel.variants.length === 0) continue;
  const variant = reel.variants[0];
  const usedRealCapture = variant.proofType === 'screenshot';
  const voiceProvider = (variant.renderLog || []).find((line) => line.startsWith('voice=')) ?? 'voice=unknown';
  const voice = voiceProvider.replace(/^voice=/, '');
  const syncedCaptions = voice.includes('Neural') || voice.startsWith('en-');
  const sceneCount = Number((variant.renderLog || []).find((line) => line.startsWith('scenes='))?.replace(/^scenes=/, '')) || 6;
  const totalDuration = variant.durationSeconds || 30;

  const scored = scoreVariantHonest({ usedRealCapture, voiceProvider: voice, syncedCaptions, sceneCount, totalDuration });
  const updatedVariant = {
    ...variant,
    qualityScore: scored.overall,
    qualityScores: scored.dimensions,
    qualityReasons: scored.reasons,
  };
  const updated = { ...reel, variants: [updatedVariant], updatedAt: new Date().toISOString() };

  const recordPath = path.join(WORK, `${reel.id}.json`);
  await writeFile(recordPath, JSON.stringify(updated, null, 2));
  await run('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/reel-requests/${reel.id}.json`, '--file', recordPath, '--remote', '--content-type', 'application/json; charset=utf-8']);
  summary.push({ id: reel.id, score: scored.overall, status: reel.status });
}

console.log(JSON.stringify(summary, null, 2));

function scoreVariantHonest({ usedRealCapture, voiceProvider, syncedCaptions, sceneCount, totalDuration }) {
  const missing = [];

  const valueClarity = sceneCount >= 5 ? 0.70 : 0.45;
  if (sceneCount < 5) missing.push('script has fewer than 5 beats');

  const productProofStrength = usedRealCapture ? 0.70 : 0.20;
  if (!usedRealCapture) missing.push('no real product capture (used generated cards)');
  if (usedRealCapture) missing.push('proof is a static GitHub repo page, not the running product');

  const visualTrust = usedRealCapture ? 0.70 : 0.35;

  const captionReadability = syncedCaptions ? 0.82 : 0.55;
  if (!syncedCaptions) missing.push('captions are estimated, not synced to voice timing');

  const mobileComposition = totalDuration >= 18 && totalDuration <= 45 ? 0.80 : 0.50;
  if (totalDuration < 18) missing.push(`duration ${totalDuration.toFixed(1)}s is too short to actually explain a product`);
  if (totalDuration > 45) missing.push(`duration ${totalDuration.toFixed(1)}s exceeds default short-form ceiling`);

  const cringeRisk = 0.78;

  const postingReadiness = (usedRealCapture && syncedCaptions && sceneCount >= 5) ? 0.55 : 0.30;
  missing.push('no background music bed');
  missing.push('no live UI motion or screen recording — proof scene is a static page with Ken Burns');
  missing.push('no human voice / on-camera presence (the next ceiling lift)');
  missing.push('no b-roll cuts or in-product animation');

  const dimensions = {
    valueClarity: round(valueClarity),
    productProofStrength: round(productProofStrength),
    visualTrust: round(visualTrust),
    captionReadability: round(captionReadability),
    mobileComposition: round(mobileComposition),
    cringeRisk: round(cringeRisk),
    postingReadiness: round(postingReadiness),
  };
  const overall = round(Object.values(dimensions).reduce((sum, v) => sum + v, 0) / Object.keys(dimensions).length);

  const reasons = [`${sceneCount}-beat explainer script (${totalDuration.toFixed(1)}s)`];
  if (usedRealCapture) reasons.push('Real GitHub product capture with multi-region Ken Burns');
  if (syncedCaptions) reasons.push(`Captions SRT-synced to ${voiceProvider} voice timing`);
  reasons.push(`Voice: ${voiceProvider}`);
  for (const item of missing) reasons.push(`Missing: ${item}`);

  return { overall, dimensions, reasons };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function listReels(statuses) {
  const seen = new Map();
  for (const status of statuses) {
    const res = await fetch(`${BASE}/reels?status=${status}`, {
      headers: WORKER_HEADERS,
    });
    if (!res.ok) continue;
    const payload = await res.json();
    for (const reel of payload.data || []) {
      if (!seen.has(reel.id)) seen.set(reel.id, reel);
    }
  }
  return Array.from(seen.values());
}

async function run(command, args) {
  return execFileAsync(command, args, { maxBuffer: 1024 * 1024 * 20 });
}
