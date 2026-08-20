import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { createFfmpegRunner } from './composer/ffmpeg.js';

const PROFILES = {
  preview: {
    width: 720,
    height: 1280,
    crf: 23,
    preset: 'medium',
    label: 'guided-preview',
  },
  final: {
    width: 1080,
    height: 1920,
    crf: 17,
    preset: 'slow',
    label: 'guided-final',
  },
};

export function guidedAppDemoRenderProfile(renderKind) {
  const profile = PROFILES[renderKind];
  if (!profile) throw new Error(`unsupported guided app-demo render kind: ${renderKind}`);
  return structuredClone(profile);
}

export function buildGuidedAppDemoFfmpegArgs(input) {
  const inputPath = requiredString(input.inputPath, 'inputPath');
  const outputPath = requiredString(input.outputPath, 'outputPath');
  const profile = guidedAppDemoRenderProfile(input.renderKind);
  const hasAudio = input.hasAudio !== false;
  const videoFilter = [
    `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease`,
    `pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2:color=0x07111f`,
    'fps=24',
    'setsar=1',
  ].join(',');

  return [
    '-y',
    '-i',
    inputPath,
    ...(hasAudio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']),
    '-map',
    '0:v:0',
    '-map',
    hasAudio ? '0:a:0' : '1:a:0',
    '-vf',
    videoFilter,
    '-c:v',
    'libx264',
    '-preset',
    profile.preset,
    '-crf',
    String(profile.crf),
    '-pix_fmt',
    'yuv420p',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-colorspace',
    'bt709',
    ...(hasAudio ? ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11'] : []),
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-shortest',
    '-movflags',
    '+faststart',
    outputPath,
  ];
}

export async function renderGuidedAppDemoCapture(input, options = {}) {
  const inputPath = path.resolve(requiredString(input.inputPath, 'inputPath'));
  const outputPath = path.resolve(requiredString(input.outputPath, 'outputPath'));
  const renderKind = requiredString(input.renderKind, 'renderKind');
  const runner = options.runner ?? createFfmpegRunner(options.ffmpegOptions);
  const hasAudio = options.hasAudio ?? await runner.probeHasAudioStream(inputPath);
  const args = buildGuidedAppDemoFfmpegArgs({
    inputPath,
    outputPath,
    renderKind,
    hasAudio,
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  const startedAt = Date.now();
  await runner.runFfmpeg(args);
  return {
    outputPath,
    renderKind,
    profile: guidedAppDemoRenderProfile(renderKind),
    hasAudio,
    renderDurationMs: Date.now() - startedAt,
  };
}

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}
