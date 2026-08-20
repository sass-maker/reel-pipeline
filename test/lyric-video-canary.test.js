import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parseTimedLyrics } from '../src/lyric-video/contracts.js';
import { synthesizeTwinkleWav } from '../scripts/render-lyric-canary.js';

const fixture = JSON.parse(await readFile('test/fixtures/lyrics/twinkle-literal-canary.json', 'utf8'));

test('lyric canary declares public-domain composition and original recording separately', () => {
  assert.equal(fixture.rights.composition, 'public-domain');
  assert.equal(fixture.rights.master, 'original-recording');
  assert.equal(fixture.recording.sourceRecordingUsed, false);
  assert.match(fixture.rights.evidenceUrl, /^https:\/\/www\.loc\.gov\//);
  assert.equal(parseTimedLyrics(fixture.timedLyrics, {
    format: fixture.timedLyricsFormat,
    audioDurationMs: fixture.durationSeconds * 1000,
  }).length, 4);
});

test('canary synthesizer creates a fresh 12-second mono WAV without source audio', () => {
  const result = synthesizeTwinkleWav('/unused.wav', fixture.recording);
  assert.equal(result.wav.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(result.wav.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.equal(result.durationSeconds, 12);
  assert.equal(result.sampleRate, 44_100);
  assert.equal(result.sampleCount, 529_200);
});
