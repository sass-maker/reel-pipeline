import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import registry from '../config/local-video-workflow-recipes.json' with { type: 'json' };
import {
  executeComfyWorkflowRun,
  normalizeLocalBaseUrl,
  probeComfyLocal,
} from '../src/adapters/comfy-local.js';
import { resolveLocalVideoWorkflowRun } from '../src/local-video-workflow-recipes.js';

function response(value, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => value };
}

function resolvedRun() {
  return resolveLocalVideoWorkflowRun('ltx-2b-comfy-i2v-preview', {
    prompt: 'A full-body adult hero walks through a neon alley as the camera tracks sideways.',
    referenceImage: '/tmp/reference.png',
  }, { allowBlocked: true });
}

test('Comfy adapter accepts loopback only and validates live nodes and models', async () => {
  assert.equal(normalizeLocalBaseUrl('http://localhost:8188/'), 'http://localhost:8188');
  assert.throws(() => normalizeLocalBaseUrl('http://192.168.1.2:8188'), /loopback/);
  const fetchImpl = async (url) => {
    if (url.endsWith('/system_stats')) return response({ system: { os: 'darwin' } });
    if (url.endsWith('/object_info')) {
      return response(Object.fromEntries(registry.allowedComfyNodes.map((name) => [name, { input: {} }])));
    }
    throw new Error(`unexpected request ${url}`);
  };
  const result = await probeComfyLocal(resolvedRun(), { fetchImpl });
  assert.equal(result.ready, true);
  assert.ok(result.checkedNodes.includes('LTXVImgToVideo'));
});

test('Comfy executor refuses projected disk pressure before queue submission', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'comfy-disk-'));
  await assert.rejects(executeComfyWorkflowRun(resolvedRun(), {
    outputRoot: root,
    skipReadiness: true,
    statfs: async () => ({ blocks: 100, bavail: 16, bsize: 1024 ** 3 }),
    projectedOutputBytes: 2 * 1024 ** 3,
  }), /projected disk use 86\.00 percent/);
});

test('Comfy executor monitors RAM and returns a verified receipt', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'comfy-run-'));
  const videoDir = path.join(root, 'video');
  await mkdir(videoDir);
  const videoPath = path.join(videoDir, 'result.mp4');
  await writeFile(videoPath, Buffer.from('local video fixture'));
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push([url, init.method ?? 'GET']);
    if (url.endsWith('/prompt')) return response({ prompt_id: 'prompt-1' });
    if (url.endsWith('/history/prompt-1')) return response({
      'prompt-1': {
        status: { completed: true, status_str: 'success' },
        outputs: { '13': { videos: [{ filename: 'result.mp4', subfolder: 'video', type: 'output' }] } },
      },
    });
    throw new Error(`unexpected request ${url}`);
  };
  const result = await executeComfyWorkflowRun(resolvedRun(), {
    outputRoot: root,
    skipReadiness: true,
    fetchImpl,
    uploadReference: async () => ({ name: 'reference.png' }),
    statfs: async () => ({ blocks: 100, bavail: 30, bsize: 1024 ** 3 }),
    resourceMonitor: async () => ({ percent: 72.5 }),
    hashFile: async () => 'a'.repeat(64),
    probeVideo: async () => ({ format: { duration: '2.0' }, streams: [{ width: 512, height: 320 }] }),
  });
  assert.equal(result.videoPath, videoPath);
  assert.equal(result.provenance.peakRamPercent, 72.5);
  assert.equal(result.quality.verdict, 'needs-review');
  assert.ok(calls.some(([url]) => url.endsWith('/prompt')));
});

test('Comfy executor interrupts at the RAM ceiling', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'comfy-ram-'));
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push([url, init.method ?? 'GET']);
    if (url.endsWith('/prompt')) return response({ prompt_id: 'prompt-2' });
    if (url.endsWith('/interrupt')) return response({});
    throw new Error(`unexpected request ${url}`);
  };
  await assert.rejects(executeComfyWorkflowRun(resolvedRun(), {
    outputRoot: root,
    skipReadiness: true,
    fetchImpl,
    uploadReference: async () => ({ name: 'reference.png' }),
    statfs: async () => ({ blocks: 100, bavail: 30, bsize: 1024 ** 3 }),
    resourceMonitor: async () => ({ percent: 90.1 }),
  }), /interrupted at 90\.10 percent RAM/);
  assert.ok(calls.some(([url, method]) => url.endsWith('/interrupt') && method === 'POST'));
});
