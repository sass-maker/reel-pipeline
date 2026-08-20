import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertApprovedKeyframe,
  buildLtxCommand,
  generateForgeVariants,
  normalizeForgeProject,
  selectForgeShot,
} from '../src/local-video-forge.js';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'reel-video-forge-'));
  const keyframePath = path.join(root, 'keyframe.png');
  await writeFile(keyframePath, 'approved-keyframe');
  const project = normalizeForgeProject({
    project: { name: 'forge-test', aspectRatio: '9:16', fps: 24 },
    shots: [{
      id: 's01',
      mode: 'image-to-video',
      keyframe: 'keyframe.png',
      keyframeApproved: true,
      motionPrompt: 'Slow controlled camera push. Stable subject.',
      preview: { preset: 'smoke', seeds: [41, 42, 43] },
    }],
  }, { baseDir: root });
  return { root, project, shot: selectForgeShot(project, 's01'), keyframePath };
}

test('forge manifest requires explicit approval and exactly three seeds', async () => {
  const { root, project, shot } = await fixture();
  await assertApprovedKeyframe(shot);
  assert.equal(project.project.aspectRatio, '9:16');
  assert.deepEqual(shot.preview.seeds, [41, 42, 43]);

  const unapproved = { ...shot, keyframeApproved: false };
  await assert.rejects(assertApprovedKeyframe(unapproved), /not explicitly approved/);

  assert.throws(() => normalizeForgeProject({
    project: { name: 'invalid' },
    shots: [{
      id: 's01',
      keyframe: path.join(root, 'keyframe.png'),
      keyframeApproved: true,
      motionPrompt: 'Stable motion',
      preview: { seeds: [1, 2] },
    }],
  }), /exactly three integer seeds/);
});

test('forge command pins image-to-video inputs and preview parameters', async () => {
  const { shot } = await fixture();
  const outputPath = '/tmp/variant.mp4';
  const command = buildLtxCommand(shot, 42, outputPath, {
    runtimeDir: '/tmp/runtime',
    modelDir: '/tmp/model',
  });
  assert.equal(command.command, 'uv');
  assert.equal(command.cwd, '/tmp/runtime');
  assert.ok(command.args.includes('--distilled'));
  assert.deepEqual(command.args.slice(command.args.indexOf('--seed'), command.args.indexOf('--seed') + 2), ['--seed', '42']);
  assert.deepEqual(command.args.slice(command.args.indexOf('--image'), command.args.indexOf('--image') + 2), ['--image', shot.keyframePath]);
  assert.deepEqual(command.args.slice(command.args.indexOf('--output'), command.args.indexOf('--output') + 2), ['--output', outputPath]);
});

test('forge generates three variants sequentially, writes metadata and resumes completed work', async () => {
  const { root, project, shot } = await fixture();
  const outputRoot = path.join(root, 'previews');
  const lockDir = path.join(root, 'locks');
  await mkdir(lockDir, { recursive: true });
  const calls = [];
  const commandRunner = async (_command, args) => {
    calls.push(args);
    const outputPath = args[args.indexOf('--output') + 1];
    await writeFile(outputPath, `video-${args[args.indexOf('--seed') + 1]}`);
    return { stderr: '  123456  maximum resident set size\n' };
  };

  const run = await generateForgeVariants(project, shot, {
    outputRoot,
    lockDir,
    skipReadiness: true,
    commandRunner,
  });
  assert.equal(run.status, 'completed');
  assert.equal(calls.length, 3);
  assert.deepEqual(run.variants.map((variant) => variant.status), ['completed', 'completed', 'completed']);
  assert.deepEqual(run.variants.map((variant) => variant.peakMemoryBytes), [123456, 123456, 123456]);
  assert.equal(new Set(run.variants.map((variant) => variant.outputSha256)).size, 3);
  assert.match(await readFile(run.reviewGalleryPath, 'utf8'), /seed-41/);

  await generateForgeVariants(project, shot, {
    outputRoot,
    lockDir,
    skipReadiness: true,
    commandRunner,
  });
  assert.equal(calls.length, 3);

  await assert.rejects(generateForgeVariants(project, {
    ...shot,
    motionPrompt: 'A different motion prompt.',
  }, {
    outputRoot,
    lockDir,
    skipReadiness: true,
    commandRunner,
  }), /inputs changed/);
  assert.equal(calls.length, 3);
});

test('forge refuses generation when the host readiness guard fails', async () => {
  const { root, project, shot } = await fixture();
  await assert.rejects(generateForgeVariants(project, shot, {
    outputRoot: path.join(root, 'previews'),
    lockDir: path.join(root, 'locks'),
    checkHost: async () => ({ ok: false, failures: ['usable memory is below threshold'] }),
  }), /usable memory is below threshold/);
});
