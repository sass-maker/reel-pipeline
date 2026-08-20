import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, open, readFile, stat, statfs, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const VIDEO_FORGE_RUNTIME = Object.freeze({
  repository: 'https://github.com/dgrauet/ltx-2-mlx.git',
  revision: 'e1838a855bfd1640135c424c96cb27a0c0ad150e',
  modelRepository: 'dgrauet/ltx-2.3-mlx-q4',
  modelRevision: '53a6f5f39d9c074bc73e6a18ba391f40ddffaa68',
  gemmaRepository: 'mlx-community/gemma-3-12b-it-4bit',
});

export const VIDEO_FORGE_PRESETS = Object.freeze({
  smoke: { pipeline: 'distilled', width: 256, height: 384, frames: 9, fps: 24, minHeadroomGb: 12 },
  draft: { pipeline: 'distilled', width: 384, height: 640, frames: 49, fps: 24, minHeadroomGb: 12 },
  preview: { pipeline: 'distilled', width: 576, height: 1024, frames: 81, fps: 24, minHeadroomGb: 14 },
  final: { pipeline: 'two-stage', width: 576, height: 1024, frames: 81, fps: 24, stage1Steps: 30, stage2Steps: 3, minHeadroomGb: 14 },
  hero: { pipeline: 'two-stages-hq', width: 576, height: 1024, frames: 81, fps: 24, stage1Steps: 15, stage2Steps: 3, minHeadroomGb: 16 },
});

export async function loadForgeProject(manifestPath) {
  const absolutePath = path.resolve(manifestPath);
  const input = JSON.parse(await readFile(absolutePath, 'utf8'));
  return normalizeForgeProject(input, { manifestPath: absolutePath });
}

export function normalizeForgeProject(input, options = {}) {
  if (!input || typeof input !== 'object') throw new Error('project manifest must be a JSON object');
  const projectInput = input.project;
  if (!projectInput || typeof projectInput !== 'object') throw new Error('project is required');
  const name = requiredString(projectInput.name, 'project.name');
  const aspectRatio = requiredOneOf(projectInput.aspectRatio ?? projectInput.aspect_ratio ?? '9:16', ['9:16', '16:9', '1:1'], 'project.aspectRatio');
  const fps = positiveInteger(projectInput.fps ?? 24, 'project.fps');
  const shots = input.shots;
  if (!Array.isArray(shots) || shots.length === 0) throw new Error('shots must contain at least one shot');

  const manifestDir = options.manifestPath ? path.dirname(options.manifestPath) : path.resolve(options.baseDir ?? '.');
  return {
    schema: input.schema ?? 'reel-pipeline.local-video-forge.v0.1',
    manifestPath: options.manifestPath ?? null,
    project: {
      name,
      aspectRatio,
      fps,
      targetDurationSeconds: optionalNumber(projectInput.targetDurationSeconds ?? projectInput.target_duration_seconds),
      style: optionalString(projectInput.style) ?? '',
    },
    shots: shots.map((shot) => normalizeForgeShot(shot, { manifestDir, projectFps: fps })),
  };
}

export function selectForgeShot(project, shotId) {
  const shot = project.shots.find((candidate) => candidate.id === shotId);
  if (!shot) throw new Error(`shot not found: ${shotId}`);
  return shot;
}

export async function assertApprovedKeyframe(shot) {
  if (!shot.keyframeApproved) throw new Error(`shot ${shot.id} keyframe is not explicitly approved`);
  try {
    const details = await stat(shot.keyframePath);
    if (!details.isFile()) throw new Error('not a file');
  } catch (error) {
    throw new Error(`shot ${shot.id} keyframe is unavailable: ${shot.keyframePath} (${error.message})`);
  }
}

