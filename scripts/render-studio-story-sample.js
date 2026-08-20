#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, stat, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import storyConfig from '../config/studio-story-sample.json' with { type: 'json' };
import { isKokoroReady, KokoroTts } from '../src/adapters/kokoro.js';
import { runGuardedCommand } from '../src/adapters/ltx-mlx-final.js';
import { checkForgeHost, VIDEO_FORGE_RUNTIME } from '../src/local-video-forge.js';
import { runWorkflowSamples, validateWorkflowSamples } from '../src/studio/workflow-samples.js';

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const baseUrl = String(readArg('--base-url') ?? 'http://127.0.0.1:4317').replace(/\/$/, '');
const aceUrl = String(readArg('--ace-url') ?? 'http://127.0.0.1:18001').replace(/\/$/, '');
const outputDir = path.resolve('.reel-pipeline/projects/last-train-to-elsewhere');
const assetsDir = path.join(outputDir, 'assets');
const renderDir = path.resolve('tmp/studio/story-samples/last-train-to-elsewhere');
const musicPath = path.join(renderDir, 'last-train-score.mp3');
const keyframeOnly = process.argv.includes('--keyframes-only');
const waiModelPath = path.resolve('.reel-pipeline/models/wai-illustrious-v17/waiIllustriousSDXL_v170.safetensors');
const waiReady = await fileExists(waiModelPath);

validateWorkflowSamples(storyConfig);
await mkdir(assetsDir, { recursive: true });
await mkdir(renderDir, { recursive: true });

if (!keyframeOnly) await assertFullRunReady();

if (waiReady) {
  for (const sample of storyConfig.samples) {
    const imagePath = path.resolve(sample.referenceImage);
    if (await fileExists(imagePath)) {
      console.log(`reuse keyframe ${sample.id}`);
      continue;
    }
    await assertResourceEnvelope(outputDir);
    console.log(`generate keyframe ${sample.id}`);
    await generateKeyframe(sample, imagePath);
  }
} else {
  console.log('WAI keyframe checkpoint is absent; using the installed LTX 2.3 text-to-video path without downloading another model.');
}

if (keyframeOnly) {
  if (!waiReady) throw new Error('keyframes-only requires the optional WAI checkpoint, which is not installed');
  console.log(JSON.stringify({ status:'keyframes-ready', outputDir, samples:storyConfig.samples.map(({ id, referenceImage }) => ({ id, referenceImage:path.resolve(referenceImage) })) }, null, 2));
  process.exit(0);
}

const sampleRun = waiReady
  ? await runWorkflowSamples({
    baseUrl,
    config:storyConfig,
    rootDir,
    onProgress(event) {
      console.log(`${event.type.replace('sample-', '')} ${event.sample.id}`);
    },
  })
  : await renderTextToVideoShots();
const videoPaths = sampleRun.results.map((entry) => entry.videoPath).filter(Boolean);
if (videoPaths.length !== storyConfig.samples.length) throw new Error(`story render produced ${videoPaths.length} of ${storyConfig.samples.length} shots`);

await assertResourceEnvelope(outputDir);
if (!await fileExists(musicPath)) await generateMusic(musicPath);
const voicePaths = await generateVoices();
const finalPath = path.join(renderDir, 'last-train-to-elsewhere.mp4');
const concatPath = path.join(renderDir, 'shots.txt');
await writeFile(concatPath, `${videoPaths.map((entry) => `file '${escapeConcatPath(entry)}'`).join('\n')}\n`);
await assembleStory({ concatPath, musicPath, voicePaths, finalPath });

const receiptPath = path.join(renderDir, 'receipt.json');
const receipt = {
  schema:'fleet.studio-story-sample.v1',
  status:'completed',
  id:storyConfig.sampleSetId,
  title:storyConfig.title,
  prompt:storyConfig.storyPrompt,
  workflow:waiReady
    ? { keyframes:'wai-illustrious-v17-sdcpp', shots:'ltx-2.3-mlx-q4-final-i2v', voice:'kokoro-af-heart', music:'ace-step-1.5', assembly:'ffmpeg' }
    : { shots:'ltx-2.3-mlx-q4-final-t2v', voice:'kokoro-af-heart', music:'ace-step-1.5', assembly:'ffmpeg' },
  shots:sampleRun.results,
  output:{ path:finalPath, sha256:await sha256File(finalPath), bytes:(await stat(finalPath)).size, durationSeconds:30 },
  music:{ path:musicPath, prompt:storyConfig.musicPrompt },
  voices:voicePaths,
  completedAt:new Date().toISOString(),
};
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
await persistHistoryEntry(finalPath, receiptPath);
console.log(JSON.stringify(receipt, null, 2));

