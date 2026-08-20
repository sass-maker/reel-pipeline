import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGuidedAppDemoFfmpegArgs,
  guidedAppDemoRenderProfile,
  renderGuidedAppDemoCapture,
} from '../src/guided-app-demo.js';

test('guided app-demo preview is a mobile MP4 with normalized authentic audio', () => {
  const args = buildGuidedAppDemoFfmpegArgs({
    inputPath: '/tmp/capture.webm',
    outputPath: '/tmp/preview.mp4',
    renderKind: 'preview',
    hasAudio: true,
  });
  assert.deepEqual(guidedAppDemoRenderProfile('preview'), {
    width: 720,
    height: 1280,
    crf: 23,
    preset: 'medium',
    label: 'guided-preview',
  });
  assert.ok(args.includes('scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=0x07111f,fps=24,setsar=1'));
  assert.ok(args.includes('loudnorm=I=-16:TP=-1.5:LRA=11'));
  assert.ok(args.includes('0:a:0'));
  assert.ok(args.includes('+faststart'));
});

test('guided app-demo final uses the high-quality profile and adds silence when needed', () => {
  const args = buildGuidedAppDemoFfmpegArgs({
    inputPath: '/tmp/capture.webm',
    outputPath: '/tmp/final.mp4',
    renderKind: 'final',
    hasAudio: false,
  });
  assert.ok(args.includes('scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x07111f,fps=24,setsar=1'));
  assert.equal(args[args.indexOf('-crf') + 1], '17');
  assert.ok(args.includes('anullsrc=r=48000:cl=stereo'));
  assert.ok(args.includes('1:a:0'));
  assert.equal(args.includes('-af'), false);
});

test('guided app-demo renderer probes audio and delegates one deterministic ffmpeg command', async () => {
  const calls = [];
  const result = await renderGuidedAppDemoCapture({
    inputPath: '/tmp/capture.webm',
    outputPath: '/tmp/reel-pipeline-guided-test/preview.mp4',
    renderKind: 'preview',
  }, {
    runner: {
      probeHasAudioStream: async () => true,
      runFfmpeg: async (args) => calls.push(args),
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(result.hasAudio, true);
  assert.equal(result.profile.label, 'guided-preview');
  assert.equal(calls[0].at(-1), '/tmp/reel-pipeline-guided-test/preview.mp4');
});

test('guided app-demo rejects unsupported render kinds', () => {
  assert.throws(
    () => guidedAppDemoRenderProfile('hero'),
    /unsupported guided app-demo render kind/,
  );
});
