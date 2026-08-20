import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, statfs, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  VIDEO_FORGE_RUNTIME,
  assertApprovedKeyframe,
  buildLtxCommand,
  checkForgeHost,
} from '../local-video-forge.js';

export async function executeLtxMlxFinal(run, options = {}) {
  if (run?.engine !== 'local-video-forge') throw new Error('a resolved Local Video Forge workflow run is required');
  const startedAt = new Date(options.now?.() ?? Date.now());
  const outputRoot = path.resolve(options.outputRoot ?? 'tmp/studio/local-video');
  const runDir = path.join(outputRoot, run.inputSignature);
  const outputPath = path.join(runDir, 'video.mp4');
  const receiptPath = path.join(runDir, 'receipt.json');
  await mkdir(runDir, { recursive: true });
  await assertDiskCeiling(runDir, run.resourceEnvelope.maxDiskPercent, options);
  const shot = forgeShot(run);
  await assertApprovedKeyframe(shot);
  const readiness = await (options.checkHost ?? checkForgeHost)({
    runtimeDir: options.runtimeDir ?? run.provenance.runtime.path,
    modelDir: options.modelDir ?? path.dirname(run.provenance.models[0].path),
    outputDir: runDir,
    minHeadroomGb: run.inputs.quality === 'hero' ? 16 : 14,
  });
  if (!readiness.ok) throw new Error(`LTX 2.3 final is not ready: ${readiness.failures.join('; ')}`);
  const command = buildLtxCommand(shot, run.inputs.seed, outputPath, {
    runtimeDir: options.runtimeDir ?? run.provenance.runtime.path,
    modelDir: options.modelDir ?? path.dirname(run.provenance.models[0].path),
  });
  const execute = options.commandRunner ?? runGuardedCommand;
  const execution = await execute(command.command, command.args, {
    cwd: command.cwd,
    timeoutMs: options.timeoutMs ?? 6 * 60 * 60 * 1000,
    maxRamPercent: run.resourceEnvelope.maxRamPercent,
    resourceMonitor: options.resourceMonitor,
    pollIntervalMs: options.pollIntervalMs,
  });
  const details = await stat(outputPath);
  if (!details.isFile() || details.size < 1) throw new Error('LTX 2.3 returned no playable video');
  const endedAt = new Date(options.now?.() ?? Date.now());
  const hashFile = options.hashFile ?? sha256File;
  const probeVideo = options.probeVideo ?? ffprobeVideo;
  const receipt = {
    schema: 'fleet.ltx-mlx-final-execution.v1',
    status: 'completed',
    recipeId: run.recipeId,
    recipeVersion: run.recipeVersion,
    inputSignature: run.inputSignature,
    runtime: VIDEO_FORGE_RUNTIME,
    models: run.provenance.models,
    command: { executable: command.command, args: command.args, cwd: command.cwd },
    startedAt: startedAt.toISOString(),
    completedAt: endedAt.toISOString(),
    renderDurationSeconds: (endedAt.getTime() - startedAt.getTime()) / 1000,
    peakRamPercent: execution.peakRamPercent ?? null,
    artifact: {
      path: outputPath,
      bytes: details.size,
      sha256: await hashFile(outputPath),
      metadata: await probeVideo(outputPath),
    },
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return {
    videoPath: outputPath,
    bytes: details.size,
    sha256: receipt.artifact.sha256,
    renderer: 'ltx-2-mlx',
    ownerManifestPath: receiptPath,
    provenance: {
      posture: 'real',
      renderer: 'ltx-2-mlx',
      recipeId: run.recipeId,
      recipeVersion: run.recipeVersion,
      runtime: VIDEO_FORGE_RUNTIME,
      models: run.provenance.models,
      peakRamPercent: receipt.peakRamPercent,
    },
    quality: { verdict: 'needs-review', basis: `${run.qualityLane} LTX 2.3 render completed; operator review required` },
  };
}

export async function runGuardedCommand(command, args, options = {}) {
  const monitor = options.resourceMonitor ?? systemRamPercent;
  const maxRamPercent = Number(options.maxRamPercent ?? 90);
  const pollIntervalMs = Number(options.pollIntervalMs ?? 2_000);
  const timeoutMs = Number(options.timeoutMs ?? 6 * 60 * 60 * 1000);
  return new Promise((resolve, reject) => {
    let peakRamPercent = 0;
    let interruptedForRam = false;
    const child = execFile('/usr/bin/time', ['-l', command, ...args], {
      cwd: options.cwd,
      env: { ...process.env, HF_HUB_DISABLE_XET: '1' },
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      clearInterval(interval);
      if (interruptedForRam) {
        reject(new Error(`LTX 2.3 interrupted at ${peakRamPercent.toFixed(2)} percent RAM`));
        return;
      }
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr, peakRamPercent });
    });
    const sample = async () => {
      try {
        const current = await monitor();
        peakRamPercent = Math.max(peakRamPercent, Number(current.percent ?? current));
        if (peakRamPercent >= maxRamPercent && !interruptedForRam) {
          interruptedForRam = true;
          child.kill('SIGINT');
        }
      } catch {}
    };
    const interval = setInterval(sample, pollIntervalMs);
    sample();
  });
}

function forgeShot(run) {
  const aspect = run.inputs.aspectRatio;
  const portrait = aspect === '9:16';
  const rawFrames = Math.max(9, Math.round(run.inputs.durationSeconds * 24));
  const frames = 1 + 8 * Math.max(1, Math.round((rawFrames - 1) / 8));
  return {
    id: run.inputSignature.slice(0, 12),
    keyframeApproved: true,
    keyframePath: path.resolve(run.inputs.referenceImage),
    motionPrompt: run.inputs.prompt,
    negativePrompt: '',
    preview: {
      preset: run.inputs.quality,
      seeds: [run.inputs.seed],
      frames,
      width: portrait ? 576 : 1024,
      height: portrait ? 1024 : 576,
    },
  };
}

async function assertDiskCeiling(outputDir, maxDiskPercent, options) {
  const disk = await (options.statfs ?? statfs)(outputDir);
  const totalBytes = Number(disk.blocks) * Number(disk.bsize);
  const availableBytes = Number(disk.bavail) * Number(disk.bsize);
  const projectedBytes = Number(options.projectedOutputBytes ?? 2 * 1024 ** 3);
  const projectedPercent = (totalBytes - availableBytes + projectedBytes) / totalBytes * 100;
  if (projectedPercent >= maxDiskPercent) {
    throw new Error(`LTX 2.3 refused: projected disk use ${projectedPercent.toFixed(2)} percent reaches ${maxDiskPercent} percent limit`);
  }
}

async function systemRamPercent() {
  if (process.platform === 'darwin') {
    try {
      const stdout = await new Promise((resolve, reject) => execFile('memory_pressure', ['-Q'], (error, value) => error ? reject(error) : resolve(value)));
      const match = String(stdout).match(/System-wide memory free percentage:\s*(\d+)%/);
      if (match) return { percent: 100 - Number(match[1]) };
    } catch {}
  }
  return { percent: (1 - os.freemem() / os.totalmem()) * 100 };
}

async function ffprobeVideo(filePath) {
  const output = await new Promise((resolve, reject) => execFile('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,r_frame_rate', '-of', 'json', filePath,
  ], (error, stdout) => error ? reject(error) : resolve(stdout)));
  return JSON.parse(output);
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}
