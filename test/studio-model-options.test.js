import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import modelConfig from '../config/forge-model-profiles.json' with { type: 'json' };
import themeConfig from '../config/studio-theme-packs.json' with { type: 'json' };
import { StableDiffusionCppAdapter } from '../src/adapters/stable-diffusion-cpp.js';
import { handleStudioRequest } from '../src/studio/api.js';
import {
  listModelProfiles,
  resolveModelProfile,
  resolveThemePack,
  validateModelRegistry,
  validateThemeRegistry,
} from '../src/studio/model-options.js';

async function readyModelRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-models-'));
  const profile = modelConfig.profiles.find((entry) => entry.id === 'wai-illustrious-v17-sdcpp');
  for (const relativePath of profile.requiredPaths) {
    const target = path.join(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'fixture');
  }
  return root;
}

test('theme and model registries validate as secret-free bounded data', () => {
  assert.equal(validateThemeRegistry(themeConfig), themeConfig);
  assert.equal(validateModelRegistry(modelConfig), modelConfig);
  assert.equal(themeConfig.themes.length, 5);
  assert.equal(modelConfig.profiles.length, 4);

  const unsafe = structuredClone(modelConfig);
  unsafe.profiles[0].apiToken = 'do-not-store';
  assert.throws(() => validateModelRegistry(unsafe), /secret-shaped field/);
});

test('theme inference recognizes named-IP and original anime prompts', () => {
  assert.equal(resolveThemePack('auto', 'A chaotic Avengers party').id, 'avengers-private');
  assert.equal(resolveThemePack('auto', 'Original anime friends out all night').id, 'original-anime');
  assert.equal(resolveThemePack('auto', 'A neon rooftop night out').id, 'original-nightlife');
});

test('frontier model profiles remain visible for history but are never auto eligible', async () => {
  const rootDir = await readyModelRoot();
  assert.throws(
    () => resolveModelProfile('auto', { generationMode: 'image-to-reel', rootDir }),
    /no ready image-to-reel model/i,
  );
  const selection = resolveModelProfile('wai-illustrious-v17-sdcpp', { generationMode: 'image-to-reel', rootDir });
  assert.equal(selection.profile.id, 'wai-illustrious-v17-sdcpp');
  assert.equal(selection.profile.trust.tier, 'community-experimental');
  assert.equal(selection.selectionMode, 'explicit');
  assert.equal(selection.profile.readiness.ready, false);
  assert.match(selection.profile.readiness.blocker, /parked/i);
  assert.throws(
    () => resolveModelProfile('ltx-2.3-mlx-q4', { generationMode: 'image-to-reel', rootDir }),
    /does not support image-to-reel/,
  );
  assert.ok(listModelProfiles({ rootDir }).every((entry) => entry.autoEligible === false));
  assert.equal(listModelProfiles({ rootDir }).some((entry) => entry.id === 'wan2.2-remix-gguf'), false);
  assert.equal(listModelProfiles({ rootDir }).some((entry) => entry.id === 'minimax-h3-mlx-q4'), false);
});

test('model-options endpoint is read-only and exposes blockers without setup actions', async () => {
  let bodyReads = 0;
  const result = await handleStudioRequest('GET', '/studio/model-options', async () => {
    bodyReads += 1;
    throw new Error('must stay read-only');
  }, { modelOptions: { rootDir: await readyModelRoot() } });
  assert.equal(result.status, 200);
  assert.equal(bodyReads, 0);
  assert.ok(result.body.data.modelProfiles.every((entry) => !entry.readiness.ready));
  assert.equal(result.body.data.generationPolicy.mode, 'manual-import');
  assert.equal(result.body.data.generationPolicy.automaticPaidSpendUsd, 0);
  const preview = result.body.data.workflowRecipes.find((entry) => entry.id === 'ltx-2b-comfy-i2v-preview');
  assert.ok(preview);
  assert.equal(typeof preview.readiness.ready, 'boolean');
  assert.equal(preview.readiness.ready, false);
  assert.match(preview.readiness.blocker, /parked/i);
  assert.equal(result.body.data.workflowRecipes.length, 2);
  assert.ok(result.body.data.workflowRecipes.every((entry) => entry.graph === undefined));
});

test('stable-diffusion.cpp adapter emits a pinned local batch and verifies every card', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sdcpp-adapter-'));
  const executable = path.join(root, 'sd-cli');
  const modelPath = path.join(root, 'model.safetensors');
  await writeFile(executable, 'fixture');
  await writeFile(modelPath, 'fixture');
  let invoked = null;
  const adapter = new StableDiffusionCppAdapter({
    executable,
    modelPath,
    commandRunner: async (binary, args) => {
      invoked = { binary, args };
      const pattern = args[args.indexOf('-o') + 1];
      for (let index = 1; index <= 4; index += 1) {
        await writeFile(pattern.replace('%02d', String(index).padStart(2, '0')), `image-${index}`);
      }
    },
  });
  const result = await adapter.generateCards({
    outputDir: path.join(root, 'cards'),
    prompt: 'fictional adults at a neon party',
    negativePrompt: 'child, minor, real-person likeness',
  });
  assert.equal(result.images.length, 4);
  assert.equal(result.model.sha256, 'f116b0c78ff441467b0cdc8f1936e1ed18ea31e9997c7b132b1b8db533f0bd04');
  assert.equal(invoked.binary, executable);
  assert.deepEqual(invoked.args.slice(invoked.args.indexOf('-b'), invoked.args.indexOf('-b') + 2), ['-b', '4']);
});
