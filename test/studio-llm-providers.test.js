import assert from 'node:assert/strict';
import test from 'node:test';

import { StudioLlm } from '../src/studio/llm.js';

const silent = { warn: () => {} };
const MESSAGES = [
  { role: 'system', content: 'Output strict JSON: {"ok": true}' },
  { role: 'user', content: 'go' },
];

function stubProvider(name, { configured = true, result, fail } = {}) {
  return {
    name,
    isConfigured: () => configured,
    chatJson: async () => {
      if (fail) throw new Error(`${name} boom`);
      return result ?? { from: name };
    },
  };
}

test('chain uses the first configured provider and reports it', async () => {
  const llm = new StudioLlm({
    providers: [stubProvider('direct'), stubProvider('codex')],
    logger: silent,
  });
  const result = await llm.generate({ messages: MESSAGES, fallback: () => ({ from: 'template' }) });
  assert.equal(result.source, 'llm');
  assert.equal(result.provider, 'direct');
  assert.deepEqual(result.data, { from: 'direct' });
});

test('unconfigured providers are skipped', async () => {
  const llm = new StudioLlm({
    providers: [stubProvider('direct', { configured: false }), stubProvider('codex')],
    logger: silent,
  });
  const result = await llm.generate({ messages: MESSAGES, fallback: () => ({}) });
  assert.equal(result.provider, 'codex');
});

test('a failing provider falls through to the next, then to template on exhaustion', async () => {
  const llm = new StudioLlm({
    providers: [stubProvider('direct', { fail: true }), stubProvider('codex')],
    logger: silent,
  });
  const result = await llm.generate({ messages: MESSAGES, fallback: () => ({}) });
  assert.equal(result.source, 'llm');
  assert.equal(result.provider, 'codex');

  const allFail = new StudioLlm({
    providers: [stubProvider('direct', { fail: true }), stubProvider('codex', { fail: true })],
    logger: silent,
  });
  const fallback = await allFail.generate({ messages: MESSAGES, fallback: () => ({ from: 'template' }) });
  assert.equal(fallback.source, 'template');
  assert.deepEqual(fallback.data, { from: 'template' });
});

test('explicit apiKey construction stays deepseek-only (back-compat template mode)', () => {
  const llm = new StudioLlm({ apiKey: '' });
  assert.equal(llm.isConfigured(), false);
  assert.equal(llm.providers.length, 1);
  assert.equal(llm.providers[0].name, 'deepseek');
});

test('codex provider builds the exec call and parses the last message', async () => {
  const calls = [];
  const llm = new StudioLlm({
    providers: ['codex'],
    codex: {
      runner: (args, input) => {
        calls.push({ args, input });
        if (args[0] === '--version') return { status: 0, stdout: 'codex-cli test' };
        return { status: 0, stdout: 'transcript noise\n```json\n{"ok": true}\n```\n' };
      },
    },
    logger: silent,
  });
  const data = await llm.chatJson(MESSAGES);
  assert.deepEqual(data, { ok: true });
  const exec = calls.find((call) => call.args[0] === 'exec');
  assert.ok(exec.args.includes('--sandbox') && exec.args.includes('read-only'));
  assert.ok(exec.args.includes('--ephemeral'));
  assert.match(exec.input, /Output strict JSON/);
  assert.match(exec.input, /Reply with only the JSON object/);
});

test('a codex call failure marks the provider unavailable for the session', async () => {
  let execCalls = 0;
  const llm = new StudioLlm({
    providers: ['codex'],
    codex: {
      runner: (args) => {
        if (args[0] === '--version') return { status: 0, stdout: 'ok' };
        execCalls += 1;
        return { status: 1, stderr: 'usage limit' };
      },
    },
    logger: silent,
  });
  const first = await llm.generate({ messages: MESSAGES, fallback: () => ({ from: 'template' }) });
  assert.equal(first.source, 'template');
  assert.equal(execCalls, 1);
  const second = await llm.generate({ messages: MESSAGES, fallback: () => ({ from: 'template' }) });
  assert.equal(second.source, 'template');
  assert.equal(execCalls, 1, 'failed provider should not be retried in the same session');
});

test('codex provider reports unavailable when the binary is missing', () => {
  const llm = new StudioLlm({
    providers: ['codex'],
    codex: { runner: () => ({ status: 1, stderr: 'not found' }) },
    logger: silent,
  });
  assert.equal(llm.isConfigured(), false);
});

test('direct provider sends an OpenAI-compatible SDK request', async (t) => {
  t.before(() => {
    process.env.STUDIO_AI_BASE_URL = 'https://direct.example.test/v1';
    process.env.STUDIO_AI_API_KEY = 'test-free-key';
    process.env.STUDIO_AI_MODEL = 'free-model';
  });
  t.after(() => {
    delete process.env.STUDIO_AI_BASE_URL;
    delete process.env.STUDIO_AI_API_KEY;
    delete process.env.STUDIO_AI_MODEL;
  });
  let captured;
  const llm = new StudioLlm({
    providers: ['direct'],
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return Response.json({ choices: [{ message: { content: '{"ok": true}' } }] });
    },
    logger: silent,
  });
  const data = await llm.chatJson(MESSAGES);
  assert.deepEqual(data, { ok: true });
  assert.match(String(captured.url), /\/v1\/chat\/completions$/);
  assert.equal(new Headers(captured.init.headers).get('authorization'), 'Bearer test-free-key');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.model, 'free-model');
});
