import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { buildSrt, renderLyricVideo } from '../src/lyric-video/compositor.js';

const root = path.resolve('./tmp/lyric-compositor-test');
const audioPath = path.join(root, 'fixture.wav');
const brief = {
  id: 'brief-lyric-compositor',
  kind: 'lyric-video',
  title: 'Literal stars',
  lyric: {
    audioPath,
    audioDurationMs: 5000,
    timedLyrics: '[00:00.00]A bright star\n[00:02.50]Above the world',
    attribution: 'Operator-owned words and original recording.',
    rights: {
      composition: 'owned',
      master: 'original-recording',
      evidence: 'Fixture rights record.',
    },
    useBlender: true,
  },
};

function fakeBlender() {
  return {
    capability: async () => ({
      ready: true,
      version: '5.2.0',
      executable: '/fixture/blender',
      blocker: null,
    }),
    renderScenes: async ({ scenes }) => {
      const plates = [];
      for (const [index, scene] of scenes.entries()) {
        const filePath = path.join(root, `plate-${index + 1}.png`);
        await writeFile(filePath, Buffer.from(`plate-${scene.id}`));
        plates.push({ sceneId: scene.id, path: filePath, bytes: 16, sha256: 'a'.repeat(64) });
      }
      return {
        provider: 'blender',
        raw: {
          blenderVersion: '5.2.0',
          blenderExecutable: '/fixture/blender',
          builderVersion: 'literal-scene-builder-v1',
          manifestHash: 'b'.repeat(64),
          plates,
        },
      };
    },
  };
}

function fakeCommandRunner(calls) {
  return async (binary, args) => {
    calls.push({ binary, args: [...args] });
    if (binary.includes('ffprobe')) {
      return {
        stdout: JSON.stringify({
          format: { duration: '5.000' },
          streams: [{ codec_type: 'audio' }, { codec_type: 'video' }],
        }),
      };
    }
    const output = args.at(-1);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, Buffer.from(`media-${path.basename(output)}`));
    return { stdout: '', stderr: '' };
  };
}

test('SRT output preserves exact lyric text and millisecond timing', () => {
  assert.equal(buildSrt([
    { startMs: 0, endMs: 2500, text: 'Exact first line' },
    { startMs: 2500, endMs: 5000, text: 'Exact second line' },
  ]), [
    '1',
    '00:00:00,000 --> 00:00:02,500',
    'Exact first line',
    '',
    '2',
    '00:00:02,500 --> 00:00:05,000',
    'Exact second line',
    '',
  ].join('\n'));
});

test('lyric render requires explicit confirmation before media work', async () => {
  await assert.rejects(() => renderLyricVideo(brief, { artifactDir: root }), /explicit confirmation/);
});

test('lyric compositor produces standard artifacts, provenance, and quality evidence', async () => {
  await mkdir(root, { recursive: true });
  await writeFile(audioPath, Buffer.alloc(64, 1));
  const calls = [];
  const frameRenderer = async (inputs) => {
    for (const input of inputs) await writeFile(input.outputPath, Buffer.from(`frame-${input.cue.text}`));
  };
  const render = await renderLyricVideo(brief, {
    confirm: true,
    artifactDir: path.join(root, 'artifacts'),
    blenderAdapter: fakeBlender(),
    commandRunner: fakeCommandRunner(calls),
    frameRenderer,
    now: () => new Date('2026-07-31T00:00:00Z'),
  });
  assert.equal(render.provider, 'lyric-video-local');
  assert.equal(render.status, 'completed');
  assert.equal(render.raw.quality.cueCoverage, 1);
  assert.equal(render.raw.quality.exactLyricText, true);
  assert.equal(render.raw.quality.audioPresent, true);
  assert.equal(render.raw.blender.version, '5.2.0');
  assert.equal(render.raw.artifacts.audio.sha256.length, 64);
  assert.equal(render.raw.artifacts.video.sha256.length, 64);
  assert.ok(calls.some((call) => call.args.some((arg) => String(arg).includes('zoompan='))));
  const manifest = JSON.parse(await readFile(render.raw.manifestPath, 'utf8'));
  assert.equal(manifest.rights.composition, 'owned');
  assert.equal(manifest.rights.independentlyVerified, false);
  assert.equal(manifest.lyric.scenePlan.length, 2);
});
