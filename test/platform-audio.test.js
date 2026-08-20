import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  createPlatformAudioPreview,
  normalizePlatformAudioReference,
  probeMedia,
  youtubeVideoIdFromUrl,
} from '../src/platform-audio.js';

const execFileAsync = promisify(execFile);

const reference = {
  provider: 'youtube',
  videoId: 'weRHyjj34ZE',
  artist: 'Shakira',
  title: 'Whenever, Wherever',
  spotifyTrackId: '2N7vjHuOfnyF5eUzv5brZ0',
  startSeconds: 47,
  durationSeconds: 30,
  targetPlatform: 'youtube_shorts',
};

test('platform audio reference accepts a bounded YouTube embed and rejects direct media', () => {
  const normalized = normalizePlatformAudioReference(reference);
  assert.equal(normalized.videoId, 'weRHyjj34ZE');
  assert.match(normalized.embedUrl, /^https:\/\/www\.youtube-nocookie\.com\/embed\/weRHyjj34ZE/);
  assert.equal(normalized.reviewProvider, 'spotify');
  assert.match(normalized.reviewEmbedUrl, /^https:\/\/open\.spotify\.com\/embed\/track\/2N7vjHuOfnyF5eUzv5brZ0/);
  assert.equal('audioPath' in normalized, false);
  assert.throws(
    () => normalizePlatformAudioReference({ ...reference, audioUrl: 'https://example.test/song.mp3' }),
    /direct media URL/i,
  );
  assert.throws(
    () => normalizePlatformAudioReference({ ...reference, durationSeconds: 61 }),
    /between 5 and 60/i,
  );
  assert.throws(
    () => normalizePlatformAudioReference({ ...reference, spotifyTrackId: 'not-a-track' }),
    /22-character Spotify track identifier/i,
  );
});

test('platform audio reference accepts normal official YouTube URLs', () => {
  for (const youtubeUrl of [
    'https://www.youtube.com/watch?v=weRHyjj34ZE',
    'https://youtu.be/weRHyjj34ZE?t=47',
    'https://www.youtube.com/shorts/weRHyjj34ZE',
    'https://music.youtube.com/watch?v=weRHyjj34ZE&list=example',
  ]) {
    assert.equal(youtubeVideoIdFromUrl(youtubeUrl), 'weRHyjj34ZE');
    const normalized = normalizePlatformAudioReference({
      ...reference,
      videoId: undefined,
      spotifyTrackId: undefined,
      youtubeUrl,
    });
    assert.equal(normalized.videoId, 'weRHyjj34ZE');
    assert.equal(normalized.youtubeUrl, 'https://www.youtube.com/watch?v=weRHyjj34ZE');
    assert.equal(normalized.reviewProvider, 'youtube');
  }
});

test('platform audio reference rejects non-YouTube URLs and conflicting identifiers', () => {
  assert.throws(
    () => normalizePlatformAudioReference({ ...reference, videoId: undefined, youtubeUrl: 'https://example.test/watch?v=weRHyjj34ZE' }),
    /hosted by YouTube/i,
  );
  assert.throws(
    () => normalizePlatformAudioReference({ ...reference, youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }),
    /does not match/i,
  );
});

test('platform audio preview preserves the source and produces a verified silent master', async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'platform-audio-'));
  const source = path.join(scratch, 'source.mp4');
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=navy:s=360x640:d=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-shortest', '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p',
    source,
  ]);

  const sourceProbe = await probeMedia(source);
  assert.equal(sourceProbe.hasAudio, true);
  const preview = await createPlatformAudioPreview({
    reference,
    videoPath: source,
    artifactDir: scratch,
  }, { now: () => new Date('2026-07-31T12:00:00Z') });
  const silentProbe = await probeMedia(preview.silentMasterPath);
  assert.equal(silentProbe.hasVideo, true);
  assert.equal(silentProbe.hasAudio, false);
  assert.equal(preview.reference.videoId, reference.videoId);
  assert.match(preview.handoff.instruction, /attach “Whenever, Wherever” by Shakira/i);
  assert.equal(preview.ready, true);
});

test('platform audio preview fails closed when probe evidence reports audio', async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'platform-audio-fail-'));
  const source = path.join(scratch, 'source.mp4');
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=360x640:d=0.2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    source,
  ]);
  await assert.rejects(
    createPlatformAudioPreview({ reference, videoPath: source, artifactDir: scratch }, {
      probeMedia: async () => ({ hasVideo: true, hasAudio: true }),
    }),
    /still contains an audio stream/i,
  );
});
