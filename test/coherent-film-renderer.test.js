import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  COHERENT_VISUAL_PRIMITIVES,
  assertCoherentFilmApproved,
  buildCoherentAudioPlan,
  buildCoherentCompositionHtml,
  createCoherentRenderPackage,
} from '../src/coherent-film-renderer.js';
import { coherentFilmToSrt } from '../src/coherent-scene-composition.js';
import { parseCoherentRenderArgs } from '../scripts/render-coherent-film.js';

function fixtureFilm() {
  return {
    schema: 'fleet.coherent-scene-film.v1',
    id: 'coherent-renderer-test',
    title: 'Evidence path',
    spine: 'A change becomes a qualified verdict.',
    directionId: 'evidence-beam',
    publicationTier: 'publishable',
    approval: {
      status: 'approved',
      approvedBy: 'fixture-owner',
      approvedAt: '2026-07-27T00:00:00.000Z',
    },
    format: { width: 360, height: 640, fps: 12 },
    style: { accent: '#7dffac' },
    assets: [
      {
        id: 'capture',
        kind: 'image',
        source: 'capture.png',
        sourceType: 'real-capture',
        sourceRevision: 'abc123',
        license: 'first-party',
        tier: 'production-safe',
        evidence: true,
      },
      {
        id: 'atmosphere',
        kind: 'video',
        source: 'atmosphere.mp4',
        sourceType: 'generated-atmosphere',
        license: 'first-party-generated',
        tier: 'production-safe',
      },
      {
        id: 'narration',
        kind: 'audio',
        source: 'narration.wav',
        sourceType: 'locally-generated',
        license: 'first-party-generated',
        tier: 'production-safe',
      },
      {
        id: 'bed',
        kind: 'audio',
        source: 'bed.wav',
        sourceType: 'first-party',
        license: 'first-party',
        tier: 'production-safe',
      },
      {
        id: 'transition',
        kind: 'audio',
        source: 'transition.wav',
        sourceType: 'first-party',
        license: 'first-party',
        tier: 'production-safe',
      },
    ],
    captions: [
      { start: 0.4, end: 2.2, text: 'Follow the evidence.' },
      { start: 4.2, end: 6.7, text: 'Reach a qualified verdict.' },
    ],
    audio: {
      narration: { assetId: 'narration', start: 0.25, gainDb: -1 },
      soundBed: { assetId: 'bed', gainDb: -20, duckUnderNarrationDb: 9 },
      effects: [{ assetId: 'transition', sceneId: 'verdict', gainDb: -4 }],
    },
    scenes: [
      {
        id: 'analysis',
        role: 'analysis',
        purpose: 'Connect the revision to evidence.',
        start: 0,
        end: 4,
        dominant: {
          kind: 'full-bleed-product-capture',
          assetId: 'capture',
          params: { deviceFrame: true, focusX: 0.6 },
        },
        supporting: [{ kind: 'evidence-path', assetId: 'capture' }],
        principalAction: 'The evidence path advances once.',
        cameraMove: 'Slow push.',
        transition: 'fade',
        caption: '',
      },
      {
        id: 'verdict',
        role: 'verdict',
        purpose: 'Resolve the evidence into a decision.',
        start: 4,
        end: 8,
        dominant: {
          kind: 'match-cut',
          assetId: 'atmosphere',
          params: { clipStartSeconds: 0.5, playbackRate: 0.9 },
        },
        supporting: [{ kind: 'full-bleed-product-capture', assetId: 'capture' }],
        principalAction: 'The generated beam resolves into the real capture.',
        cameraMove: 'Locked.',
        transition: 'beam-wipe',
        caption: '',
      },
    ],
  };
}

