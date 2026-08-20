import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_ARTIFACT_DIR = './artifacts/blender';
const BUILDER_PATH = fileURLToPath(new URL('../../scripts/blender/literal_scene_builder.py', import.meta.url));
const BUILDER_VERSION = 'literal-scene-builder-v2';
const SUPPORTED_VERSION = { major: 5, minor: 2 };
const ALLOWED_OBJECTS = new Set(['star', 'diamond', 'world', 'traveller', 'light', 'rain', 'heart', 'road', 'subject']);
const ALLOWED_CAMERAS = new Set(['static', 'slow-push', 'gentle-orbit']);
const ALLOWED_PALETTES = new Set(['midnight-gold', 'blue-silver', 'violet-cyan']);
const ALLOWED_VISUAL_STYLES = new Set([
  'cosmic-shrine',
  'brutalist-monument',
  'glass-studio',
  'low-poly-valley',
  'organic-bloom',
  'kinetic-sculpture',
  'neon-tunnel',
  'paper-diorama',
]);
const STYLE_CAMERAS = {
  'cosmic-shrine': 'gentle-orbit',
  'brutalist-monument': 'static',
  'glass-studio': 'slow-push',
  'low-poly-valley': 'slow-push',
  'organic-bloom': 'gentle-orbit',
  'kinetic-sculpture': 'gentle-orbit',
  'neon-tunnel': 'slow-push',
  'paper-diorama': 'static',
};

export class BlenderAdapter {
  constructor(options = {}) {
    this.artifactDir = path.resolve(options.artifactDir ?? DEFAULT_ARTIFACT_DIR);
    this.blenderPath = options.blenderPath ?? null;
    this.ffmpegPath = options.ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg';
    this.commandRunner = options.commandRunner ?? defaultCommandRunner;
    this.videoCommandRunner = options.videoCommandRunner ?? defaultCommandRunner;
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = clampInteger(options.timeoutMs ?? 5 * 60_000, 10_000, 30 * 60_000);
  }

  async capability() {
    return probeBlenderVideo({
      blenderPath: this.blenderPath,
      ffmpegPath: this.ffmpegPath,
      commandRunner: this.commandRunner,
      videoCommandRunner: this.videoCommandRunner,
    });
  }

  async createVideo(brief) {
    const scenes = Array.isArray(brief.literalScenes) && brief.literalScenes.length
      ? brief.literalScenes
      : [{
        id: 'scene-1',
        lyric: brief.hook,
        objects: ['subject'],
        camera: 'slow-push',
        palette: 'midnight-gold',
        visualStyle: brief.renderOptions?.visualStyle ?? 'cosmic-shrine',
      }];
    return this.renderScenes({
      id: brief.id,
      scenes,
      width: 540,
      height: 960,
      samples: 16,
      durationSeconds: brief.durationSeconds ?? 20,
    });
  }

