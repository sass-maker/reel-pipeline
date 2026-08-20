import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FORGE_DEMO_NARRATION,
  assertNoFalseLipSync,
  buildForgeDemoTimeline,
  sceneAt,
  timelineToSrt,
} from '../src/local-video-forge-composition.js';

test('forge demo timeline covers narration and keeps speech off moving faces', () => {
  const timeline = buildForgeDemoTimeline({ narrationDurationSeconds: 12 });

  assert.equal(timeline.lipSync, false);
  assert.equal(timeline.captions.length, 5);
  assert.equal(timeline.captions[0].start, 0.8);
  assert.equal(timeline.captions.at(-1).end, 12.8);
  assert.ok(Math.abs(timeline.totalDurationSeconds - 13.7) < 0.0001);
  assert.equal(assertNoFalseLipSync(timeline), true);
  assert.ok(timeline.scenes.filter(({ speech }) => speech).every(
    ({ visual }) => visual !== 'moving-presenter',
  ));
});

test('forge demo captions preserve the complete narration in SRT order', () => {
  const timeline = buildForgeDemoTimeline({ narrationDurationSeconds: 10 });
  const srt = timelineToSrt(timeline);

  assert.match(srt, /00:00:00,800 -->/);
  assert.match(srt, /Most video generators begin with a prompt\./);
  assert.match(srt, /and lets you choose before spending more compute\./);
  assert.equal(
    timeline.captions.map(({ text }) => text).join(' '),
    FORGE_DEMO_NARRATION,
  );
});

test('scene lookup follows the caption-led visual sequence', () => {
  const timeline = buildForgeDemoTimeline({ narrationDurationSeconds: 10 });

  assert.equal(sceneAt(timeline, 0.1).id, 'silent-intro');
  assert.equal(sceneAt(timeline, timeline.captions[1].start + 0.01).id, 'approved-frame');
  assert.equal(sceneAt(timeline, timeline.totalDurationSeconds).id, 'silent-outro');
});

test('actual phrase audio durations drive subtitle boundaries when available', () => {
  const timeline = buildForgeDemoTimeline({
    narrationDurationSeconds: 10,
    captionDurationsSeconds: [1, 2, 3, 1, 3],
  });

  assert.equal(timeline.captions[0].end, 1.8);
  assert.equal(timeline.captions[1].end, 3.8);
  assert.equal(timeline.captions[2].end, 6.8);
  assert.equal(timeline.captions.at(-1).end, 10.8);
});
