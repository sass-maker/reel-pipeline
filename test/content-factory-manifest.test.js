import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRenderer } from '../src/pipeline.js';
import {
  buildArtifactManifest,
  contentFactoryRenderer,
} from '../content-factory/src/manifest.js';

const brief = {
  id: 'content-factory-smoke',
  projectSlug: 'high-signal',
  marketingPostId: 'accepted-post-1',
  channel: 'youtube_shorts',
  title: 'Manifest every render',
  hook: 'Every artifact needs evidence.',
  body: 'Script: render. Shot list: verify. Captions: hash. Asset prompts: local proof.',
  cta: 'Review the artifact.',
};

test('Reel Pipeline factory adapters emit validated Content Factory manifests', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'content-factory-mock-'));
  try {
    const renderer = createRenderer('mock', { mock: { artifactDir: root } });
    const render = await renderer.createVideo(brief);
    assert.equal(render.artifactManifest.schema_version, 1);
    assert.equal(render.artifactManifest.renderer.id, 'mock');
    assert.match(render.artifactManifest.assets[0].sha256, /^[a-f0-9]{64}$/);
    assert.equal(render.artifactManifest.quality.status, 'review');
    assert.equal(render.artifactManifest.review.status, 'pending');
    assert.equal(render.artifactManifestPath.endsWith('content-factory-manifest.v1.json'), true);
    assert.deepEqual(JSON.parse(await readFile(render.artifactManifestPath, 'utf8')), render.artifactManifest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('canonical render and package entrypoints moved to Content Factory', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(packageJson.scripts['render:pro'], 'node content-factory/scripts/render-pro.js');
  assert.equal(packageJson.scripts['render:package'], 'node content-factory/scripts/render-content-package.js');
  for (const name of ['render-pro.js', 'render-content-package.js']) {
    await readFile(path.join('content-factory', 'scripts', name), 'utf8');
    await assert.rejects(readFile(path.join('scripts', name), 'utf8'), { code: 'ENOENT' });
  }
});

test('strict Content Factory input rejects unapproved briefs before rendering', async () => {
  const fixtures = JSON.parse(await readFile('test/fixtures/content-factory-v1.json', 'utf8'));
  let called = false;
  const renderer = contentFactoryRenderer({
    async createVideo() {
      called = true;
      return {};
    },
  });
  await assert.rejects(
    renderer.createVideo(fixtures.unapprovedBrief),
    /content_approval.status must be approved before generation/,
  );
  assert.equal(called, false);
});

test('every configured render engine has fixture-backed manifest normalization', async () => {
  const fixtures = JSON.parse(await readFile('test/fixtures/render-engine-manifests-v1.json', 'utf8'));
  const matrix = JSON.parse(await readFile('config/render-modes.json', 'utf8'));
  assert.deepEqual(
    fixtures.engines.map((entry) => entry.mode).sort(),
    matrix.modes.map((entry) => entry.id).sort(),
  );
  const root = await mkdtemp(path.join(os.tmpdir(), 'content-factory-engine-fixtures-'));
  try {
    for (const fixture of fixtures.engines) {
      const artifact = path.join(root, fixture.file);
      await writeFile(artifact, fixture.content);
      const manifest = await buildArtifactManifest({
        context: {
          brief: { id: `brief-${fixture.mode}`, version: 1 },
          projectId: 'high-signal',
          campaignId: 'fixture-campaign',
          experimentId: null,
          inputHash: 'a'.repeat(64),
          channelIntent: ['youtube_shorts'],
          provenance: [{ kind: 'fixture', id: fixture.mode, revision: '1' }],
        },
        render: {
          provider: fixture.provider,
          externalTaskId: `run-${fixture.mode}`,
          status: 'completed',
          artifacts: [artifact],
        },
      });
      assert.equal(manifest.renderer.id, fixture.provider);
      assert.match(manifest.assets[0].sha256, /^[a-f0-9]{64}$/);
      assert.equal(manifest.quality.status, 'review');
      assert.equal(manifest.review.status, 'pending');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('remote artifact verification hashes a bounded response without buffering contract drift', async () => {
  const payload = Buffer.alloc(1024 * 1024 + 17, 'v');
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      'content-type': 'video/mp4',
      'content-length': String(payload.length),
    });
    response.end(payload);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, 'object');
    const location = `http://127.0.0.1:${address.port}/artifact.mp4`;
    const manifest = await buildArtifactManifest({
      context: {
        brief: { id: 'remote-proof', version: 1 },
        projectId: 'high-signal',
        campaignId: 'remote-proof',
        experimentId: null,
        inputHash: 'b'.repeat(64),
        channelIntent: ['youtube_shorts'],
        provenance: [{ kind: 'fixture', id: 'remote-proof', revision: '1' }],
      },
      render: {
        provider: 'remote-fixture',
        externalTaskId: 'remote-proof-run',
        status: 'completed',
        artifacts: [location],
      },
    });
    assert.equal(manifest.assets[0].size_bytes, payload.length);
    assert.equal(
      manifest.assets[0].sha256,
      createHash('sha256').update(payload).digest('hex'),
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
