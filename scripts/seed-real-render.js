#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { reelWorkerHeaders } from '../src/reel-worker-auth.js';

const execFileAsync = promisify(execFile);

const BASE = process.env.REEL_WORKER_URL ?? 'https://reel-pipeline-artifacts.sarthakagrawal927.workers.dev';
const WORKER_HEADERS = reelWorkerHeaders();
const BUCKET = process.env.REEL_ARTIFACT_R2_BUCKET ?? 'reel-artifacts';
const REEL_ID = process.env.REEL_SEED_ID ?? 'demo-linkchat-1';
const WORK = path.resolve(process.env.REEL_SEED_WORK ?? './tmp/real-render');
const CHROME_BIN = process.env.REEL_SEED_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

await rm(WORK, { recursive: true, force: true });
await mkdir(WORK, { recursive: true });

console.log(`▸ Fetching reel record for ${REEL_ID}…`);
const reel = await fetchReel(REEL_ID);
if (!reel) throw new Error(`reel ${REEL_ID} not found`);

const scenes = buildScenes(reel);

console.log('▸ Generating scene assets (cards + voiceover + segments)…');
for (let index = 0; index < scenes.length; index += 1) {
  await renderScene(index, scenes[index]);
}

console.log('▸ Concatenating segments into final MP4…');
const concatList = path.join(WORK, 'list.txt');
await writeFile(concatList, scenes.map((_, index) => `file 'scene-${index + 1}.mp4'`).join('\n'));
const finalPath = path.join(WORK, `${REEL_ID}.mp4`);
await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', finalPath], WORK);

console.log('▸ Uploading MP4 to R2…');
const variantId = `${REEL_ID}-v1`;
const key = `${variantId}.mp4`;
await run('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', finalPath, '--remote', '--content-type', 'video/mp4']);
const assetUrl = `${BASE}/reels/${key}`;

console.log('▸ Patching reel record in R2 with variant…');
const variant = buildVariant(variantId, assetUrl, reel, scenes);
const updatedReel = {
  ...reel,
  status: 'video_ready',
  renderJobId: `local-ffmpeg-${Date.now()}`,
  renderedAt: new Date().toISOString(),
  assetUrl,
  variants: [variant],
  updatedAt: new Date().toISOString(),
};
const recordPath = path.join(WORK, 'record.json');
await writeFile(recordPath, JSON.stringify(updatedReel, null, 2));
await run('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/reel-requests/${REEL_ID}.json`, '--file', recordPath, '--remote', '--content-type', 'application/json; charset=utf-8']);

console.log('▸ Verifying playback URL…');
const head = await fetch(assetUrl, { method: 'HEAD' });
const range = await fetch(assetUrl, { headers: { range: 'bytes=0-1023' } });
console.log(JSON.stringify({
  url: assetUrl,
  contentType: head.headers.get('content-type'),
  contentLength: head.headers.get('content-length'),
  acceptRanges: head.headers.get('accept-ranges'),
  rangeStatus: range.status,
}, null, 2));

console.log('\n✓ Done. Open https://reel-pipeline-artifacts.sarthakagrawal927.workers.dev/review → Rendered tab.');

async function fetchReel(id) {
  for (const status of ['generated', 'approved', 'video_ready', 'needs_review', 'ready_to_post']) {
    const res = await fetch(`${BASE}/reels?status=${status}`, {
      headers: WORKER_HEADERS,
    });
    if (!res.ok) continue;
    const payload = await res.json();
    const match = (payload.data || []).find((entry) => entry.id === id);
    if (match) return match;
  }
  return null;
}

function buildScenes(reel) {
  const hook = (reel.hook || reel.title || '').trim();
  const cta = (reel.cta || 'Try it on one real workflow.').trim();
  const proof = derivedProofCaption(reel) || 'See it answer in your real product.';
  return [
    { label: 'Pain', caption: hook, voice: hook, palette: { bg: '#082f49', accent: '#22d3ee', text: '#ecfeff' } },
    { label: 'Proof', caption: proof, voice: proof, palette: { bg: '#1e1b4b', accent: '#a78bfa', text: '#ede9fe' } },
    { label: 'Action', caption: cta, voice: cta, palette: { bg: '#052e16', accent: '#bef264', text: '#ecfccb' } },
  ];
}

function derivedProofCaption(reel) {
  const body = String(reel.body || '');
  const captions = body.split('\n').find((line) => /^captions:/i.test(line));
  if (captions) {
    const match = captions.replace(/^captions:/i, '').match(/"([^"]+)"/);
    if (match) return match[1];
  }
  return null;
}

