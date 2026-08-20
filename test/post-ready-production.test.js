import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { POST_READY_SCHEMA, normalizePostReadyBrief } from '../src/post-ready/contract.js';
import { resolvePostReadyVisuals } from '../src/post-ready/production.js';
import { parsePostReadyArgs } from '../scripts/render-post-ready-video.js';
import { applyPostReadyVoiceOverride, POST_READY_VOICE_CATALOG } from '../src/post-ready/voices.js';

function plan(source, fallback = null) {
  const sceneRows = [
    ['a', 'setup', 'Start here.'],
    ['b', 'analysis', 'See the change.'],
    ['c', 'proof', 'Watch the proof.'],
    ['d', 'verdict', 'Keep the signal.'],
    ['e', 'close', 'Finish here.'],
  ];
  return normalizePostReadyBrief({
    schema: POST_READY_SCHEMA,
    id: 'visual-test', title: 'Visual test', hook: 'Start here.', closingBeat: 'Finish here.', musicIntent: 'Restrained pulse.',
    approval: { status: 'approved', approvedBy: 'test', approvedAt: '2026-08-03T00:00:00Z' },
    narration: { mode: 'kokoro', voice: 'af_heart' }, music: { mode: 'generated', mood: 'restrained' },
    scenes: sceneRows.map(([id, role, narration], index) => ({
      id, role, narration, caption: narration, durationSeconds: 4, purpose: `Purpose ${id}`, transition: 'fade',
      visual: {
        kind: index === 0 ? 'video' : 'image', source, sourceType: 'project-owned', license: 'Fleet-owned', tier: 'production-safe', motion: index === 0 ? 'match-cut' : 'slow-push',
        ...(fallback ? { fallback: { source: fallback, sourceType: 'project-owned', license: 'Fleet-owned', tier: 'production-safe', motion: 'slow-push' } } : {}),
      },
    })),
  });
}

test('missing optional video uses a designed image fallback and records it', async () => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'post-ready-visual-'));
  try {
    await writeFile(path.join(scratch, 'fallback.png'), 'image');
    const resolved = await resolvePostReadyVisuals(plan('missing.mp4', 'fallback.png'), { sourceRoot: scratch });
    assert.equal(resolved[0].fallbackUsed, true);
    assert.equal(resolved[0].kind, 'image');
    assert.equal(resolved[0].motion, 'slow-push');
    assert.equal(resolved.every((entry) => entry.fallbackUsed), true);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('CLI requires one brief and preserves explicit runtime roots', () => {
  assert.throws(() => parsePostReadyArgs([]), /--brief is required/);
  const parsed = parsePostReadyArgs(['--brief', 'brief.json', '--kokoro-dir', '../shared/kokoro', '--voice', 'af_bella', '--voice-speed', '1.04']);
  assert.match(parsed.briefPath, /brief\.json$/);
  assert.match(parsed.runtimeOptions.kokoroDir, /shared\/kokoro$/);
  assert.equal(parsed.voice, 'af_bella');
  assert.equal(parsed.voiceSpeed, 1.04);
  assert.equal(parsePostReadyArgs(['--list-voices']).listVoices, true);
});

test('curated voice catalog supports explicit friendly and poppy selection', () => {
  assert.equal(new Set(POST_READY_VOICE_CATALOG.map(({ id }) => id)).size, POST_READY_VOICE_CATALOG.length);
  assert.match(POST_READY_VOICE_CATALOG.find(({ id }) => id === 'af_bella').character, /Bright/);
  const overridden = applyPostReadyVoiceOverride(plan('visual.png'), { voice: 'af_bella', speed: 1.04 });
  assert.equal(overridden.narration.voice, 'af_bella');
  assert.equal(overridden.narration.speed, 1.04);
  assert.throws(() => applyPostReadyVoiceOverride(plan('visual.png'), { voice: 'unknown' }), /voice must be one of/);
});
