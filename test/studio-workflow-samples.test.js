import assert from 'node:assert/strict';
import test from 'node:test';

import sampleConfig from '../config/studio-workflow-samples.json' with { type: 'json' };
import storyConfig from '../config/studio-story-sample.json' with { type: 'json' };
import { listWorkflowSamples, runWorkflowSamples, validateWorkflowSamples } from '../src/studio/workflow-samples.js';

test('five creative workflow samples are stable and bounded', () => {
  const config = validateWorkflowSamples(sampleConfig);
  const samples = listWorkflowSamples({ config, rootDir: '/repo' });
  assert.equal(samples.length, 5);
  assert.equal(new Set(samples.map((sample) => sample.seed)).size, 5);
  assert.ok(samples.every((sample) => sample.briefId.startsWith('sample_')));
  assert.ok(samples.every((sample) => sample.referenceImage.startsWith('/repo/')));
});

test('longer story sample stays on the same five-shot workflow boundary', () => {
  const config = validateWorkflowSamples(storyConfig);
  assert.equal(config.sampleSetId, 'last-train-to-elsewhere');
  assert.equal(config.samples.reduce((total, sample) => total + sample.durationSeconds, 0), 30);
  assert.ok(config.samples.every((sample) => sample.imagePrompt && !/party|karaoke/i.test(sample.prompt)));
});

test('sample runner plans through the shared brief boundary and never executes in plan-only mode', async () => {
  const requests = [];
  const sample = structuredClone(sampleConfig.samples[0]);
  const config = { ...sampleConfig, samples: [sample, ...sampleConfig.samples.slice(1)] };
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init });
    if (!init.method) return response([]);
    const body = JSON.parse(init.body);
    return response({
      id: body.fields.id,
      title: body.fields.title,
      workflowProposal: { version: 1 },
      media: null,
    }, 201);
  };
  const result = await runWorkflowSamples({
    config,
    only: [sample.id],
    planOnly: true,
    rootDir: '/repo',
    fetchImpl,
    fileStat: async () => ({ isFile: () => true, size: 100 }),
  });
  assert.equal(result.results[0].status, 'planned');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'http://127.0.0.1:4317/studio/briefs');
  assert.match(requests[1].url, /\/studio\/briefs$/);
  assert.equal(JSON.parse(requests[1].init.body).fields.id, `sample_${sample.id}`);
});

test('sample runner resumes a completed playable sample without another request', async () => {
  const sample = sampleConfig.samples[0];
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return response([{ id: `sample_${sample.id}`, media: { videoPath: '/tmp/sample.mp4' } }]);
  };
  const result = await runWorkflowSamples({
    only: [sample.id],
    fetchImpl,
    fileStat: async () => ({ isFile: () => true, size: 100 }),
  });
  assert.equal(result.results[0].status, 'reused');
  assert.equal(calls, 1);
});

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Created',
    async json() { return { data }; },
  };
}
