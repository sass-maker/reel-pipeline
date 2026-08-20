#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { renderCoherentFilm } from '../src/coherent-film-renderer.js';

function usage() {
  return `Usage: npm run forge:coherent -- --manifest PATH [options]

Render one approved coherent-scene JSON manifest locally with Canvas, Playwright,
and FFmpeg. The command allocates a new output directory and never overwrites a
completed render.

Options:
  --manifest PATH  Approved coherent scene JSON manifest (required)
  --output PATH    Output root (default: .reel-pipeline/coherent-films)
  --chrome PATH    Optional Chrome/Chromium executable
  --ffmpeg PATH    Optional FFmpeg executable (default: FFMPEG_PATH or ffmpeg)
  --reduced-motion Render the approved direct-cut/crossfade fallback
  --help            Show this help`;
}

export function parseCoherentRenderArgs(argv) {
  const options = {
    manifestPath: null,
    outputRoot: path.resolve('.reel-pipeline', 'coherent-films'),
    chromeExecutablePath: null,
    ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
    reducedMotion: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      options.help = true;
      continue;
    }
    if (argument === '--reduced-motion') {
      options.reducedMotion = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
    if (argument === '--manifest') options.manifestPath = path.resolve(value);
    else if (argument === '--output') options.outputRoot = path.resolve(value);
    else if (argument === '--chrome') options.chromeExecutablePath = path.resolve(value);
    else if (argument === '--ffmpeg') options.ffmpegPath = value;
    else throw new Error(`unknown argument: ${argument}`);
    index += 1;
  }
  if (!options.help && !options.manifestPath) throw new Error('--manifest is required');
  return options;
}

export async function runCoherentRenderCommand(argv) {
  const options = parseCoherentRenderArgs(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return null;
  }
  const filmInput = JSON.parse(await readFile(options.manifestPath, 'utf8'));
  const result = await renderCoherentFilm({
    filmInput,
    manifestPath: options.manifestPath,
    outputRoot: options.outputRoot,
    chromeExecutablePath: options.chromeExecutablePath,
    ffmpegPath: options.ffmpegPath,
    reducedMotion: options.reducedMotion,
  });
  process.stdout.write(`${JSON.stringify({
    runDir: result.runDir,
    video: result.paths.video,
    captions: result.paths.captions,
    timeline: result.paths.timeline,
    licenses: result.paths.licenses,
    inputHashes: result.paths.inputHashes,
    outputHashes: result.paths.outputHashes,
    review: result.directories.review,
    frameCount: result.frameCount,
    reducedMotion: options.reducedMotion,
  }, null, 2)}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCoherentRenderCommand(process.argv.slice(2)).catch((error) => {
    console.error(`[forge:coherent] ${error.stack ?? error.message}`);
    process.exitCode = 1;
  });
}
