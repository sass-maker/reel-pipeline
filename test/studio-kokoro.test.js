import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { KokoroTts, isKokoroReady, normalizeKokoroVoice } from '../src/adapters/kokoro.js';
import {
  KokoroComposeAdapter,
  probeKokoroComposeReadiness,
  resolvePexelsKey,
} from '../src/adapters/kokoro-compose.js';
import { resolveTtsSynthesizer } from '../src/lesson-pipeline.js';
import { StudioLlm } from '../src/studio/llm.js';
import { generateScript } from '../src/studio/script.js';
import { scriptToBrief } from '../src/studio/workflow.js';
import { createRenderer } from '../src/pipeline.js';

const offlineLlm = new StudioLlm({ apiKey: '' });

const SCENES = [
  { narration: 'First line.', brollQuery: 'coffee' },
  { narration: '', brollQuery: 'espresso' },
  { narration: 'Third line.', brollQuery: 'latte' },
];

test('kokoro tts batches non-empty scenes through one runner call', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kokoro-tts-'));
  const calls = [];
  const tts = new KokoroTts({
    runner: async (payload) => {
      calls.push(payload);
      for (const scene of payload.scenes) await writeFile(scene.outPath, 'RIFFfake');
      return '';
    },
  });
  const result = await tts.synthesizeScenes(SCENES, { outputDir: dir, skipReadyCheck: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].scenes.length, 2);
  assert.equal(calls[0].voice, 'af_heart');
  assert.equal(result.length, 3);
  assert.equal(result[1].path, null);
  assert.ok(result[0].byteLength > 0);
});

test('non-kokoro voice names fall back to the kokoro default', () => {
  assert.equal(normalizeKokoroVoice('af_heart'), 'af_heart');
  assert.equal(normalizeKokoroVoice('am_adam'), 'am_adam');
  assert.equal(normalizeKokoroVoice('en-US-AriaNeural-Female', 'af_heart'), 'af_heart');
  assert.equal(normalizeKokoroVoice(undefined, 'af_heart'), 'af_heart');
});

test('isKokoroReady returns false for a missing install dir', () => {
  assert.equal(isKokoroReady('/nonexistent/kokoro'), false);
});

test('lesson tts provider selection honours explicit provider', () => {
  const kokoroSynth = resolveTtsSynthesizer({ ttsProvider: 'kokoro' });
  const elevenSynth = resolveTtsSynthesizer({ ttsProvider: 'elevenlabs' });
  assert.equal(typeof kokoroSynth, 'function');
  assert.equal(typeof elevenSynth, 'function');
  assert.notEqual(kokoroSynth, elevenSynth);
  assert.throws(() => resolveTtsSynthesizer({ ttsProvider: 'bogus' }), /unsupported LESSON_TTS_PROVIDER/);
});

test('resolvePexelsKey reads only the explicit environment variable', async (t) => {
  const original = process.env.PEXELS_API_KEY;
  t.after(() => {
    if (original === undefined) delete process.env.PEXELS_API_KEY;
    else process.env.PEXELS_API_KEY = original;
  });
  process.env.PEXELS_API_KEY = 'env-key';
  assert.equal(resolvePexelsKey(), 'env-key');
  delete process.env.PEXELS_API_KEY;
  assert.equal(resolvePexelsKey(), null);
});

test('kokoro compose readiness includes model, Pexels, and drawtext requirements', () => {
  assert.deepEqual(probeKokoroComposeReadiness({ kokoroReady: false }), {
    ready: false,
    blocker: 'Install the local Kokoro model with `npm run setup:kokoro`.',
  });
  assert.deepEqual(probeKokoroComposeReadiness({ kokoroReady: true, pexelsReady: false }), {
    ready: false,
    blocker: 'Configure a Pexels key before using local narrated video.',
  });
  assert.deepEqual(probeKokoroComposeReadiness({ kokoroReady: true, pexelsReady: true, ffmpegReady: false }), {
    ready: false,
    blocker: 'Install an FFmpeg build with the drawtext filter before using local narrated video.',
  });
  assert.deepEqual(probeKokoroComposeReadiness({ kokoroReady: true, pexelsReady: true, ffmpegReady: true }), {
    ready: true,
    blocker: null,
  });
});

test('kokoro compose adapter runs tts, broll, and composer in order', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kokoro-compose-'));
  const script = await generateScript({ topic: 'test topic', durationSeconds: 60, llm: offlineLlm });
  const order = [];
  const adapter = new KokoroComposeAdapter({
    script,
    artifactDir: dir,
    pexelsApiKey: 'stub-key',
    tts: {
      synthesizeScenes: async (scenes, options) => {
        order.push('tts');
        return scenes.map((_, index) => ({ sceneIndex: index, path: `${options.outputDir}/s${index}.wav`, byteLength: 10 }));
      },
    },
    fetchScenebRoll: async (scenes) => {
      order.push('broll');
      return scenes.map((_, index) => ({ sceneIndex: index, path: `/clips/c${index}.mp4` }));
    },
    composeLesson: async ({ outputPath }) => {
      order.push('compose');
      return { outputPath, durationSeconds: 60 };
    },
  });
  const { brief } = scriptToBrief(script, { engine: 'kokoro' });
  const result = await adapter.createVideo(brief);
  assert.deepEqual(order, ['tts', 'broll', 'compose']);
  assert.equal(result.provider, 'kokoro');
  assert.equal(result.status, 'completed');
  assert.match(result.videos[0], /video\.mp4$/);
});

test('kokoro compose adapter fails actionably without a script or key', async () => {
  const bare = new KokoroComposeAdapter({});
  await assert.rejects(() => bare.createVideo({ id: 'x' }), /faceless workflow/);
  const script = await generateScript({ topic: 'test topic', llm: offlineLlm });
  const noKey = new KokoroComposeAdapter({
    script,
    readyCheck: () => true,
    pexelsApiKey: null,
    tts: { synthesizeScenes: async () => [] },
  });
  const original = process.env.PEXELS_API_KEY;
  delete process.env.PEXELS_API_KEY;
  try {
    // point the fallback at nothing by testing resolvePexelsKey behaviour separately;
    // adapter with no key resolvable throws the actionable error
    if (resolvePexelsKey() === null) {
      await assert.rejects(() => noKey.createVideo({ id: 'x' }), /Pexels/);
    }
  } finally {
    if (original !== undefined) process.env.PEXELS_API_KEY = original;
  }
});

test('createRenderer knows the kokoro mode and brief contract accepts it', async () => {
  const script = await generateScript({ topic: 'renderer wiring', llm: offlineLlm });
  const renderer = createRenderer('kokoro', { kokoroCompose: { script } });
  assert.ok(renderer instanceof KokoroComposeAdapter);
  const { brief } = scriptToBrief(script, { engine: 'kokoro' });
  assert.equal(brief.renderMode, 'kokoro');
});