export function buildLtxCommand(shot, seed, outputPath, options = {}) {
  const preset = resolvePreset(shot.preview);
  const runtimeDir = path.resolve(options.runtimeDir ?? '.reel-pipeline/engines/ltx-2-mlx');
  const modelDir = path.resolve(options.modelDir ?? '.reel-pipeline/models/ltx-2.3-mlx-q4');
  const args = [
    'run',
    '--no-sync',
    'ltx-2-mlx',
    'generate',
    pipelineFlag(preset.pipeline),
    '--low-ram',
    '--model',
    modelDir,
    '--gemma',
    VIDEO_FORGE_RUNTIME.gemmaRepository,
    '--prompt',
    shot.motionPrompt,
    '--image',
    shot.keyframePath,
    '--height',
    String(preset.height),
    '--width',
    String(preset.width),
    '--frames',
    String(preset.frames),
    '--frame-rate',
    String(preset.fps),
    '--seed',
    String(seed),
    '--output',
    outputPath,
  ];
  if (preset.stage1Steps) args.push('--stage1-steps', String(preset.stage1Steps));
  if (preset.stage2Steps) args.push('--stage2-steps', String(preset.stage2Steps));
  return { command: 'uv', args, cwd: runtimeDir, preset };
}

export async function checkForgeHost(options = {}) {
  const runtimeDir = path.resolve(options.runtimeDir ?? '.reel-pipeline/engines/ltx-2-mlx');
  const modelDir = path.resolve(options.modelDir ?? '.reel-pipeline/models/ltx-2.3-mlx-q4');
  const outputDir = path.resolve(options.outputDir ?? '.reel-pipeline');
  const minHeadroomGb = Number(options.minHeadroomGb ?? 14);
  const minDiskGb = Number(options.minDiskGb ?? 20);
  const memory = options.memory ?? await macMemoryHeadroom();
  const failures = [];

  if ((options.platform ?? process.platform) !== 'darwin' || (options.arch ?? process.arch) !== 'arm64') {
    failures.push('video forge requires Apple Silicon macOS');
  }
  for (const requiredPath of [
    path.join(runtimeDir, '.venv/bin/ltx-2-mlx'),
    path.join(modelDir, 'transformer-distilled-1.1.safetensors'),
    path.join(modelDir, 'connector.safetensors'),
    path.join(modelDir, 'vae_encoder.safetensors'),
    path.join(modelDir, 'vae_decoder.safetensors'),
  ]) {
    if (!(await exists(requiredPath))) failures.push(`missing runtime file: ${requiredPath}`);
  }
  if (memory.pressure === 'critical') failures.push('macOS memory pressure is critical');
  if (memory.usableBytes < minHeadroomGb * 1024 ** 3) {
    failures.push(`usable memory ${formatGb(memory.usableBytes)} GB is below ${minHeadroomGb} GB`);
  }
  await mkdir(outputDir, { recursive: true });
  const disk = await statfs(outputDir);
  const availableDiskBytes = disk.bavail * disk.bsize;
  if (availableDiskBytes < minDiskGb * 1024 ** 3) {
    failures.push(`available disk ${formatGb(availableDiskBytes)} GB is below ${minDiskGb} GB`);
  }

  return {
    ok: failures.length === 0,
    failures,
    runtimeDir,
    modelDir,
    memory,
    availableDiskBytes,
  };
}

