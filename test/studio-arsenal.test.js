import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

import arsenalConfig from '../config/studio-arsenal.json' with { type: 'json' };
import renderModes from '../config/render-modes.json' with { type: 'json' };
import {
  STUDIO_ARSENAL_SNAPSHOT_SCHEMA,
  buildStudioArsenal,
  validateStudioArsenalManifest,
} from '../src/studio/arsenal.js';
import { handleStudioRequest, toolHandlers } from '../src/studio/api.js';

const execFileAsync = promisify(execFile);
const EMPTY_AUTOMATION = {
  schema: 'fleet.studio-automation-policies.v1',
  version: 1,
  policies: [],
};
const READY_LOCAL_CONTEXT = {
  htmlCapability: { ready: true, blocker: null },
  blenderCapability: { ready: true, blocker: null },
  kokoroReady: true,
};

test('canonical arsenal validates every tool, workflow, recipe, owner, spend class, and engine reference', () => {
  const manifest = validateStudioArsenalManifest(arsenalConfig, {
    renderModes,
    supportedToolIds: Object.keys(toolHandlers()),
  });
  assert.equal(manifest.schema, 'fleet.studio-arsenal.v1');
  assert.equal(manifest.capabilities.length, 6);
  assert.equal(manifest.recipes.length, 13);
  assert.equal(manifest.tools.length, 17);
  assert.ok(manifest.specializedRuntimes.some((entry) => entry.id === 'lyric-canvas'));
});

test('arsenal validation rejects duplicates, unknown engines, missing handlers, and secret-shaped fields', () => {
  const duplicate = structuredClone(arsenalConfig);
  duplicate.recipes[1].id = duplicate.recipes[0].id;
  assert.throws(() => validateStudioArsenalManifest(duplicate, { renderModes }), /recipe ids must be unique/);

  const unknownEngine = structuredClone(arsenalConfig);
  unknownEngine.recipes[0].engine = 'imaginary-renderer';
  assert.throws(() => validateStudioArsenalManifest(unknownEngine, { renderModes }), /unknown render engine imaginary-renderer/);

  assert.throws(() => validateStudioArsenalManifest(arsenalConfig, {
    renderModes,
    supportedToolIds: Object.keys(toolHandlers()).filter((id) => id !== 'titles'),
  }), /no stable handler: titles/);

  const secret = structuredClone(arsenalConfig);
  secret.apiKey = 'must-not-live-here';
  assert.throws(() => validateStudioArsenalManifest(secret, { renderModes }), /must be secret-free: apiKey/);
});

test('agent filters produce a bounded read-only candidate set with provenance and guardrails', async () => {
  const arsenal = await buildStudioArsenal({
    automationRegistry: EMPTY_AUTOMATION,
    recipeContext: READY_LOCAL_CONTEXT,
    filters: { channel: 'youtube_shorts', spendCeiling: 'none', readiness: 'ready' },
  });
  assert.equal(arsenal.schema, STUDIO_ARSENAL_SNAPSHOT_SCHEMA);
  assert.equal(arsenal.readOnly, true);
  assert.deepEqual(arsenal.recipes.map((recipe) => recipe.id), ['image-slideshow', 'web-motion']);
  assert.equal(arsenal.filters.spendCeiling, 'none');
  assert.equal(arsenal.sources.arsenal.path, 'config/studio-arsenal.json');
  assert.ok(arsenal.guardrails.some((rule) => /read-only/i.test(rule)));
  assert.ok(arsenal.workflow.every((operation) => typeof operation.confirmationRequired === 'boolean'));
  assert.equal(arsenal.variants.length, 12);
  assert.equal(arsenal.summary.variants, 12);
  assert.ok(arsenal.variants.every((variant) => variant.delivery.kind === 'final-video'));
});

test('GET /studio/arsenal is read-only and returns the same agent schema', async () => {
  let bodyReads = 0;
  const result = await handleStudioRequest('GET', '/studio/arsenal', async () => {
    bodyReads += 1;
    throw new Error('read-only discovery must not read a request body');
  }, {
    automationRegistry: EMPTY_AUTOMATION,
    blenderCapability: READY_LOCAL_CONTEXT.blenderCapability,
    htmlCapability: READY_LOCAL_CONTEXT.htmlCapability,
    kokoroReady: true,
  }, { recipe: 'image-slideshow', readiness: 'ready' });

  assert.equal(result.status, 200);
  assert.equal(result.body.data.schema, STUDIO_ARSENAL_SNAPSHOT_SCHEMA);
  assert.equal(result.body.data.readOnly, true);
  assert.deepEqual(result.body.data.recipes.map((recipe) => recipe.id), ['image-slideshow']);
  assert.deepEqual(result.body.data.variants.map((variant) => variant.id), [
    'image-slideshow--visualstyle-cinematic-slideshow',
    'image-slideshow--visualstyle-editorial-cutout',
    'image-slideshow--visualstyle-filmstrip',
    'image-slideshow--visualstyle-split-frame',
    'image-slideshow--visualstyle-polaroid-stack',
    'image-slideshow--visualstyle-soft-parallax',
  ]);
  assert.equal(bodyReads, 0);
});

test('factory arsenal command emits the same filterable schema without executing production', async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    'scripts/factory.js',
    'arsenal',
    '--recipe', 'image-slideshow',
    '--spend-ceiling', 'none',
  ], { cwd: process.cwd(), timeout: 30_000 });
  assert.equal(stderr, '');
  const arsenal = JSON.parse(stdout);
  assert.equal(arsenal.schema, STUDIO_ARSENAL_SNAPSHOT_SCHEMA);
  assert.equal(arsenal.readOnly, true);
  assert.deepEqual(arsenal.recipes.map((recipe) => recipe.id), ['image-slideshow']);
  assert.equal(arsenal.variants.length, 6);
});
