#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { producePostReadyVideo } from '../src/post-ready/production.js';
import { applyPostReadyVoiceOverride, POST_READY_VOICE_CATALOG } from '../src/post-ready/voices.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parsePostReadyArgs(argv) {
  const options = {
    outputRoot: path.join(ROOT, '.reel-pipeline', 'post-ready'),
    runtimeOptions: {},
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--list-voices') options.listVoices = true;
    const value = argv[index + 1];
    if (argument === '--brief') options.briefPath = path.resolve(value), index += 1;
    else if (argument === '--output-root') options.outputRoot = path.resolve(value), index += 1;
    else if (argument === '--review') options.reviewPath = path.resolve(value), index += 1;
    else if (argument === '--kokoro-dir') options.runtimeOptions.kokoroDir = path.resolve(value), index += 1;
    else if (argument === '--video-runtime-root') options.runtimeOptions.videoRuntimeRoot = path.resolve(value), index += 1;
    else if (argument === '--video-model-root') options.runtimeOptions.videoModelRoot = path.resolve(value), index += 1;
    else if (argument === '--ffmpeg') options.runtimeOptions.ffmpegPath = value, index += 1;
    else if (argument === '--ffprobe') options.runtimeOptions.ffprobePath = value, index += 1;
    else if (argument === '--voice') options.voice = value, index += 1;
    else if (argument === '--voice-speed') options.voiceSpeed = Number(value), index += 1;
    else if (argument !== '--list-voices') throw new Error(`unknown argument: ${argument}`);
  }
  if (!options.briefPath && !options.listVoices) throw new Error('--brief is required');
  return options;
}

function help() {
  return `Usage: npm run render:post-ready -- --brief <brief.json> [options]\n\nOptions:\n  --list-voices               Print the curated voice catalog\n  --voice <id>                Override the brief's Kokoro voice\n  --voice-speed <0.75-1.25>   Override narration speed\n  --output-root <dir>         Ignored local output root\n  --review <review.json>      Optional explicit editorial review\n  --kokoro-dir <dir>          Shared Kokoro model/runtime directory\n  --video-runtime-root <dir>  Optional local video runtime root\n  --video-model-root <dir>    Optional local video model root\n  --ffmpeg <path>             FFmpeg command or path\n  --ffprobe <path>            FFprobe command or path\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parsePostReadyArgs(argv);
  if (options.help) {
    console.log(help());
    return;
  }
  if (options.listVoices) {
    console.log(JSON.stringify({ schema: 'fleet.post-ready-voice-catalog.v1', voices: POST_READY_VOICE_CATALOG }, null, 2));
    if (!options.briefPath) return;
  }
  const storedBrief = JSON.parse(await readFile(options.briefPath, 'utf8'));
  const briefInput = applyPostReadyVoiceOverride(storedBrief, { voice: options.voice, speed: options.voiceSpeed });
  const editorialReviewInput = options.reviewPath
    ? JSON.parse(await readFile(options.reviewPath, 'utf8'))
    : null;
  const result = await producePostReadyVideo({
    briefInput,
    briefPath: options.briefPath,
    outputRoot: options.outputRoot,
    runtimeOptions: options.runtimeOptions,
    editorialReviewInput,
  });
  console.log(JSON.stringify({
    runDir: result.runDir,
    video: result.paths.video,
    contactSheet: result.paths.contactSheet,
    receipt: result.receiptPath,
    technicalStatus: result.receipt.technicalStatus,
    editorialStatus: result.receipt.editorialStatus,
    postReady: result.receipt.postReady,
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    if (error.receiptPath) console.error(`Receipt: ${error.receiptPath}`);
    process.exitCode = 1;
  });
}