export async function generateForgeVariants(project, shot, options = {}) {
  await assertApprovedKeyframe(shot);
  const preset = resolvePreset(shot.preview);
  const outputRoot = path.resolve(options.outputRoot ?? path.join(path.dirname(project.manifestPath ?? '.'), 'previews'));
  const shotDir = path.join(outputRoot, shot.id);
  const lockDir = path.resolve(options.lockDir ?? '.reel-pipeline');
  await mkdir(shotDir, { recursive: true });
  await mkdir(lockDir, { recursive: true });
  const readiness = options.skipReadiness
    ? { ok: true, failures: [], memory: options.memory ?? { usableBytes: null, pressure: 'unknown' } }
    : await (options.checkHost ?? checkForgeHost)({
      ...options,
      outputDir: shotDir,
      minHeadroomGb: preset.minHeadroomGb,
    });
  if (!readiness.ok) throw new Error(`video forge host is not ready: ${readiness.failures.join('; ')}`);

  const keyframeHash = await sha256File(shot.keyframePath);
  const inputSignature = forgeInputSignature(publicShot(shot), keyframeHash, VIDEO_FORGE_RUNTIME);
  const lock = await acquireRenderLock(lockDir);
  try {
    const runPath = path.join(shotDir, 'run.json');
    const existingRun = await readJson(runPath);
    if (existingRun) {
      const existingSignature = existingRun.inputSignature
        ?? forgeInputSignature(existingRun.shot, existingRun.keyframeSha256, existingRun.runtime);
      if (existingSignature !== inputSignature) {
        throw new Error(`shot ${shot.id} inputs changed; use a new shot id or output directory to preserve completed renders`);
      }
    }
    let run = existingRun ?? {
      schema: 'reel-pipeline.local-video-forge-run.v0.1',
      taskId: options.taskId ?? `direct-${project.project.name}-${shot.id}`,
      project: project.project,
      shot: publicShot(shot),
      runtime: VIDEO_FORGE_RUNTIME,
      keyframeSha256: keyframeHash,
      inputSignature,
      status: 'running',
      variants: [],
      createdAt: new Date().toISOString(),
    };
    run = {
      ...run,
      inputSignature,
      taskId: run.taskId ?? options.taskId ?? `direct-${project.project.name}-${shot.id}`,
      variants: run.variants.map((variant) => (
        variant.status === 'completed' && variant.exitCode === undefined
          ? { ...variant, exitCode: 0 }
          : variant
      )),
    };

    for (const seed of shot.preview.seeds) {
      const variantId = `seed-${seed}`;
      const outputPath = path.join(shotDir, `${shot.id}-${variantId}.mp4`);
      const existing = run.variants.find((variant) => variant.seed === seed && variant.status === 'completed');
      if (existing && await exists(outputPath)) continue;
      const spec = buildLtxCommand(shot, seed, outputPath, options);
      const startedAt = new Date();
      let variant = {
        variantId,
        seed,
        status: options.dryRun ? 'planned' : 'running',
        outputPath,
        prompt: shot.motionPrompt,
        negativePrompt: shot.negativePrompt,
        preset: spec.preset,
        command: spec.command,
        commandArgs: spec.args,
        startedAt: startedAt.toISOString(),
      };
      run.variants = upsertVariant(run.variants, variant);
      await writeJson(runPath, run);
      await options.onProgress?.({ type: 'variant-started', variant, run });

      if (!options.dryRun) {
        try {
          const execute = options.commandRunner ?? defaultCommandRunner;
          const execution = await execute(spec.command, spec.args, {
            cwd: spec.cwd,
            env: { ...process.env, HF_HUB_DISABLE_XET: '1' },
            timeout: options.timeoutMs ?? 6 * 60 * 60 * 1000,
          });
          await access(outputPath);
          const endedAt = new Date();
          variant = {
            ...variant,
            status: 'completed',
            endedAt: endedAt.toISOString(),
            renderDurationSeconds: (endedAt.getTime() - startedAt.getTime()) / 1000,
            outputSha256: await sha256File(outputPath),
            outputBytes: (await stat(outputPath)).size,
            host: { id: options.workerId ?? os.hostname(), arch: process.arch, platform: process.platform },
            peakMemoryBytes: parsePeakMemory(execution?.stderr),
            exitCode: 0,
          };
        } catch (error) {
          variant = {
            ...variant,
            status: 'failed',
            endedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
            stderr: typeof error?.stderr === 'string' ? error.stderr.slice(-16_000) : null,
            exitCode: Number.isInteger(error?.code) ? error.code : null,
          };
          run.variants = upsertVariant(run.variants, variant);
          run.status = 'failed';
          await writeJson(runPath, run);
          await options.onProgress?.({ type: 'variant-failed', variant, run });
          throw error;
        }
      }
      run.variants = upsertVariant(run.variants, variant);
      await writeJson(runPath, run);
      await options.onProgress?.({ type: 'variant-completed', variant, run });
    }
    run.status = options.dryRun ? 'planned' : 'completed';
    run.completedAt = new Date().toISOString();
    run.reviewGalleryPath = await writeReviewGallery(run, shotDir);
    await writeJson(runPath, run);
    return { ...run, runPath };
  } finally {
    await lock.close();
  }
}

