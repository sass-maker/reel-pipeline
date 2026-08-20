import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { prepareNarration } from '../src/post-ready/audio.js';
import { POST_READY_SCHEMA, normalizePostReadyBrief } from '../src/post-ready/contract.js';

function plan() {
  return normalizePostReadyBrief({
    schema: POST_READY_SCHEMA,
    id: 'audio-test',
    title: 'Audio test',
    hook: 'Hear this.',
    closingBeat: 'End clearly.',
    musicIntent: 'A restrained bed.',
    approval: { status: 'approved', approvedBy: 'test', approvedAt: '2026-08-03T00:00:00Z' },
    narration: { mode: 'kokoro', voice: 'af_heart', speed: 1 },
    music: { mode: 'generated', mood: 'restrained' },
    scenes: [
      ['a', 'setup', 'Hear this.'],
      ['b', 'analysis', 'One clear point.'],
      ['c', 'proof', 'Then the evidence.'],
      ['d', 'verdict', 'Now the decision.'],
      ['e', 'close', 'End clearly.'],
    ].map(([id, role, narration]) => ({
      id, role, narration, caption: narration, durationSeconds: 4,
      purpose: `Purpose ${id}`, transition: 'fade',
      visual: { kind: 'image', source: `${id}.png`, sourceType: 'project-owned', license: 'Fleet-owned', tier: 'production-safe', motion: 'slow-push' },
    })),
  });
}

test('missing Kokoro runtime blocks narration instead of producing fake audio', async () => {
  const runDir = await mkdtemp(path.join(os.tmpdir(), 'post-ready-audio-'));
  try {
    await assert.rejects(
      () => prepareNarration({
        plan: plan(), runDir, sourceRoot: runDir,
        runtime: { kokoroDir: path.join(runDir, 'missing-kokoro'), ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' },
      }),
      /Kokoro narration is required but unavailable/,
    );
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});