test('composition exposes the original deterministic visual primitives and timeline seam', () => {
  const film = fixtureFilm();
  const html = buildCoherentCompositionHtml(film, {
    capture: { mime: 'image/png', url: 'data:image/png;base64,eA==' },
    atmosphere: { mime: 'video/mp4', url: 'data:video/mp4;base64,eA==' },
  });

  assert.deepEqual(COHERENT_VISUAL_PRIMITIVES, [
    'full-bleed-product-capture',
    'evidence-path',
    'focus-pull',
    'mask-zoom',
    'parallax-depth',
    'match-cut',
  ]);
  assert.match(html, /window\.renderAt=async/);
  assert.match(html, /drawBrowserFrame/);
  assert.match(html, /clipStartSeconds/);
  for (const primitive of COHERENT_VISUAL_PRIMITIVES) assert.match(html, new RegExp(primitive));
  const script = html.match(/<script>([\s\S]+)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));

  const reducedHtml = buildCoherentCompositionHtml(film, {}, {
    reducedMotion: true,
  });
  assert.match(reducedHtml, /"reducedMotion":true/);
});

test('audio plan binds phrase captions, narration ducking, and scene-timed effects', () => {
  const film = fixtureFilm();
  const plan = buildCoherentAudioPlan(film);

  assert.equal(plan.narration.start, 0.25);
  assert.equal(plan.soundBed.ducking.start, 0.25);
  assert.equal(plan.soundBed.ducking.end, 8);
  assert.equal(plan.soundBed.ducking.gainDb, -29);
  assert.equal(plan.effects[0].start, 4);
  assert.match(coherentFilmToSrt(film), /00:00:00,400 --> 00:00:02,200/);
  assert.match(coherentFilmToSrt(film), /Follow the evidence\./);
});

test('render packages are collision-free and include reproducibility metadata', async () => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'coherent-film-renderer-'));
  try {
    for (const name of [
      'capture.png',
      'atmosphere.mp4',
      'narration.wav',
      'bed.wav',
      'transition.wav',
    ]) {
      await writeFile(path.join(scratch, name), `fixture:${name}`);
    }
    const manifestPath = path.join(scratch, 'film.json');
    await writeFile(manifestPath, `${JSON.stringify(fixtureFilm(), null, 2)}\n`);
    const outputRoot = path.join(scratch, 'renders');
    const frozenNow = () => new Date('2026-07-27T10:11:12.000Z');
    const first = await createCoherentRenderPackage({
      filmInput: fixtureFilm(),
      manifestPath,
      outputRoot,
      now: frozenNow,
      engineRevisions: { compositor: 'test-v1' },
    });
    const second = await createCoherentRenderPackage({
      filmInput: fixtureFilm(),
      manifestPath,
      outputRoot,
      now: frozenNow,
      engineRevisions: { compositor: 'test-v1' },
    });

    assert.notEqual(first.runDir, second.runDir);
    assert.match(second.runDir, /-02$/);
    const inputs = JSON.parse(await readFile(first.paths.inputHashes, 'utf8'));
    const licenses = JSON.parse(await readFile(first.paths.licenses, 'utf8'));
    const revisions = JSON.parse(await readFile(first.paths.engineRevisions, 'utf8'));
    const timeline = JSON.parse(await readFile(first.paths.timeline, 'utf8'));
    assert.equal(inputs.capture.sha256.length, 64);
    assert.equal(inputs.$manifest.sha256.length, 64);
    assert.equal(licenses.capture.sourceRevision, 'abc123');
    assert.equal(revisions.compositor, 'test-v1');
    assert.equal(timeline.scenes.length, 2);
    assert.match(first.narrationSource, /audio\/narration\.wav$/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('renderer requires explicit approval and CLI remains opt-in', () => {
  const film = fixtureFilm();
  delete film.approval;
  assert.throws(() => assertCoherentFilmApproved(film), /approval\.status="approved"/);
  assert.throws(() => parseCoherentRenderArgs([]), /--manifest is required/);
  assert.equal(parseCoherentRenderArgs(['--help']).help, true);
  assert.equal(
    parseCoherentRenderArgs(['--manifest', './film.json']).manifestPath,
    path.resolve('./film.json'),
  );
  assert.equal(
    parseCoherentRenderArgs(['--manifest', './film.json', '--reduced-motion']).reducedMotion,
    true,
  );
});
