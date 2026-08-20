import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parseSrt,
  probeVoiceTranscription,
  saveVoiceRecording,
  transcribeVoiceRecording,
} from '../src/studio/voice-intake.js';

test('voice capture writes a bounded local artifact with hash evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'voice-intake-'));
  const saved = await saveVoiceRecording({
    audioBase64: Buffer.from('recorded voice').toString('base64'),
    mimeType: 'audio/webm;codecs=opus',
  }, { artifactDir: root, now: () => new Date('2026-08-05T12:00:00Z') });
  assert.match(saved.recordingPath, /\.webm$/);
  assert.match(saved.sha256, /^[a-f0-9]{64}$/);
  assert.equal(saved.bytes, 14);
  await assert.rejects(saveVoiceRecording({ audioBase64: 'eA==', mimeType: 'application/octet-stream' }, { artifactDir: root }), /unsupported/);
});

test('voice readiness refuses package-only paths without a local model', async () => {
  const readiness = await probeVoiceTranscription({
    mlxPackageReady: true,
    mlxModelPath: '/definitely/missing/whisper-model',
    commandRunner: async (binary, args) => binary === 'which' && args[0] === 'uv'
      ? { stdout: '/opt/homebrew/bin/uv\n' }
      : { stdout: '' },
  });
  assert.equal(readiness.ready, false);
  assert.match(readiness.blocker, /recording is preserved/i);
});

test('voice transcription uses an injected local provider and preserves recording evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'voice-transcribe-'));
  const model = path.join(root, 'model');
  await mkdir(model);
  const recordingPath = path.join(root, 'voice.webm');
  await writeFile(recordingPath, 'voice');
  const result = await transcribeVoiceRecording({ recordingPath, sha256: 'recording-hash' }, {
    artifactRoots: [root],
    readiness: { ready: true, provider: { id: 'mlx-whisper', modelPath: model } },
    providerRunner: async () => ({ transcript: 'Make a neon rooftop reel.', cues: [{ start: '00:00:00,000', end: '00:00:02,000', text: 'Make a neon rooftop reel.' }] }),
  });
  assert.equal(result.transcript, 'Make a neon rooftop reel.');
  assert.equal(result.evidence.provider, 'mlx-whisper');
  assert.equal(result.evidence.localOnly, true);
  assert.equal(result.recording.recordingPath, recordingPath);
});

test('a failed local transcription leaves the captured recording available for retry', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'voice-transcribe-failure-'));
  const recordingPath = path.join(root, 'voice.webm');
  await writeFile(recordingPath, 'voice');
  await assert.rejects(() => transcribeVoiceRecording({ recordingPath }, {
    artifactRoots: [root],
    readiness: { ready: true, provider: { id: 'mlx-whisper', modelPath: path.join(root, 'model') } },
    providerRunner: async () => { throw new Error('local model stopped'); },
  }), /local model stopped/);
  await access(recordingPath);
});

test('SRT parsing returns editable transcript cues', () => {
  const cues = parseSrt('1\n00:00:00,000 --> 00:00:01,000\nMake a reel.\n\n2\n00:00:01,000 --> 00:00:02,000\nUse real music.');
  assert.deepEqual(cues.map((cue) => cue.text), ['Make a reel.', 'Use real music.']);
});
