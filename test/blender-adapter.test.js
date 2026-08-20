import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  BlenderAdapter,
  buildBlenderSceneManifest,
  probeBlender,
} from '../src/adapters/blender.js';
import { createRenderer } from '../src/pipeline.js';
import { normalizeVideoBrief } from '../src/video-brief.js';

function fixtureRunner(calls) {
  return async (binary, args) => {
    calls.push({ binary, args: [...args] });
    if (args.includes('--version')) return { stdout: 'Blender 5.2.0\n', stderr: '' };
    const manifestPath = args.at(-1);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    for (const scene of manifest.scenes) {
      const plate = path.resolve(path.dirname(manifestPath), scene.output);
      await mkdir(path.dirname(plate), { recursive: true });
      await writeFile(plate, Buffer.from('fixture-png'));
    }
    return { stdout: 'FLEET_BLENDER_PROGRESS scene-1 plates/001-scene-1.png\n', stderr: '' };
  };
}

function fixtureVideoRunner(calls) {
  return async (binary, args) => {
    calls.push({ binary, args: [...args] });
    if (args.includes('-version')) return { stdout: 'ffmpeg version 7.1\n', stderr: '' };
    await writeFile(args.at(-1), Buffer.from('fixture-video'));
    return { stdout: '', stderr: '' };
  };
}

const scenes = [
  {
    id: 'star-cue',
    cueIndex: 0,
    lyric: 'Twinkle, twinkle, little star',
    objects: ['bright stars'],
    camera: 'slow-push',
    palette: 'midnight-gold',
  },
  {
    id: 'diamond-cue',
    cueIndex: 1,
    lyric: 'Like a diamond in the sky',
    objects: ['a cut diamond', 'the open night sky'],
    camera: 'gentle-orbit',
    palette: 'blue-silver',
  },
];

test('Blender capability reports exact compatible runtime', async () => {
  const calls = [];
  const capability = await probeBlender({
    blenderPath: '/fixture/blender',
    commandRunner: fixtureRunner(calls),
  });
  assert.deepEqual(capability, {
    ready: true,
    executable: '/fixture/blender',
    version: '5.2.0',
    blocker: null,
  });
  assert.deepEqual(calls[0], { binary: '/fixture/blender', args: ['--version'] });
});

test('Blender scene manifest allows bounded literal objects and rejects code', () => {
  const manifest = buildBlenderSceneManifest({ id: 'fixture', scenes }, { runDir: '/tmp/blender-fixture' });
  assert.equal(manifest.schema, 'fleet.blender-literal-scenes.v1');
  assert.deepEqual(manifest.scenes[0].objects, ['star']);
  assert.deepEqual(manifest.scenes[1].objects, ['diamond']);
  assert.match(manifest.scenes[0].output, /^plates\//);
  assert.throws(
    () => buildBlenderSceneManifest({ scenes, python: 'print(1)' }, { runDir: '/tmp/blender-fixture' }),
    /cannot include Python/,
  );
  assert.throws(
    () => buildBlenderSceneManifest({ scenes: [] }, { runDir: '/tmp/blender-fixture' }),
    /1-60 entries/,
  );
});

test('Blender visual styles select distinct bounded scene directions', () => {
  const manifest = buildBlenderSceneManifest({
    id: 'style-fixture',
    scenes: [
      { id: 'cosmic', lyric: 'A bright signal appears.', objects: ['star'], visualStyle: 'cosmic-shrine' },
      { id: 'paper', lyric: 'The signal becomes a paper world.', objects: ['subject'], visualStyle: 'paper-diorama' },
    ],
  }, { runDir: '/tmp/blender-style-fixture' });
  assert.equal(manifest.builderVersion, 'literal-scene-builder-v2');
  assert.equal(manifest.scenes[0].visualStyle, 'cosmic-shrine');
  assert.equal(manifest.scenes[0].camera, 'gentle-orbit');
  assert.equal(manifest.scenes[1].visualStyle, 'paper-diorama');
  assert.equal(manifest.scenes[1].camera, 'static');
});

test('Blender adapter smoke proves safe command posture and artifact provenance', async () => {
  const calls = [];
  const videoCalls = [];
  const adapter = new BlenderAdapter({
    artifactDir: './tmp/blender-adapter-test',
    blenderPath: '/fixture/blender',
    commandRunner: fixtureRunner(calls),
    videoCommandRunner: fixtureVideoRunner(videoCalls),
    now: () => new Date('2026-07-31T00:00:00Z'),
  });
  const render = await adapter.renderScenes({
    id: 'literal-stars',
    scenes,
    width: 540,
    height: 960,
    samples: 8,
    durationSeconds: 12,
  });
  assert.equal(render.status, 'completed');
  assert.equal(render.provider, 'blender');
  assert.equal(render.raw.blenderVersion, '5.2.0');
  assert.equal(render.raw.builderVersion, 'literal-scene-builder-v2');
  assert.equal(render.raw.plates.length, 2);
  assert.equal(render.videos.length, 1);
  assert.equal(render.durationSeconds, 12);
  assert.ok(render.raw.plates.every((plate) => plate.bytes > 0 && plate.sha256.length === 64));
  const renderCall = calls[1];
  assert.equal(renderCall.binary, '/fixture/blender');
  assert.ok(renderCall.args.includes('--background'));
  assert.ok(renderCall.args.includes('--factory-startup'));
  assert.ok(renderCall.args.includes('--disable-autoexec'));
  assert.ok(renderCall.args.includes('--python'));
  assert.match(renderCall.args[renderCall.args.indexOf('--python') + 1], /literal_scene_builder\.py$/);
  assert.deepEqual(videoCalls[0].args, ['-version']);
  assert.equal(videoCalls[1].binary, 'ffmpeg');
  assert.match(videoCalls[1].args.at(-1), /literal-stars\.mp4$/);
});

test('Blender renderer is registered behind the existing adapter factory', () => {
  const renderer = createRenderer('blender', {
    blender: {
      blenderPath: '/fixture/blender',
      commandRunner: fixtureRunner([]),
      videoCommandRunner: fixtureVideoRunner([]),
    },
  });
  assert.equal(renderer.constructor.name, 'BlenderAdapter');
  const brief = normalizeVideoBrief({
    id: 'blender-brief',
    projectSlug: 'reel-pipeline',
    channel: 'youtube_shorts',
    title: 'Literal scene',
    hook: 'A star is visibly shining.',
    body: 'Script: a star shines. Shot list: star. Captions: star. Asset prompts: literal star.',
    renderMode: 'blender',
  });
  assert.equal(brief.renderMode, 'blender');
});
