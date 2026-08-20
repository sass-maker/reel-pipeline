import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class FfmpegNotFoundError extends Error {
  constructor(binary) {
    super(`${binary} not found on PATH. Install via 'brew install ffmpeg' (provides both ffmpeg and ffprobe).`);
    this.binary = binary;
  }
}

export function createFfmpegRunner(options = {}) {
  const ffmpegPath = options.ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg';
  const ffprobePath = options.ffprobePath ?? process.env.FFPROBE_PATH ?? 'ffprobe';

  async function runFfmpeg(args, { quiet = true } = {}) {
    try {
      return await execFileAsync(ffmpegPath, ['-hide_banner', '-loglevel', quiet ? 'error' : 'info', ...args], {
        maxBuffer: 1024 * 1024 * 64,
      });
    } catch (error) {
      if (error?.code === 'ENOENT') throw new FfmpegNotFoundError(ffmpegPath);
      const stderr = error?.stderr?.toString?.() ?? '';
      const stdout = error?.stdout?.toString?.() ?? '';
      const message = `${ffmpegPath} failed (exit ${error.code ?? '?'}): ${stderr || stdout || error.message}`;
      const wrapped = new Error(message);
      wrapped.cause = error;
      throw wrapped;
    }
  }

  async function probeDurationSeconds(filePath) {
    try {
      const { stdout } = await execFileAsync(ffprobePath, [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ]);
      const value = Number(String(stdout).trim());
      if (!Number.isFinite(value)) throw new Error(`ffprobe returned non-numeric duration: ${stdout}`);
      return value;
    } catch (error) {
      if (error?.code === 'ENOENT') throw new FfmpegNotFoundError(ffprobePath);
      throw error;
    }
  }

  async function probeHasAudioStream(filePath) {
    try {
      const { stdout } = await execFileAsync(ffprobePath, [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=index',
        '-of',
        'csv=p=0',
        filePath,
      ]);
      return String(stdout).trim().length > 0;
    } catch (error) {
      if (error?.code === 'ENOENT') throw new FfmpegNotFoundError(ffprobePath);
      throw error;
    }
  }

  return {
    runFfmpeg,
    probeDurationSeconds,
    probeHasAudioStream,
    ffmpegPath,
    ffprobePath,
  };
}
