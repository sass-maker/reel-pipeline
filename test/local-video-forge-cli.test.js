import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('forge enqueue CLI sends the approved keyframe contract to the shared coordinator', async () => {
  let captured;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    captured = {
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    };
    response.writeHead(201, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: { id: 'forge-cli-test', status: 'queued' } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  try {
    const { stdout } = await execFileAsync(process.execPath, [
      'scripts/local-video-forge.js',
      'enqueue',
      '--project',
      'examples/local-video-forge/project.json',
      '--shot',
      's01',
      '--coordinator',
      `http://127.0.0.1:${address.port}`,
    ], {
      cwd: ROOT,
      env: { ...process.env, REEL_INTERNAL_TOKEN: 'forge-cli-fixture-token' },
    });
    assert.deepEqual(JSON.parse(stdout), { id: 'forge-cli-test', status: 'queued' });
    assert.equal(captured.method, 'POST');
    assert.equal(captured.url, '/forge/jobs');
    assert.equal(captured.authorization, 'Bearer forge-cli-fixture-token');
    assert.equal(captured.body.shot.keyframeApproved, true);
    assert.deepEqual(captured.body.shot.preview.seeds, [41, 42, 43]);
    assert.equal(captured.body.keyframe.mediaType, 'image/png');
    assert.match(captured.body.keyframe.sha256, /^[a-f0-9]{64}$/);
    assert.ok(captured.body.keyframe.dataBase64.length > 100);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
