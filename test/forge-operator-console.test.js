import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/worker/index.js';

const TOKEN = 'forge-console-test-token';
const ORIGIN = 'https://forge.example.test';

function authorized(pathname, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${TOKEN}`);
  return new Request(`${ORIGIN}${pathname}`, { ...init, headers });
}

const env = { REEL_INTERNAL_TOKEN: TOKEN, REEL_ARTIFACTS: {} };

test('parked Forge routes still fail closed without internal auth', async () => {
  const page = await worker.fetch(new Request(`${ORIGIN}/forge`), env);
  assert.equal(page.status, 401);
  assert.match(page.headers.get('www-authenticate') ?? '', /Foundry Reel Review/);

  const skills = await worker.fetch(new Request(`${ORIGIN}/forge/skills`), env);
  assert.equal(skills.status, 401);
});

test('authenticated Forge console explains the parked cost boundary', async () => {
  const response = await worker.fetch(authorized('/forge'), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const page = await response.text();
  assert.match(page, /Local Video Forge is parked/i);
  assert.match(page, /per-job budget and operator approval/i);
  assert.match(page, /Automatic paid generation spend is \$0/i);
  assert.doesNotMatch(page, /Queue three previews|New film task|final-render/i);
});

test('Forge metadata stays readable while every mutation returns gone', async () => {
  const skills = await worker.fetch(authorized('/forge/skills'), env);
  assert.equal(skills.status, 200);
  assert.ok((await skills.json()).data.length > 0);

  for (const request of [
    authorized('/forge/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    authorized('/forge/jobs/example/decision', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' }),
    authorized('/forge/jobs/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
  ]) {
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 410);
    assert.match((await response.json()).error, /generation is parked.*operator approval/i);
  }
});
