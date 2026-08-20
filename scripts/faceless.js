#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { runFacelessWorkflow, runBatch } from '../src/studio/workflow.js';

const USAGE = `Usage: npm run faceless -- --topic "..." [flags]
       npm run faceless -- --topics-file topics.txt [flags]

Flags:
  --topic <topic>          Single topic to turn into a faceless video
  --topics-file <file>     Batch: one topic per line, or a JSON array
  --niche <niche>          Channel niche for metadata generation
  --duration <seconds>     Target duration, 30-1200 (default 60)
  --engine <mode>          mock | kokoro (default mock)
                           kokoro = fully local: Kokoro voice + Pexels b-roll
                           + FFmpeg (run npm run setup:kokoro once first)
  --voice <voice>          TTS voice id (default en-US-AriaNeural-Female)
  --voice-rotation         Opt in to per-scene voice rotation (off by default)
  --voice-profile <file>   JSON brand-voice profile from "npm run studio -- voice"
  --out <dir>              Output dir (default ./tmp/studio/faceless)
  --post-handoff           Print the Postiz draft handoff command after render

The workflow never posts automatically. Approved content packages and media
receipts are handed to Postiz with "npm run distribution -- --provider postiz".`;

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return flags;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help || (!flags.topic && !flags['topics-file'])) {
    console.log(USAGE);
    if (!flags.help) process.exit(1);
    return;
  }

  const voiceProfile = flags['voice-profile']
    ? JSON.parse(await readFile(flags['voice-profile'], 'utf8'))
    : undefined;

  const shared = {
    niche: typeof flags.niche === 'string' ? flags.niche : undefined,
    durationSeconds: flags.duration ? Number(flags.duration) : undefined,
    engine: typeof flags.engine === 'string' ? flags.engine : 'mock',
    voice: typeof flags.voice === 'string' ? flags.voice : undefined,
    voiceRotation: Boolean(flags['voice-rotation']),
    voiceProfile,
    outputDir: typeof flags.out === 'string' ? flags.out : undefined,
    postHandoff: Boolean(flags['post-handoff']),
  };

  const result = flags['topics-file']
    ? await runBatch({ ...shared, topicsFile: flags['topics-file'] })
    : await runFacelessWorkflow({ ...shared, topic: flags.topic });

  console.log(JSON.stringify(result, null, 2));
  if (flags['topics-file'] && result.failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