async function generateKeyframe(sample, outputPath) {
  const executable = path.resolve('.reel-pipeline/engines/stable-diffusion.cpp/bin/sd-cli');
  await access(executable);
  await access(waiModelPath);
  const negative = 'worst quality, low quality, blurry, deformed anatomy, bad hands, extra fingers, missing fingers, duplicate person, child, text, logo, watermark, cropped body, static portrait, close-up only';
  await runGuardedCommand(executable, [
    '-m', waiModelPath, '-p', sample.imagePrompt, '-n', negative,
    '--sampling-method', 'euler_a', '--scheduler', 'discrete', '--steps', '28', '--cfg-scale', '7', '--clip-skip', '2', '--rng', 'cpu', '--fa',
    '-W', '576', '-H', '1024', '-s', String(sample.seed), '-b', '1', '-o', outputPath,
  ], { cwd:rootDir, maxRamPercent:90, timeoutMs:30 * 60 * 1000 });
  await access(outputPath);
}

async function renderTextToVideoShots() {
  const shotDir = path.join(outputDir, 'shots');
  await mkdir(shotDir, { recursive:true });
  const results = [];
  for (const sample of storyConfig.samples) {
    const videoPath = path.join(shotDir, `${sample.id}.mp4`);
    const receiptPath = path.join(shotDir, `${sample.id}.json`);
    if (await fileExists(videoPath)) {
      console.log(`reuse LTX text-to-video shot ${sample.id}`);
      results.push({ sampleId:sample.id, briefId:null, status:'reused', videoPath, receiptPath });
      continue;
    }
    await assertResourceEnvelope(outputDir);
    console.log(`render LTX text-to-video shot ${sample.id}`);
    const startedAt = new Date();
    const execution = await runGuardedCommand('uv', [
      'run', '--no-sync', 'ltx-2-mlx', 'generate', '--distilled', '--low-ram',
      '--model', path.resolve('.reel-pipeline/models/ltx-2.3-mlx-q4'),
      '--gemma', VIDEO_FORGE_RUNTIME.gemmaRepository,
      '--prompt', sample.prompt,
      '--height', '1024', '--width', '576', '--frames', '145', '--frame-rate', '24',
      '--seed', String(sample.seed), '--output', videoPath,
    ], {
      cwd:path.resolve('.reel-pipeline/engines/ltx-2-mlx'),
      maxRamPercent:90,
      timeoutMs:6 * 60 * 60 * 1000,
    });
    const receipt = {
      schema:'fleet.ltx-mlx-story-shot.v1', status:'completed', sampleId:sample.id,
      mode:'text-to-video', model:'ltx-2.3-mlx-q4', runtime:VIDEO_FORGE_RUNTIME,
      prompt:sample.prompt, seed:sample.seed, frames:145, width:576, height:1024, fps:24,
      peakRamPercent:execution.peakRamPercent,
      startedAt:startedAt.toISOString(), completedAt:new Date().toISOString(),
      output:{ path:videoPath, sha256:await sha256File(videoPath), bytes:(await stat(videoPath)).size },
    };
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    results.push({ sampleId:sample.id, briefId:null, status:'completed', videoPath, receiptPath });
  }
  return { sampleSetId:storyConfig.sampleSetId, results };
}

