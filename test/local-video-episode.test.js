import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  LOCAL_EPISODE_RUN_SCHEMA,
  assembleLocalEpisode,
  createEpisodeDraft,
  episodeShotSignature,
  renderEpisodeShots,
  resolveEpisodeCast,
  setEpisodeShotReview,
} from '../src/local-video-episode.js';

function castReference(root) {
  return {
    characterId: 'hero',
    characterRevision: 1,
    identity: 'Ari, adult hero, red coat',
    negativeConstraints: [],
    references: [{ path: path.join(root, 'hero.png'), sha256: 'a'.repeat(64), label: 'front' }],
    voiceId: 'af_heart',
    voiceSpeed: 1,
  };
}

test('episode draft creates an editable 2-minute short-shot manifest', () => {
  const episode = createEpisodeDraft({
    id: 'night-out',
    title: 'You are not going to believe this',
    concept: 'Two original adult friends tumble through an increasingly surreal neon night out.',
    targetDurationSeconds: 120,
    cast: [{ characterId: 'hero', voiceId: 'af_heart' }],
    soundtrack: { lane: 'procedural-draft' },
  });
  assert.equal(episode.shots.length, 20);
  assert.equal(episode.plannedDurationSeconds, 120);
  assert.equal(episode.shots[0].previewRecipeId, 'ltx-2b-comfy-i2v-preview');
  assert.equal(episode.shots[0].finalRecipeId, 'ltx-2.3-mlx-q4-final');
});

test('strict continuity blocks when the directory character has no approved reference', async () => {
  const episode = createEpisodeDraft({
    concept: 'An original adult detective crosses a dream city.',
    targetDurationSeconds: 120,
    cast: [{ characterId: 'detective', voiceId: 'am_adam' }],
  });
  const character = {
    schema: 'fleet.character.v1', id: 'detective', revision: 1,
    createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z',
    name: 'Detective Rowan', fictional: true, adultConfirmed: true, age: 30,
    consentPosture: 'affirmative', likenessPosture: 'fictional', sourcePosture: 'original', references: [],
  };
  await assert.rejects(resolveEpisodeCast(episode, { get: async () => character }), /requires an approved reference/);
});

test('resume reuses accepted matching shots and rerenders only changed shots', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'episode-resume-'));
  await writeFile(path.join(root, 'hero.png'), 'reference');
  const episode = createEpisodeDraft({
    id: 'resume', concept: 'An original adult hero races through a clockwork city.', targetDurationSeconds: 120,
    cast: [{ characterId: 'hero', voiceId: 'af_heart' }],
  });
  const resolvedCast = [castReference(root)];
  const reusedVideo = path.join(root, 'accepted.mp4');
  await writeFile(reusedVideo, 'accepted');
  const signature = episodeShotSignature(episode.shots[0], resolvedCast, { phase: 'preview' });
  const previousRun = {
    schema: LOCAL_EPISODE_RUN_SCHEMA,
    shots: [{ id: episode.shots[0].id, inputSignature: signature, videoPath: reusedVideo, reviewState: 'accepted' }],
  };
  let renders = 0;
  const run = await renderEpisodeShots(episode, {
    outputDir: root,
    resolvedCast,
    previousRun,
    executeShot: async ({ shot }) => {
      renders += 1;
      const videoPath = path.join(root, `${shot.id}.mp4`);
      await writeFile(videoPath, shot.prompt);
      return { videoPath };
    },
  });
  assert.equal(run.shots[0].reused, true);
  assert.equal(renders, episode.shots.length - 1);
  const accepted = await setEpisodeShotReview(run, episode.shots[1].id, 'accepted');
  assert.equal(accepted.shots[1].reviewState, 'accepted');
});

test('reference image bytes invalidate accepted shot reuse', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'episode-reference-'));
  const referenceImage = path.join(root, 'environment.png');
  await writeFile(referenceImage, 'reference-v1');
  const episode = createEpisodeDraft({
    id: 'reference-change',
    concept: 'An empty observatory wakes during a storm.',
    targetDurationSeconds: 120,
    cast: [],
    referenceImage,
  });
  const render = async ({ shot }) => {
    const videoPath = path.join(root, `${shot.id}.mp4`);
    await writeFile(videoPath, shot.prompt);
    return { videoPath };
  };
  const first = await renderEpisodeShots(episode, {
    outputDir: root,
    resolvedCast: [],
    executeShot: render,
  });
  const previousRun = {
    ...first,
    shots: first.shots.map((shot) => ({ ...shot, reviewState: 'accepted' })),
  };
  await writeFile(referenceImage, 'reference-v2');
  let rerenders = 0;
  const second = await renderEpisodeShots(episode, {
    outputDir: root,
    resolvedCast: [],
    previousRun,
    executeShot: async (input) => {
      rerenders += 1;
      return render(input);
    },
  });
  assert.equal(rerenders, episode.shots.length);
  assert.notEqual(second.shots[0].inputSignature, first.shots[0].inputSignature);
});

test('assembly requires accepted shots and real music evidence, then records deterministic assets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'episode-assembly-'));
  const video = path.join(root, 'shot.mp4');
  const music = path.join(root, 'music.wav');
  await writeFile(video, 'shot');
  await writeFile(music, 'music');
  const manifest = createEpisodeDraft({
    id: 'assembly', concept: 'An original adult hero tells a tiny clockwork story.', targetDurationSeconds: 120,
    cast: [{ characterId: 'hero', voiceId: 'af_heart' }],
    dialogue: [{ shotId: 'shot-01', characterId: 'hero', text: 'You are not going to believe this.' }],
    soundtrack: { lane: 'owned-local', path: music, rightsPosture: 'owned', rightsEvidence: 'Recorded locally for this episode.' },
  });
  const run = {
    schema: LOCAL_EPISODE_RUN_SCHEMA,
    episodeId: manifest.id,
    episodeSignature: 'e'.repeat(64),
    phase: 'final',
    manifest,
    cast: [castReference(root)],
    shots: manifest.shots.map((shot) => ({ id: shot.id, order: shot.order, videoPath: video, reviewState: 'accepted', inputSignature: 'f'.repeat(64) })),
  };
  const commands = [];
  const result = await assembleLocalEpisode(run, {
    outputDir: root,
    voiceRenderer: async (line) => {
      const voicePath = path.join(root, `${line.id}.wav`);
      await writeFile(voicePath, line.text);
      return { path: voicePath, sha256: 'd'.repeat(64) };
    },
    commandRunner: async (_command, args) => {
      commands.push(args);
      await writeFile(args.at(-1), 'assembled');
    },
    hashFile: async () => 'c'.repeat(64),
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.reviewState, 'needs-review');
  assert.equal(commands.length, 2);
  assert.match(commands[1].join(' '), /amix=inputs=2/);
  assert.equal(result.artifacts.find((entry) => entry.id === 'video').sha256, 'c'.repeat(64));
});
