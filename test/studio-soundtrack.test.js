import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSoundtrack,
  soundtrackDistributionBlockers,
  soundtrackReadiness,
} from '../src/studio/soundtrack.js';

test('soundtrack has exactly one explicit normalized source lane', () => {
  const owned = normalizeSoundtrack({
    lane: 'owned-local',
    ownedLocal: { path: '/tmp/song.wav', rightsPosture: 'owned', rightsEvidence: 'Recorded by operator.' },
    platformSound: { provider: 'youtube', url: 'https://youtube.com/watch?v=ignored' },
  });
  assert.equal(owned.lane, 'owned-local');
  assert.equal(owned.ownedLocal.path, '/tmp/song.wav');
  assert.equal(owned.platformSound, null);
  assert.deepEqual(soundtrackDistributionBlockers(owned), []);

  const draft = normalizeSoundtrack();
  assert.equal(draft.lane, 'procedural-draft');
  assert.equal(draft.proceduralDraft.finalQuality, false);
  assert.match(soundtrackReadiness(draft).boundary, /not final-quality/i);
  assert.deepEqual(soundtrackDistributionBlockers(draft), ['a final-quality soundtrack selection']);
});

test('platform sounds require official HTTPS references and produce a silent-master boundary', () => {
  const soundtrack = normalizeSoundtrack({
    lane: 'platform-sound',
    platformSound: { provider: 'instagram', url: 'https://www.instagram.com/reels/audio/123', startSeconds: 4.5 },
  });
  const readiness = soundtrackReadiness(soundtrack);
  assert.equal(readiness.ready, true);
  assert.match(readiness.boundary, /silent upload master/i);
  assert.throws(() => normalizeSoundtrack({
    lane: 'platform-sound', platformSound: { provider: 'instagram', url: 'http://example.com/song' },
  }), /HTTPS/);
});

test('generated music stays parked even when a runtime is installed', () => {
  const soundtrack = normalizeSoundtrack({
    lane: 'generated',
    generated: { prompt: 'funky neon party instrumental', durationSeconds: 15, bpm: 118, key: 'A minor', variationCount: 3 },
  });
  assert.equal(soundtrack.generated.variationCount, 3);
  assert.match(soundtrackReadiness(soundtrack).blocker, /parked/i);
  assert.match(soundtrackReadiness(soundtrack, {
    generatedRuntime: { ready: true, supportedControls: ['bpm'] },
  }).blocker, /paid generation/i);
  assert.equal(soundtrackReadiness(soundtrack, {
    generatedRuntime: { ready: true, supportedControls: ['bpm', 'key', 'meter', 'referenceAudioPath'] },
  }).ready, false);
  assert.deepEqual(soundtrackDistributionBlockers(soundtrack), ['an approved imported soundtrack with rights evidence']);
});

test('generated variations require an explicit valid selection before final use', () => {
  const variations = [
    { id: 'warm', audioPath: '/tmp/warm.wav', seed: 11, evidence: { runtime: 'fixture' } },
    { id: 'bright', audioPath: '/tmp/bright.wav', seed: 12, evidence: { runtime: 'fixture' } },
  ];
  const selected = normalizeSoundtrack({
    lane: 'generated',
    generated: {
      prompt: 'instrumental bed',
      variations,
      selectedVariationId: 'bright',
    },
  });
  assert.equal(selected.generated.variationCount, 2);
  assert.equal(selected.generated.selectedVariationId, 'bright');
  assert.throws(() => normalizeSoundtrack({
    lane: 'generated',
    generated: { prompt: 'instrumental bed', variations, selectedVariationId: 'missing' },
  }), /selected soundtrack variation is unavailable/);
});

test('mix controls preserve trim, offset, loop, fades, gain, and narration ducking', () => {
  const soundtrack = normalizeSoundtrack({
    lane: 'procedural-draft',
    mix: {
      trimStartSeconds: 3, offsetSeconds: 1.5, loop: false, fadeInSeconds: 0.4,
      fadeOutSeconds: 0.8, gainDb: -5, ducking: { enabled: true, threshold: 0.1, ratio: 6 },
    },
  });
  assert.deepEqual(soundtrack.mix, {
    trimStartSeconds: 3, offsetSeconds: 1.5, loop: false, fadeInSeconds: 0.4,
    fadeOutSeconds: 0.8, gainDb: -5, ducking: { enabled: true, threshold: 0.1, ratio: 6 },
  });
});