async function generateMusic(outputPath) {
  console.log('generate ACE-Step score');
  const response = await fetch(`${aceUrl}/v1/chat/completions`, {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({
      model:'acestep/acestep-v15-turbo',
      messages:[{ role:'user', content:`<prompt>${storyConfig.musicPrompt}</prompt>` }],
      lyrics:'[Instrumental]',
      use_cot_caption:false,
      use_cot_language:false,
      seed:2307,
      audio_config:{ instrumental:true, duration:30, bpm:118, format:'mp3', key_scale:'D minor', time_signature:'4/4' },
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? payload?.detail ?? String(payload?.error ?? `ACE-Step returned ${response.status}`));
  const dataUrl = payload?.choices?.[0]?.message?.audio?.[0]?.audio_url?.url;
  if (!dataUrl?.startsWith('data:audio/')) throw new Error('ACE-Step returned no audio payload');
  await writeFile(outputPath, Buffer.from(dataUrl.split(',', 2)[1], 'base64'));
}

async function assertFullRunReady() {
  let studioResponse;
  try {
    studioResponse = await fetch(`${baseUrl}/studio/briefs`);
  } catch (error) {
    throw new Error(`Marketing Studio is unavailable at ${baseUrl}; run npm run dev first (${error.message})`);
  }
  if (!studioResponse.ok) throw new Error(`Marketing Studio readiness returned ${studioResponse.status} at ${baseUrl}`);

  const forge = await checkForgeHost({ outputDir, minHeadroomGb:14, minDiskGb:20 });
  if (!forge.ok) throw new Error(`LTX 2.3 story runtime is not ready: ${forge.failures.join('; ')}`);
  if (!isKokoroReady()) throw new Error('Kokoro is unavailable; run npm run setup:kokoro before the story canary');

  if (!await fileExists(musicPath)) {
    try {
      await fetch(aceUrl, { method:'HEAD' });
    } catch (error) {
      throw new Error(`ACE-Step is unavailable at ${aceUrl}; start its local OpenRouter server first (${error.message})`);
    }
  }
}

async function generateVoices() {
  const outputPath = path.join(renderDir, 'voice');
  const tts = new KokoroTts({ voice:'af_heart', speed:1.03 });
  const entries = await tts.synthesizeScenes([
    { narration:'You are not going to believe where the last train went.' },
    { narration:'Every stop was a world that had forgotten morning.' },
    { narration:'I brought back proof.' },
  ], { outputDir:outputPath, voice:'af_heart', speed:1.03 });
  const starts = [0.35, 10.8, 26.1];
  return entries.map((entry, index) => ({ id:`line-${index + 1}`, path:entry.path, startSeconds:starts[index] }));
}

async function assembleStory({ concatPath, musicPath, voicePaths, finalPath }) {
  console.log('assemble 30-second story cut');
  const filters = ['[1:a]atrim=0:30,volume=0.34,afade=t=in:st=0:d=0.35,afade=t=out:st=28.8:d=1.2[music]'];
  const labels = ['[music]'];
  voicePaths.forEach((voice, index) => {
    const delay = Math.round(voice.startSeconds * 1000);
    filters.push(`[${index + 2}:a]adelay=${delay}|${delay},volume=1.25[voice${index}]`);
    labels.push(`[voice${index}]`);
  });
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=10[mix]`);
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concatPath,
    '-stream_loop', '-1', '-i', musicPath,
    ...voicePaths.flatMap((voice) => ['-i', voice.path]),
    '-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[mix]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', '30', '-movflags', '+faststart', finalPath,
  ], { timeout:30 * 60 * 1000, maxBuffer:32 * 1024 * 1024 });
}

async function persistHistoryEntry(videoPath, receiptPath) {
  const id = `story_${storyConfig.sampleSetId}`;
  const existing = await requestJson(`${baseUrl}/studio/briefs`).then((items) => items.find((item) => item.id === id));
  if (!existing) {
    await requestJson(`${baseUrl}/studio/briefs`, {
      method:'POST',
      body:JSON.stringify({
        request:`Create a 30-second coherent animated short. ${storyConfig.storyPrompt}`,
        fields:{ id, title:storyConfig.title, channel:'instagram_reels', durationSeconds:30, modelProfileId:'ltx-2.3-mlx-q4' },
      }),
    });
  }
  await requestJson(`${baseUrl}/studio/briefs/${encodeURIComponent(id)}`, {
    method:'PATCH',
    body:JSON.stringify({
      lifecycle:'needs-review',
      media:{
        artifactDir:renderDir,
        videoPath,
        provider:'assembled-ltx-story',
        manifestPath:receiptPath,
        execution:{
          evidence:{ ownerManifestPath:receiptPath },
          workflow:{
            id:'last-train-to-elsewhere@1', version:1, state:'played',
            archetypeId:'multi-shot-story', archetypeVersion:1,
            name:'Five-shot LTX story cut', lane:'final',
            recipeId:'ltx-2.3-mlx-q4-final-t2v', recipeVersion:1,
            modelProfileId:'ltx-2.3-mlx-q4', runtime:'local-story-runner',
            seed:'12871 · 20791 · 28711 · 36631 · 44551', aspectRatio:'9:16', durationSeconds:30,
            phases:[
              { id:'story', name:'Direct five story beats', owner:'Story recipe', detail:'One coherent courier journey across five locations', status:'completed' },
              { id:'shots', name:'Generate five final shots', owner:'LTX 2.3 MLX', detail:'Serial guarded text-to-video renders', status:'completed' },
              { id:'sound', name:'Create voice and score', owner:'Kokoro + ACE-Step', detail:'Three original voice lines and a 30-second instrumental', status:'completed' },
              { id:'assembly', name:'Assemble and retain evidence', owner:'FFmpeg + Studio', detail:'Vertical final, receipt, and reviewable artifact', status:'completed' },
            ],
          },
        },
        quality:{ verdict:'needs-review', basis:'Five LTX 2.3 final shots assembled with generated score and original local voiceover.' },
      },
    }),
  });
}

async function requestJson(url, init) {
  const response = await fetch(url, { headers:{ 'content-type':'application/json', ...(init?.headers ?? {}) }, ...init });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `${response.status} ${response.statusText}`);
  return payload.data;
}

async function assertResourceEnvelope(target) {
  const disk = await statfs(target);
  const usedPercent = (1 - Number(disk.bavail) / Number(disk.blocks)) * 100;
  if (usedPercent >= 85) throw new Error(`story render refused at ${usedPercent.toFixed(2)} percent disk use`);
  const { stdout } = await execFileAsync('memory_pressure', ['-Q']);
  const freePercent = Number(stdout.match(/System-wide memory free percentage:\s*(\d+)%/)?.[1] ?? 0);
  if (100 - freePercent >= 90) throw new Error(`story render refused at ${100 - freePercent} percent RAM pressure`);
}

async function fileExists(filePath) {
  try {
    const details = await stat(filePath);
    return details.isFile() && details.size > 0;
  } catch {
    return false;
  }
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function escapeConcatPath(filePath) {
  return path.resolve(filePath).replaceAll("'", "'\\''");
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
