import { execFile } from 'node:child_process';
import { access, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class StableDiffusionCppAdapter {
  constructor(options = {}) {
    this.executable = path.resolve(options.executable ?? '.reel-pipeline/engines/stable-diffusion.cpp/bin/sd-cli');
    this.modelPath = path.resolve(options.modelPath ?? '.reel-pipeline/models/wai-illustrious-v17/waiIllustriousSDXL_v170.safetensors');
    this.commandRunner = options.commandRunner ?? defaultCommandRunner;
  }

  async readiness() {
    const missing = [];
    await access(this.executable).catch(() => missing.push(this.executable));
    await access(this.modelPath).catch(() => missing.push(this.modelPath));
    return missing.length
      ? { ready: false, blocker: `Missing ${missing.join(', ')}.` }
      : { ready: true, blocker: null };
  }

  async generateCards(options = {}) {
    const readiness = await this.readiness();
    if (!readiness.ready) throw new Error(readiness.blocker);
    const outputDir = path.resolve(requiredString(options.outputDir, 'outputDir'));
    const count = boundedInteger(options.count ?? 4, 4, 8, 'count');
    const seed = boundedInteger(options.seed ?? 424_242, 0, 2_147_483_647, 'seed');
    const width = boundedMultiple(options.width ?? 640, 512, 1024, 'width');
    const height = boundedMultiple(options.height ?? 896, 640, 1344, 'height');
    const steps = boundedInteger(options.steps ?? 20, 8, 40, 'steps');
    const prompt = requiredString(options.prompt, 'prompt');
    const negativePrompt = requiredString(options.negativePrompt, 'negativePrompt');
    await mkdir(outputDir, { recursive: true });
    const outputPattern = path.join(outputDir, 'card-%02d.png');
    await this.commandRunner(this.executable, [
      '-m', this.modelPath,
      '-p', prompt,
      '-n', negativePrompt,
      '--sampling-method', 'euler_a',
      '--scheduler', 'discrete',
      '--steps', String(steps),
      '--cfg-scale', '7',
      '--clip-skip', '2',
      '--rng', 'cpu',
      '--fa',
      '-W', String(width),
      '-H', String(height),
      '-s', String(seed),
      '-b', String(count),
      '--output-begin-idx', '1',
      '-o', outputPattern,
    ]);
    const images = (await readdir(outputDir))
      .filter((name) => /^card-\d+\.png$/.test(name))
      .sort()
      .map((name) => path.join(outputDir, name));
    if (images.length !== count) throw new Error(`stable-diffusion.cpp produced ${images.length} of ${count} requested cards`);
    return {
      images,
      runtime: { kind: 'stable-diffusion.cpp-metal', revision: 'ea7f0c87cfe4c673263b4c201c596c7f1cbe2528' },
      model: {
        id: 'wai-illustrious-v17-sdcpp',
        version: 'v17.0',
        sha256: 'f116b0c78ff441467b0cdc8f1936e1ed18ea31e9997c7b132b1b8db533f0bd04',
      },
      sampling: { method: 'euler_a', scheduler: 'discrete', steps, cfg: 7, clipSkip: 2, seed, width, height },
    };
  }
}

async function defaultCommandRunner(binary, args) {
  return execFileAsync(binary, args, { timeout: 900_000, maxBuffer: 32 * 1024 * 1024 });
}

function boundedInteger(value, min, max, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${field} must be between ${min} and ${max}`);
  return number;
}

function boundedMultiple(value, min, max, field) {
  const number = boundedInteger(value, min, max, field);
  if (number % 64 !== 0) throw new Error(`${field} must be a multiple of 64`);
  return number;
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}