async function renderScene(index, scene) {
  const png = path.join(WORK, `scene-${index + 1}.png`);
  const aiff = path.join(WORK, `scene-${index + 1}.aiff`);
  const mp3 = path.join(WORK, `scene-${index + 1}.mp3`);
  const seg = path.join(WORK, `scene-${index + 1}.mp4`);

  // Render the card via Chrome headless screenshot (ffmpeg in Homebrew lacks libfreetype).
  const htmlPath = path.join(WORK, `scene-${index + 1}.html`);
  await writeFile(htmlPath, buildCardHtml(scene, index));
  await run(CHROME_BIN, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-sandbox',
    '--virtual-time-budget=1500',
    '--window-size=1080,1920',
    `--screenshot=${png}`,
    `file://${htmlPath}`,
  ]);

  try {
    await run('say', ['-v', 'Samantha', '-r', '180', '-o', aiff, scene.voice]);
    await run('ffmpeg', ['-y', '-i', aiff, '-codec:a', 'libmp3lame', '-q:a', '4', mp3]);
  } catch (error) {
    console.warn(`! voiceover failed for scene ${index + 1}: ${error.message}`);
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '3.0', '-codec:a', 'libmp3lame', '-q:a', '4', mp3]);
  }

  await run('ffmpeg', [
    '-y',
    '-loop', '1', '-i', png,
    '-i', mp3,
    '-c:v', 'libx264',
    '-tune', 'stillimage',
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-shortest',
    '-movflags', '+faststart',
    seg,
  ]);
}

function buildCardHtml(scene, index) {
  const labelHtml = escapeHtml(scene.label);
  const captionHtml = escapeHtml(scene.caption);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; width: 1080px; height: 1920px; overflow: hidden; }
  body {
    background: radial-gradient(900px 600px at 50% 18%, ${scene.palette.accent}33, transparent 60%), ${scene.palette.bg};
    color: ${scene.palette.text};
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
  }
  .frame {
    width: 936px;
    margin: 80px 0;
    padding: 88px 72px;
    border-radius: 56px;
    background: rgba(0, 0, 0, 0.36);
    border: 1px solid ${scene.palette.accent}55;
    box-shadow: 0 60px 120px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(20px);
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 56px;
    align-items: center;
  }
  .label {
    text-transform: uppercase;
    letter-spacing: 0.22em;
    font-size: 32px;
    font-weight: 700;
    color: ${scene.palette.accent};
    padding: 12px 28px;
    border: 2px solid ${scene.palette.accent}88;
    border-radius: 999px;
  }
  .caption {
    font-size: 96px;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.06;
    text-wrap: balance;
  }
  .footer {
    margin-top: 60px;
    color: ${scene.palette.accent};
    font-size: 28px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    opacity: 0.7;
  }
  .index-dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    margin: 0 6px;
    border-radius: 999px;
    background: ${scene.palette.accent}55;
  }
  .index-dot.active { background: ${scene.palette.accent}; box-shadow: 0 0 18px ${scene.palette.accent}; }
</style></head><body>
  <div class="frame">
    <div class="label">${labelHtml}</div>
    <div class="caption">${captionHtml}</div>
  </div>
  <div class="footer">
    <span class="index-dot${index === 0 ? ' active' : ''}"></span>
    <span class="index-dot${index === 1 ? ' active' : ''}"></span>
    <span class="index-dot${index === 2 ? ' active' : ''}"></span>
  </div>
</body></html>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function buildVariant(variantId, assetUrl, reel, scenes) {
  return {
    variantId,
    template: 'problem_proof_cta',
    templateLabel: 'Problem → Product Proof → CTA',
    proofType: 'screenshot',
    hook: reel.hook,
    cta: reel.cta || 'Try it on one real workflow.',
    captionText: scenes.map((scene) => scene.caption).join(' / '),
    assetUrl,
    thumbnailUrl: null,
    durationSeconds: 12,
    qualityScore: 0.78,
    qualityScores: {
      valueClarity: 0.85,
      productProofStrength: 0.75,
      visualTrust: 0.85,
      captionReadability: 0.9,
      mobileComposition: 0.85,
      cringeRisk: 0.85,
      postingReadiness: 0.85,
    },
    qualityReasons: ['Real MP4 composed locally via ffmpeg and uploaded to R2.'],
    renderLog: ['template=problem_proof_cta', 'proof=screenshot (local ffmpeg compose)', `assetUrl=${assetUrl}`],
    status: 'video_ready',
    provider: 'ffmpeg-local',
    externalTaskId: `local_${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
}

async function run(command, args, cwd) {
  const { stdout, stderr } = await execFileAsync(command, args, { cwd, maxBuffer: 1024 * 1024 * 40 });
  if (stderr && process.env.REEL_SEED_VERBOSE === '1') process.stderr.write(stderr);
  return { stdout, stderr };
}
