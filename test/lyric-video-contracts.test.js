import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLyricProductionManifest,
  evaluateLyricReadiness,
  evaluateLyricRights,
  normalizeLyricDetails,
  parseTimedLyrics,
  planLiteralScenes,
  validateLiteralScenePlan,
} from '../src/lyric-video/contracts.js';

const lrc = [
  '[00:00.00]Twinkle, twinkle, little star',
  '[00:02.50]How I wonder what you are',
  '[00:05.00]Up above the world so high',
  '[00:07.50]Like a diamond in the sky',
].join('\n');

const readyLyric = {
  audioPath: './test/fixtures/lyrics/twinkle-original.wav',
  audioDurationMs: 10_000,
  timedLyrics: lrc,
  timedLyricsFormat: 'lrc',
  attribution: 'Words: Jane Taylor. Melody: traditional. Recording: Fleet-generated original.',
  rights: {
    composition: 'public-domain',
    master: 'original-recording',
    evidence: 'Historical public-domain composition; recording generated locally for this fixture.',
  },
  useBlender: true,
};

test('LRC parsing preserves exact lyric text and derives cue ends', () => {
  const cues = parseTimedLyrics(lrc, { format: 'lrc', audioDurationMs: 10_000 });
  assert.equal(cues.length, 4);
  assert.deepEqual(cues[0], {
    startMs: 0,
    endMs: 2500,
    text: 'Twinkle, twinkle, little star',
  });
  assert.equal(cues.at(-1).endMs, 10_000);
});

test('SRT and structured cue parsing share bounded normalized output', () => {
  const srt = [
    '1',
    '00:00:00,000 --> 00:00:02,500',
    'Exact words stay exact',
    '',
    '2',
    '00:00:02,500 --> 00:00:05,000',
    'And remain in order',
  ].join('\n');
  assert.deepEqual(parseTimedLyrics(srt), [
    { startMs: 0, endMs: 2500, text: 'Exact words stay exact' },
    { startMs: 2500, endMs: 5000, text: 'And remain in order' },
  ]);
  assert.deepEqual(parseTimedLyrics([
    { startMs: 0, endMs: 1000, text: 'One' },
    { startMs: 1000, endMs: 2000, text: 'Two' },
  ]), [
    { startMs: 0, endMs: 1000, text: 'One' },
    { startMs: 1000, endMs: 2000, text: 'Two' },
  ]);
});

test('timed lyric parsing rejects overlaps, markup, and audio overflow', () => {
  assert.throws(() => parseTimedLyrics([
    { startMs: 0, endMs: 2000, text: 'One' },
    { startMs: 1500, endMs: 2500, text: 'Two' },
  ]), /overlaps cue 1/);
  assert.throws(() => parseTimedLyrics('[00:00.00]<b>Do not style lyrics</b>'), /unsupported markup/);
  assert.throws(
    () => parseTimedLyrics(
      [{ startMs: 9000, endMs: 11_000, text: 'Too late' }],
      { audioDurationMs: 10_000 },
    ),
    /exceeds the audio duration/,
  );
});

test('rights readiness fails closed and explains that attribution is not permission', () => {
  const lyric = normalizeLyricDetails({
    ...readyLyric,
    rights: { composition: 'unknown', master: 'unknown' },
  });
  const rights = evaluateLyricRights(lyric);
  assert.equal(rights.ready, false);
  assert.match(rights.blockers.join(' '), /composition and lyric rights/i);
  assert.match(rights.blockers.join(' '), /master-recording rights/i);
  assert.match(rights.blockers.join(' '), /Attribution is not permission/i);
});

test('public-domain composition and original recording pass as separate assertions', () => {
  const lyric = normalizeLyricDetails(readyLyric);
  const readiness = evaluateLyricReadiness(lyric, { blenderReady: true });
  assert.deepEqual(readiness, { ready: true, blockers: [] });
  const rights = evaluateLyricRights(lyric);
  assert.equal(rights.assertion.composition, 'public-domain');
  assert.equal(rights.assertion.master, 'original-recording');
  assert.equal(rights.assertion.independentlyVerified, false);
});

test('literal planning maps every unchanged cue to a concrete scene', () => {
  const cues = parseTimedLyrics(lrc, { audioDurationMs: 10_000 });
  const scenes = planLiteralScenes(cues);
  assert.equal(scenes.length, cues.length);
  assert.equal(scenes[0].lyric, cues[0].text);
  assert.ok(scenes[0].objects.includes('bright stars'));
  assert.match(scenes[0].action, /twinkling/);
  assert.ok(scenes[1].objects.includes('bright stars'));
  assert.ok(scenes[2].objects.includes('the curved world below'));
  assert.ok(scenes[3].objects.includes('a cut diamond'));
  assert.throws(
    () => validateLiteralScenePlan([{ ...scenes[0], lyric: 'Changed words' }], [cues[0]]),
    /preserve its source lyric verbatim/,
  );
});

test('production manifest retains normalized cue, scene, and rights evidence', () => {
  const manifest = buildLyricProductionManifest({
    briefId: 'brief-lyric-1',
    title: 'Literal stars',
    lyric: readyLyric,
    runtime: { blenderReady: true, blenderVersion: '5.2.0' },
  });
  assert.equal(manifest.schema, 'fleet.lyric-video-production.v1');
  assert.equal(manifest.lyric.cues.length, 4);
  assert.equal(manifest.lyric.scenePlan.length, 4);
  assert.equal(manifest.rights.independentlyVerified, false);
});
