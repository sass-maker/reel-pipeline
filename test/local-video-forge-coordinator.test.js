import assert from 'node:assert/strict';
import test from 'node:test';

import {
  claimForgeJob,
  createForgeJob,
  getForgeJob,
  listForgeJobs,
  updateForgeJob,
} from '../src/local-video-forge-coordinator.js';

function createR2Bucket(options = {}) {
  const objects = new Map();
  let revision = 0;
  return {
    async put(key, value, options = {}) {
      const existing = objects.get(key);
      if (options.onlyIf?.etagMatches && existing?.etag !== options.onlyIf.etagMatches) return null;
      let bytes;
      if (typeof value === 'string') bytes = new TextEncoder().encode(value);
      else if (value instanceof Uint8Array) bytes = value;
      else if (value?.getReader) bytes = new Uint8Array(await new Response(value).arrayBuffer());
      else bytes = new Uint8Array(value);
      const etag = `"test-${revision += 1}"`;
      objects.set(key, { bytes, etag, contentType: options.httpMetadata?.contentType });
      return { etag };
    },
    async get(key) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        body: object.bytes,
        etag: object.etag,
        httpEtag: object.etag,
        json: async () => JSON.parse(new TextDecoder().decode(object.bytes)),
        writeHttpMetadata: (headers) => headers.set('content-type', object.contentType ?? 'application/octet-stream'),
      };
    },
    async head(key) {
      const object = objects.get(key);
      return object ? { size: object.bytes.byteLength, etag: object.etag } : null;
    },
    async list({ prefix, cursor }) {
      const matching = Array.from(objects.keys())
        .filter((key) => key.startsWith(prefix))
        .sort();
      const offset = Number(cursor ?? 0);
      const limit = options.pageSize ?? matching.length;
      const page = matching.slice(offset, offset + limit);
      const truncated = offset + page.length < matching.length;
      return {
        objects: page.map((key) => ({ key })),
        truncated,
        ...(truncated ? { cursor: String(offset + page.length) } : {}),
      };
    },
  };
}

function submittedJob() {
  return {
    id: 'forge-job-1',
    project: { name: 'forge-test', aspectRatio: '9:16', fps: 24, style: 'clean' },
    shot: {
      id: 's01',
      mode: 'image-to-video',
      keyframe: 'keyframe.png',
      keyframeApproved: true,
      motionPrompt: 'Slow controlled push.',
      negativePrompt: 'camera shake',
      preview: { preset: 'smoke', seeds: [41, 42, 43], width: 256, height: 384, frames: 9, fps: 24 },
    },
    keyframe: {
      fileName: 'keyframe.png',
      mediaType: 'image/png',
      dataBase64: Buffer.from('approved-keyframe').toString('base64'),
    },
  };
}

test('shared forge queue accepts a job and leases it only to a capable worker', async () => {
  const bucket = createR2Bucket();
  const created = await createForgeJob(submittedJob(), { bucket });
  assert.equal(created.status, 'queued');
  assert.equal((await listForgeJobs({}, { bucket })).length, 1);

  const incompatible = await claimForgeJob({
    workerId: 'remote-linux',
    capabilities: ['linux'],
  }, { bucket });
  assert.equal(incompatible, null);

  const claimed = await claimForgeJob({
    workerId: 'local-mac',
    capabilities: ['apple-silicon', 'mlx-ltx-2.3'],
  }, { bucket });
  assert.equal(claimed.status, 'running');
  assert.equal(claimed.lease.workerId, 'local-mac');
  assert.equal(claimed.attempts, 1);

  const secondClaim = await claimForgeJob({
    workerId: 'other-mac',
    capabilities: ['apple-silicon', 'mlx-ltx-2.3'],
  }, { bucket });
  assert.equal(secondClaim, null);
});

test('shared forge queue rejects a mismatched keyframe hash', async () => {
  const input = submittedJob();
  input.keyframe.sha256 = 'incorrect';
  await assert.rejects(createForgeJob(input, { bucket: createR2Bucket() }), /sha256 does not match/);
});

test('shared forge queue never overwrites an existing explicit job id', async () => {
  const bucket = createR2Bucket();
  await createForgeJob(submittedJob(), { bucket });

  await assert.rejects(
    createForgeJob(submittedJob(), { bucket }),
    /forge job already exists/,
  );
});

test('shared forge queue reads every paginated job page', async () => {
  const bucket = createR2Bucket({ pageSize: 1 });
  for (const id of ['forge-job-1', 'forge-job-2', 'forge-job-3']) {
    const input = submittedJob();
    input.id = id;
    await createForgeJob(input, { bucket });
  }

  assert.deepEqual(
    (await listForgeJobs({}, { bucket })).map((job) => job.id),
    ['forge-job-1', 'forge-job-2', 'forge-job-3'],
  );
});

test('forge worker progress, retry and completion preserve the shared task', async () => {
  const bucket = createR2Bucket();
  await createForgeJob(submittedJob(), { bucket });
  await claimForgeJob({
    workerId: 'local-mac',
    capabilities: ['apple-silicon', 'mlx-ltx-2.3'],
  }, { bucket });

  await assert.rejects(updateForgeJob('forge-job-1', 'complete', {
    workerId: 'other-mac',
    variants: [],
  }, { bucket }), /lease is not owned/);

  const progressed = await updateForgeJob('forge-job-1', 'progress', {
    workerId: 'local-mac',
    progress: { stage: 'variant-completed', completed: 1, total: 3 },
  }, { bucket });
  assert.equal(progressed.progress.completed, 1);

  const retried = await updateForgeJob('forge-job-1', 'fail', {
    workerId: 'local-mac',
    error: 'transient render failure',
  }, { bucket });
  assert.equal(retried.status, 'queued');

  await claimForgeJob({
    workerId: 'local-mac',
    capabilities: ['apple-silicon', 'mlx-ltx-2.3'],
  }, { bucket });
  await assert.rejects(updateForgeJob('forge-job-1', 'complete', {
    workerId: 'local-mac',
    variants: [{ variantId: 'seed-41', artifactKey: 'seed-41.mp4' }],
  }, { bucket }), /exactly three variants/);
  const foreignVariants = [41, 42, 43].map((seed) => ({
    variantId: `seed-${seed}`,
    seed,
    artifactKey: `video-forge/outputs/another-job/attempt-2/seed-${seed}.mp4`,
  }));
  await assert.rejects(updateForgeJob('forge-job-1', 'complete', {
    workerId: 'local-mac',
    variants: foreignVariants,
  }, { bucket }), /does not match the active job attempt/);
  const variants = [41, 42, 43].map((seed) => ({
    variantId: `seed-${seed}`,
    seed,
    artifactKey: `video-forge/outputs/forge-job-1/attempt-2/seed-${seed}.mp4`,
  }));
  await assert.rejects(updateForgeJob('forge-job-1', 'complete', {
    workerId: 'local-mac',
    variants,
  }, { bucket }), /was not uploaded/);
  for (const variant of variants) {
    await bucket.put(variant.artifactKey, `video-${variant.seed}`, {
      httpMetadata: { contentType: 'video/mp4' },
    });
  }
  const completed = await updateForgeJob('forge-job-1', 'complete', {
    workerId: 'local-mac',
    variants,
  }, { bucket });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.variants.length, 3);
  assert.equal((await getForgeJob('forge-job-1', { bucket })).lease, null);
});
