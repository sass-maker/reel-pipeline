import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { reviewPostReadyVideo } from '../src/post-ready/review.js';

const execFileAsync = promisify(execFile);

test('technical review decodes the complete master and emits one-frame-per-second evidence', async () => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'post-ready-review-'));
  try {
    const videoPath = path.join(scratch, 'sample.mp4');
    await execFileAsync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', videoPath,
    ], { maxBuffer: 1024 * 1024 * 8 });
    const result = await reviewPostReadyVideo({
      videoPath,
      reviewDir: path.join(scratch, 'review'),
      expected: { width: 1080, height: 1920, fps: 30, durationSeconds: 2 },
      runtime: { ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' },
    });
    assert.equal(result.status, 'passed');
    assert.equal(result.decodedFullDuration, true);
    assert.equal(result.observed.sampledFrames, 2);
    assert.ok((await stat(result.evidence.contactSheet)).size > 0);
    assert.ok((await stat(result.evidence.audioEvidence)).size > 0);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