function normalizeForgeShot(shot, context) {
  if (!shot || typeof shot !== 'object') throw new Error('each shot must be an object');
  const id = requiredString(shot.id, 'shot.id');
  const mode = requiredOneOf(shot.mode ?? 'image-to-video', ['image-to-video'], `shot ${id}.mode`);
  const keyframeValue = requiredString(shot.keyframe, `shot ${id}.keyframe`);
  const keyframePath = path.isAbsolute(keyframeValue) ? keyframeValue : path.resolve(context.manifestDir, keyframeValue);
  const motionPrompt = requiredString(shot.motionPrompt ?? shot.motion_prompt, `shot ${id}.motionPrompt`);
  const previewInput = shot.preview ?? {};
  const presetName = optionalString(previewInput.preset) ?? 'preview';
  const basePreset = VIDEO_FORGE_PRESETS[presetName];
  if (!basePreset) throw new Error(`shot ${id}.preview.preset is unsupported: ${presetName}`);
  const seeds = previewInput.seeds ?? [41, 42, 43];
  if (!Array.isArray(seeds) || seeds.length !== 3 || seeds.some((seed) => !Number.isInteger(seed))) {
    throw new Error(`shot ${id}.preview.seeds must contain exactly three integer seeds`);
  }
  return {
    id,
    narration: optionalString(shot.narration) ?? '',
    durationSeconds: optionalNumber(shot.durationSeconds ?? shot.duration_seconds),
    mode,
    keyframe: keyframeValue,
    keyframePath,
    keyframeApproved: shot.keyframeApproved === true || shot.keyframe_approved === true,
    motionPrompt,
    negativePrompt: optionalString(shot.negativePrompt ?? shot.negative_prompt) ?? '',
    preview: {
      preset: presetName,
      seeds: [...seeds],
      width: positiveInteger(previewInput.width ?? previewInput.resolution?.[0] ?? basePreset.width, `shot ${id}.preview.width`),
      height: positiveInteger(previewInput.height ?? previewInput.resolution?.[1] ?? basePreset.height, `shot ${id}.preview.height`),
      frames: positiveInteger(previewInput.frames ?? basePreset.frames, `shot ${id}.preview.frames`),
      fps: positiveInteger(previewInput.fps ?? context.projectFps ?? basePreset.fps, `shot ${id}.preview.fps`),
      pipeline: optionalString(previewInput.pipeline) ?? basePreset.pipeline,
      stage1Steps: previewInput.stage1Steps ?? basePreset.stage1Steps ?? null,
      stage2Steps: previewInput.stage2Steps ?? basePreset.stage2Steps ?? null,
      minHeadroomGb: previewInput.minHeadroomGb ?? basePreset.minHeadroomGb,
    },
  };
}

function resolvePreset(preview) {
  const base = VIDEO_FORGE_PRESETS[preview.preset] ?? VIDEO_FORGE_PRESETS.preview;
  return { ...base, ...preview };
}

function pipelineFlag(pipeline) {
  if (pipeline === 'distilled') return '--distilled';
  if (pipeline === 'two-stage') return '--two-stage';
  if (pipeline === 'two-stages-hq') return '--two-stages-hq';
  throw new Error(`unsupported LTX pipeline: ${pipeline}`);
}

async function macMemoryHeadroom() {
  if (process.platform !== 'darwin') return { usableBytes: os.freemem(), pressure: 'unknown', freePercent: null };
  try {
    const { stdout } = await execFileAsync('memory_pressure', ['-Q']);
    const match = stdout.match(/System-wide memory free percentage:\s*(\d+)%/);
    const freePercent = match ? Number(match[1]) : null;
    return {
      usableBytes: freePercent === null ? os.freemem() : Math.floor(os.totalmem() * freePercent / 100),
      pressure: freePercent !== null && freePercent < 5 ? 'critical' : 'normal',
      freePercent,
    };
  } catch {
    return { usableBytes: os.freemem(), pressure: 'unknown', freePercent: null };
  }
}