  async renderScenes(input) {
    const capability = await this.capability();
    if (!capability.ready) throw new Error(capability.blocker);

    const taskId = `blender_${safeSlug(input.id ?? 'literal-scenes')}_${this.now().getTime()}`;
    const runDir = path.join(this.artifactDir, taskId);
    const manifest = normalizeBlenderManifest(input, { runDir });
    const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
    const manifestHash = sha256(manifestJson);
    const cacheIdentity = sha256(JSON.stringify({
      runtime: capability.version,
      builder: BUILDER_VERSION,
      manifestHash,
    }));
    const manifestPath = path.join(runDir, 'scene-manifest.json');
    const resultPath = path.join(runDir, 'render.json');
    const videoPath = path.join(runDir, `${safeSlug(input.id ?? 'literal-scenes')}.mp4`);
    await mkdir(path.join(runDir, 'plates'), { recursive: true });
    await writeFile(manifestPath, manifestJson);

    const args = [
      '--background',
      '--factory-startup',
      '--disable-autoexec',
      '--python',
      BUILDER_PATH,
      '--',
      '--manifest',
      manifestPath,
    ];
    const startedAt = Date.now();
    let processResult;
    try {
      processResult = await this.commandRunner(capability.executable, args, {
        timeout: this.timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch (error) {
      throw new Error(`Blender render failed: ${sanitizeProcessError(error)}`);
    }
    const processLog = `${processResult?.stdout ?? ''}\n${processResult?.stderr ?? ''}`;
    if (/\bTraceback \(most recent call last\):|Error: Python:/i.test(processLog)) {
      throw new Error(`Blender scene builder failed: ${sanitizeLog(processLog).replace(/\s+/g, ' ').trim()}`);
    }

    const plates = [];
    for (const scene of manifest.scenes) {
      const outputPath = resolveRunPath(runDir, scene.output);
      const info = await stat(outputPath).catch(() => null);
      if (!info?.isFile() || info.size < 8) {
        throw new Error(`Blender render incomplete: missing plate ${scene.output}`);
      }
      plates.push({
        sceneId: scene.id,
        path: outputPath,
        bytes: info.size,
        sha256: sha256(await readFile(outputPath)),
      });
    }

    await encodeBlenderPlates({
      plates,
      manifest,
      videoPath,
      ffmpegPath: capability.ffmpegPath,
      commandRunner: this.videoCommandRunner,
      timeoutMs: this.timeoutMs,
    });
    const videoInfo = await stat(videoPath).catch(() => null);
    if (!videoInfo?.isFile() || videoInfo.size < 8) {
      throw new Error('Blender plate composition did not produce a playable MP4 artifact');
    }

    const durationMs = Date.now() - startedAt;
    const render = {
      provider: 'blender',
      externalTaskId: taskId,
      status: 'completed',
      videos: [videoPath],
      artifacts: plates.map((plate) => plate.path),
      durationSeconds: manifest.durationSeconds,
      proofType: 'generated_card',
      captionText: manifest.scenes[0]?.lyric ?? null,
      renderLog: [
        `blenderVersion=${capability.version}`,
        `builderVersion=${BUILDER_VERSION}`,
        `manifestHash=${manifestHash}`,
        `cacheIdentity=${cacheIdentity}`,
        `scenes=${manifest.scenes.length}`,
        `durationMs=${durationMs}`,
        'delivery=final-video',
      ],
      raw: {
        aspect: `${manifest.width}:${manifest.height}`,
        width: manifest.width,
        height: manifest.height,
        manifestPath,
        videoPath,
        manifestHash,
        cacheIdentity,
        builderVersion: BUILDER_VERSION,
        blenderVersion: capability.version,
        blenderExecutable: capability.executable,
        commandPosture: args.filter((argument) => argument !== manifestPath),
        plates,
        stdout: sanitizeLog(processResult?.stdout),
        stderr: sanitizeLog(processResult?.stderr),
      },
    };
    await writeFile(resultPath, `${JSON.stringify({ taskId, render }, null, 2)}\n`);
    return render;
  }

  async getStatus(externalTaskId) {
    const resultPath = resolveRunPath(this.artifactDir, `${externalTaskId}/render.json`);
    return JSON.parse(await readFile(resultPath, 'utf8')).render;
  }
}

export async function probeBlenderVideo(options = {}) {
  const blender = await probeBlender(options);
  if (!blender.ready) return { ...blender, ffmpegPath: options.ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg' };
  const ffmpegPath = options.ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg';
  try {
    const result = await (options.videoCommandRunner ?? defaultCommandRunner)(ffmpegPath, ['-version'], {
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    });
    const output = `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`;
    if (!/ffmpeg/i.test(output)) throw new Error('version output was not recognized');
    return { ...blender, ffmpegPath };
  } catch (error) {
    return {
      ...blender,
      ready: false,
      ffmpegPath,
      blocker: `Blender ${blender.version} is installed, but FFmpeg is unavailable: ${sanitizeProcessError(error)}`,
    };
  }
}

export async function probeBlender(options = {}) {
  const candidates = [
    options.blenderPath,
    '/Applications/Blender.app/Contents/MacOS/Blender',
    'blender',
  ].filter(Boolean);
  const commandRunner = options.commandRunner ?? defaultCommandRunner;
  const errors = [];

  for (const executable of [...new Set(candidates)]) {
    try {
      const result = await commandRunner(executable, ['--version'], {
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      });
      const text = `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`;
      const match = text.match(/\bBlender\s+(\d+)\.(\d+)(?:\.(\d+))?/i);
      if (!match) {
        errors.push(`${executable}: version output was not recognized`);
        continue;
      }
      const version = `${match[1]}.${match[2]}.${match[3] ?? '0'}`;
      const compatible = Number(match[1]) === SUPPORTED_VERSION.major
        && Number(match[2]) === SUPPORTED_VERSION.minor;
      return compatible
        ? { ready: true, executable, version, blocker: null }
        : {
          ready: false,
          executable,
          version,
          blocker: `Blender ${version} is installed; Blender 5.2.x is required.`,
        };
    } catch (error) {
      errors.push(`${executable}: ${error?.code === 'ENOENT' ? 'not found' : sanitizeProcessError(error)}`);
    }
  }

  return {
    ready: false,
    executable: null,
    version: null,
    blocker: `Blender 5.2.x is not ready. Install the Blender cask or set an explicit executable. ${errors.join(' ')}`,
  };
}

export function buildBlenderSceneManifest(input, options = {}) {
  const runDir = path.resolve(options.runDir ?? './tmp/blender-manifest');
  return normalizeBlenderManifest(input, { runDir });
}

function normalizeBlenderManifest(input = {}, options) {
  if (input.python || input.script || input.blendFile || input.addons) {
    throw new Error('Blender requests cannot include Python, scripts, .blend files, or add-ons');
  }
  if (!Array.isArray(input.scenes) || input.scenes.length < 1 || input.scenes.length > 60) {
    throw new Error('Blender manifest scenes must contain 1-60 entries');
  }
  const width = clampInteger(input.width ?? 540, 360, 1080);
  const height = clampInteger(input.height ?? 960, 640, 1920);
  const samples = clampInteger(input.samples ?? 16, 1, 64);
  const durationSeconds = clampInteger(input.durationSeconds ?? 20, 5, 90);
  const runDir = path.resolve(options.runDir);
  const scenes = input.scenes.map((scene, index) => normalizeScene(scene, index, runDir));
  return {
    schema: 'fleet.blender-literal-scenes.v1',
    builderVersion: BUILDER_VERSION,
    width,
    height,
    samples,
    durationSeconds,
    transparent: false,
    scenes,
  };
}

async function encodeBlenderPlates({ plates, manifest, videoPath, ffmpegPath, commandRunner, timeoutMs }) {
  const segmentDuration = manifest.durationSeconds / plates.length;
  const args = ['-y'];
  for (const plate of plates) args.push('-framerate', '30', '-loop', '1', '-t', String(segmentDuration), '-i', plate.path);
  args.push('-f', 'lavfi', '-t', String(manifest.durationSeconds), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  const filters = plates.map((_, index) => {
    const camera = manifest.scenes[index]?.camera ?? 'static';
    const zoom = camera === 'static' ? '1' : camera === 'gentle-orbit' ? "1.02+0.012*sin(on/24)" : "min(zoom+0.0007,1.05)";
    return `[${index}:v]scale=${manifest.width}:${manifest.height}:force_original_aspect_ratio=increase,`
      + `crop=${manifest.width}:${manifest.height},zoompan=z='${zoom}':d=1:s=${manifest.width}x${manifest.height}:fps=30,`
      + `trim=duration=${segmentDuration},setpts=PTS-STARTPTS,setsar=1[v${index}]`;
  });
  args.push(
    '-filter_complex', `${filters.join(';')};${plates.map((_, index) => `[v${index}]`).join('')}concat=n=${plates.length}:v=1:a=0[v]`,
    '-map', '[v]',
    '-map', `${plates.length}:a`,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-crf', '18',
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', '+faststart',
    '-shortest',
    videoPath,
  );
  try {
    await commandRunner(ffmpegPath, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`Blender plate composition failed: ${sanitizeProcessError(error)}`);
  }
}

function normalizeScene(scene, index, runDir) {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
    throw new Error(`Blender scene ${index + 1} must be an object`);
  }
  const id = safeSlug(scene.id ?? `scene-${index + 1}`);
  const output = `plates/${String(index + 1).padStart(3, '0')}-${id}.png`;
  resolveRunPath(runDir, output);
  const rawObjects = Array.isArray(scene.objects) ? scene.objects : ['subject'];
  const objects = [...new Set(rawObjects.flatMap(toAllowedObject))].slice(0, 8);
  if (!objects.length) objects.push('subject');
  const visualStyle = ALLOWED_VISUAL_STYLES.has(scene.visualStyle) ? scene.visualStyle : 'cosmic-shrine';
  const camera = ALLOWED_CAMERAS.has(scene.camera) ? scene.camera : STYLE_CAMERAS[visualStyle];
  const palette = ALLOWED_PALETTES.has(scene.palette) ? scene.palette : 'midnight-gold';
  return {
    id,
    cueIndex: clampInteger(scene.cueIndex ?? index, 0, 59),
    lyric: requiredString(scene.lyric ?? scene.text ?? 'Literal scene', `Blender scene ${index + 1} lyric`).slice(0, 240),
    objects,
    camera,
    palette,
    visualStyle,
    seed: stableSeed(`${id}:${scene.lyric ?? ''}`),
    output,
  };
}

function toAllowedObject(value) {
  const text = String(value ?? '').toLowerCase();
  const direct = safeSlug(text);
  if (ALLOWED_OBJECTS.has(direct)) return [direct];
  const mapped = [];
  for (const object of ALLOWED_OBJECTS) {
    if (text.includes(object) || (object === 'traveller' && text.includes('traveler'))) mapped.push(object);
  }
  return mapped;
}

function resolveRunPath(runDir, relativePath) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) {
    throw new Error('Blender output path must be relative to the run directory');
  }
  const resolved = path.resolve(runDir, relativePath);
  if (resolved !== runDir && !resolved.startsWith(`${runDir}${path.sep}`)) {
    throw new Error('Blender output path escapes the run directory');
  }
  return resolved;
}

function stableSeed(value) {
  return Number.parseInt(sha256(String(value)).slice(0, 8), 16);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeSlug(value) {
  const slug = String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) throw new Error('Blender scene id must contain letters or numbers');
  return slug.slice(0, 80);
}

function clampInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`Blender manifest value must be an integer from ${minimum} to ${maximum}`);
  }
  return number;
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function sanitizeLog(value) {
  return String(value ?? '').replaceAll(process.cwd(), '<repo>').slice(-8000);
}

function sanitizeProcessError(error) {
  return sanitizeLog(error?.stderr || error?.stdout || error?.message || error).replace(/\s+/g, ' ').trim();
}

async function defaultCommandRunner(binary, args, options) {
  return execFileAsync(binary, args, { ...options, shell: false });
}
