import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { isKokoroReady, kokoroPaths } from '../adapters/kokoro.js';

const execFileAsync = promisify(execFile);

async function commandVersion(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { maxBuffer: 1024 * 1024 * 4 });
    return String(stdout || stderr).split('\n')[0].trim();
  } catch {
    return null;
  }
}

async function isFile(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function resolvePostReadyRuntimePaths(options = {}) {
  const videoRuntimeRoot = options.videoRuntimeRoot ? path.resolve(options.videoRuntimeRoot) : null;
  const videoModelRoot = options.videoModelRoot ? path.resolve(options.videoModelRoot) : null;
  return {
    ffmpegPath: options.ffmpegPath ?? 'ffmpeg',
    ffprobePath: options.ffprobePath ?? 'ffprobe',
    kokoroDir: options.kokoroDir ? path.resolve(options.kokoroDir) : kokoroPaths().dir,
    videoRuntimeRoot,
    videoModelRoot,
    videoExecutable: options.videoExecutable
      ? path.resolve(options.videoExecutable)
      : videoRuntimeRoot ? path.join(videoRuntimeRoot, '.venv', 'bin', 'ltx-2-mlx') : null,
    videoModel: options.videoModel
      ? path.resolve(options.videoModel)
      : videoModelRoot ? path.join(videoModelRoot, 'transformer-distilled-1.1.safetensors') : null,
  };
}

export async function probePostReadyRuntimes(options = {}) {
  const paths = resolvePostReadyRuntimePaths(options);
  const [ffmpegVersion, ffprobeVersion] = await Promise.all([
    commandVersion(paths.ffmpegPath, ['-version']),
    commandVersion(paths.ffprobePath, ['-version']),
  ]);
  let chromiumVersion = null;
  let chromiumBlocker = null;
  try {
    const { chromium } = await import('playwright');
    const executable = chromium.executablePath();
    if (!(await isFile(executable))) throw new Error(`Chromium executable is missing: ${executable}`);
    chromiumVersion = path.basename(path.dirname(executable));
  } catch (error) {
    chromiumBlocker = error.message;
  }
  const kokoroReady = isKokoroReady(paths.kokoroDir);
  const videoReady = Boolean(paths.videoExecutable && paths.videoModel)
    && await isFile(paths.videoExecutable)
    && await isFile(paths.videoModel);
  const blockers = [
    ...(!ffmpegVersion ? [`FFmpeg is unavailable at ${paths.ffmpegPath}`] : []),
    ...(!ffprobeVersion ? [`FFprobe is unavailable at ${paths.ffprobePath}`] : []),
    ...(chromiumBlocker ? [chromiumBlocker] : []),
  ];
  return {
    ready: blockers.length === 0,
    blockers,
    paths,
    engines: {
      ffmpeg: { ready: Boolean(ffmpegVersion), version: ffmpegVersion },
      ffprobe: { ready: Boolean(ffprobeVersion), version: ffprobeVersion },
      chromium: { ready: Boolean(chromiumVersion), version: chromiumVersion, blocker: chromiumBlocker },
      kokoro: {
        ready: kokoroReady,
        version: kokoroReady ? 'kokoro-onnx-v1.0' : null,
        blocker: kokoroReady ? null : `Kokoro model is unavailable under ${paths.kokoroDir}`,
      },
      localVideo: {
        ready: videoReady,
        version: videoReady ? 'ltx-2-mlx' : null,
        optional: true,
        blocker: videoReady ? null : 'Optional local video runtime or model is unavailable',
      },
    },
  };
}