async function acquireRenderLock(lockDir, allowStaleRetry = true) {
  const lockPath = path.join(lockDir, '.video-forge.render.lock');
  try {
    const handle = await open(lockPath, 'wx');
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, host: os.hostname(), createdAt: new Date().toISOString() })}\n`);
    return {
      async close() {
        await handle.close();
        await unlink(lockPath).catch(() => {});
      },
    };
  } catch (error) {
    if (error?.code === 'EEXIST' && allowStaleRetry && await staleLocalLock(lockPath)) {
      await unlink(lockPath);
      return acquireRenderLock(lockDir, false);
    }
    if (error?.code === 'EEXIST') throw new Error(`another video-generation job owns ${lockPath}`);
    throw error;
  }
}

async function staleLocalLock(lockPath) {
  try {
    const lock = JSON.parse(await readFile(lockPath, 'utf8'));
    if (lock.host !== os.hostname() || !Number.isInteger(lock.pid)) return false;
    try {
      process.kill(lock.pid, 0);
      return false;
    } catch (error) {
      return error?.code === 'ESRCH';
    }
  } catch {
    return false;
  }
}

async function writeReviewGallery(run, shotDir) {
  const galleryPath = path.join(shotDir, 'review.html');
  const cards = run.variants.map((variant) => {
    const source = variant.status === 'completed'
      ? `<video controls preload="metadata" src="${escapeHtml(path.basename(variant.outputPath))}"></video>`
      : '<div class="placeholder">Not rendered</div>';
    return `<article>
      <h2>${escapeHtml(variant.variantId)}</h2>
      ${source}
      <dl><dt>Status</dt><dd>${escapeHtml(variant.status)}</dd><dt>Seed</dt><dd>${variant.seed}</dd><dt>Render</dt><dd>${formatDuration(variant.renderDurationSeconds)}</dd></dl>
    </article>`;
  }).join('\n');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(run.project.name)} · ${escapeHtml(run.shot.id)} review</title>
  <style>
    :root { color-scheme: dark; font: 16px/1.45 system-ui, sans-serif; background: #111; color: #f4f4f4; }
    body { margin: 0 auto; max-width: 1200px; padding: 32px; }
    main { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    article { background: #1c1c1c; border: 1px solid #333; border-radius: 12px; padding: 16px; }
    video, .placeholder { aspect-ratio: ${run.project.aspectRatio.replace(':', ' / ')}; background: #000; border-radius: 8px; display: block; object-fit: contain; width: 100%; }
    .placeholder { align-items: center; display: flex; justify-content: center; color: #999; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; }
    dt { color: #999; } dd { margin: 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(run.project.name)} · ${escapeHtml(run.shot.id)}</h1>
  <p>${escapeHtml(run.shot.motionPrompt)}</p>
  <main>${cards}</main>
</body>
</html>
`;
  await writeFile(galleryPath, html);
  return galleryPath;
}

async function defaultCommandRunner(command, args, options) {
  return execFileAsync('/usr/bin/time', ['-l', command, ...args], { ...options, maxBuffer: 8 * 1024 * 1024 });
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function upsertVariant(variants, next) {
  const index = variants.findIndex((variant) => variant.seed === next.seed);
  if (index === -1) return [...variants, next];
  const output = variants.slice();
  output[index] = next;
  return output;
}

function publicShot(shot) {
  const { keyframePath, ...rest } = shot;
  return rest;
}

function requiredString(value, name) {
  const result = optionalString(value);
  if (!result) throw new Error(`${name} is required`);
  return result;
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${name} must be a positive integer`);
  return number;
}

function requiredOneOf(value, allowed, name) {
  if (!allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  return value;
}

function formatGb(bytes) {
  return Math.round(bytes / 1024 ** 3 * 10) / 10;
}

function formatDuration(value) {
  return Number.isFinite(value) ? `${Math.round(value * 10) / 10}s` : '—';
}

function parsePeakMemory(stderr) {
  const match = String(stderr ?? '').match(/^\s*(\d+)\s+maximum resident set size\s*$/m);
  return match ? Number(match[1]) : null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function forgeInputSignature(shot, keyframeSha256, runtime) {
  return createHash('sha256')
    .update(JSON.stringify(withoutNullish({ shot, keyframeSha256, runtime })))
    .digest('hex');
}

function withoutNullish(value) {
  if (Array.isArray(value)) return value.map(withoutNullish);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== null && child !== undefined)
      .map(([key, child]) => [key, withoutNullish(child)]),
  );
}
