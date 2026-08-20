import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COHERENT_SCENE_SCHEMA,
  coherentFilmToSrt,
  coherentSceneAt,
  normalizeCoherentFilm,
} from '../src/coherent-scene-composition.js';

function validFilm(overrides = {}) {
  return {
    schema: COHERENT_SCENE_SCHEMA,
    id: 'codevetter-evidence-beam',
    title: 'Ship with evidence',
    spine: 'Uncertain code is isolated, tested, and resolved into one verdict.',
    directionId: 'evidence-beam',
    publicationTier: 'publishable',
    format: { width: 1080, height: 1920, fps: 24 },
    style: { palette: 'codevetter-evidence' },
    assets: [
      {
        id: 'review-capture',
        kind: 'image',
        source: 'captures/review.png',
        sourceType: 'real-capture',
        sourceRevision: 'abc123',
        license: 'project-owned',
        tier: 'production-safe',
        evidence: true,
      },
      {
        id: 'evidence-path',
        kind: 'svg',
        source: 'generated:evidence-path',
        sourceType: 'deterministic-graphic',
        license: 'project-owned',
        tier: 'production-safe',
      },
    ],
    scenes: [
      {
        id: 'isolate-risk',
        role: 'tension',
        purpose: 'Isolate one risky change from undifferentiated code.',
        start: 0,
        end: 3,
        dominant: { kind: 'product-capture', assetId: 'review-capture' },
        supporting: [{ kind: 'evidence-path', assetId: 'evidence-path' }],
        principalAction: 'risk line isolates',
        cameraMove: 'slow push',
        transition: 'focus-pull',
        spokenLine: 'AI can write a lot of code.',
        caption: 'AI can write a lot of code.',
      },
      {
        id: 'qualified-verdict',
        role: 'verdict',
        purpose: 'Resolve the evidence path into one qualified decision.',
        start: 3,
        end: 6,
        dominant: { kind: 'product-capture', assetId: 'review-capture' },
        supporting: [],
        principalAction: 'verdict resolves',
        cameraMove: 'locked',
        transition: 'match-cut',
        spokenLine: 'Ship with evidence.',
        caption: 'Ship with evidence.',
      },
    ],
    ...overrides,
  };
}

test('normalizes a coherent story-first film and emits phrase captions', () => {
  const film = normalizeCoherentFilm(validFilm());

  assert.equal(film.totalDurationSeconds, 6);
  assert.equal(coherentSceneAt(film, 3.2).id, 'qualified-verdict');
  assert.match(coherentFilmToSrt(film), /Ship with evidence\./);
});

test('requires a contiguous scene timeline beginning at zero', () => {
  const delayed = validFilm();
  delayed.scenes[0].start = 0.5;
  assert.throws(
    () => normalizeCoherentFilm(delayed),
    /first scene must start at 0/,
  );

  const gap = validFilm();
  gap.scenes[1].start = 3.5;
  assert.throws(
    () => normalizeCoherentFilm(gap),
    /scenes have a gap/,
  );
});

test('preserves external captions that are intentionally not burned into picture', () => {
  const film = normalizeCoherentFilm(validFilm({
    captions: [{
      start: 0.2,
      end: 1.8,
      text: 'Readable in the sidecar.',
      burn: false,
      position: 'top',
    }],
  }));

  assert.equal(film.captions[0].burn, false);
  assert.equal(film.captions[0].position, 'top');
  assert.match(coherentFilmToSrt(film), /Readable in the sidecar\./);
});

test('rejects the prior feature-montage shape', () => {
  const film = validFilm();
  film.scenes[0].supporting = [
    { kind: 'slideshow', assetId: 'evidence-path' },
    { kind: 'ascii', assetId: 'evidence-path' },
    { kind: 'presenter', assetId: 'review-capture' },
  ];

  assert.throws(
    () => normalizeCoherentFilm(film),
    /exceeds one supporting visual layer/,
  );
});

test('rejects restricted lip-sync output from publishable films', () => {
  const film = validFilm();
  film.assets.push({
    id: 'wav2lip-presenter',
    kind: 'video',
    source: 'presenter.mp4',
    sourceType: 'generated-presenter',
    license: 'research-only',
    tier: 'restricted',
  });

  assert.throws(
    () => normalizeCoherentFilm(film),
    /cannot enter a publishable render/,
  );
});

test('requires revisions for real product evidence', () => {
  const film = validFilm();
  delete film.assets[0].sourceRevision;

  assert.throws(
    () => normalizeCoherentFilm(film),
    /real captures require sourceRevision/,
  );
});

test('generated atmosphere cannot impersonate product evidence', () => {
  const film = validFilm();
  film.assets[0].sourceType = 'generated-atmosphere';

  assert.throws(
    () => normalizeCoherentFilm(film),
    /cannot be product evidence/,
  );
});
