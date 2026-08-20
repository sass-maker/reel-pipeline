import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRODUCTION_RECIPE_IDS,
  PRODUCTION_SPEND_CLASSES,
  getProductionRecipe,
  listProductionProjects,
  listProductionRecipes,
  listRecipeVariants,
  normalizeRecipeOptions,
  productionActions,
} from '../src/studio/production-catalog.js';

test('production catalog covers every requested runtime with normalized comparison fields', () => {
  const recipes = listProductionRecipes({
    htmlCapability: { ready: true, blocker: null },
    blenderCapability: { ready: false, blocker: 'Blender unavailable for test.' },
    kokoroReady: false,
  });
  assert.ok(recipes.every((recipe) => recipe.version === 1));
  assert.equal(recipes.length, 13);
  assert.deepEqual(recipes.map((entry) => entry.id), PRODUCTION_RECIPE_IDS);
  assert.deepEqual(PRODUCTION_SPEND_CLASSES, ['none', 'local-compute', 'external-service', 'paid-api']);
  for (const recipe of recipes) {
    assert.ok(recipe.group);
    assert.ok(recipe.outputStyle);
    assert.ok(recipe.owner);
    assert.ok(recipe.engine);
    assert.ok(PRODUCTION_SPEND_CLASSES.includes(recipe.spend.id));
    assert.ok(['ready', 'needs-input', 'needs-runtime', 'external-step'].includes(recipe.readiness.state));
    assert.deepEqual(recipe.channels, ['instagram_reels', 'youtube_shorts']);
  }
  assert.equal(getProductionRecipe('threejs-scene').owner, 'Editorial');
  assert.equal(getProductionRecipe('blender-film', { blenderCapability: { ready: true } }).readiness.state, 'ready');
  assert.match(getProductionRecipe('local-voice-film').readiness.blocker, /Kokoro/i);
  const nightOut = getProductionRecipe('night-out-carousel', { modelOptions: { rootDir: '/missing-model-root' } });
  assert.equal(nightOut.readiness.state, 'needs-runtime');
  assert.match(nightOut.readiness.blocker, /WAI checkpoint|approved image manifest/i);
  const suppliedNightOut = getProductionRecipe('night-out-carousel', {
    modelOptions: { rootDir: '/missing-model-root' },
    brief: { executionInputs: { assetManifestPath: '/approved/images.json', rightsEvidence: 'Owned images.' } },
  });
  assert.equal(suppliedNightOut.readiness.state, 'ready');
});

test('recipe options are bounded, normalized, and reject unsupported values', () => {
  assert.deepEqual(normalizeRecipeOptions('ascii-story', {
    channel: 'instagram_reels',
    durationSeconds: 18,
    qualityTier: 'draft',
    variantCount: 3,
    values: { palette: 'terminal' },
  }), {
    variantId: 'ascii-story--palette-terminal',
    channel: 'instagram_reels',
    durationSeconds: 18,
    qualityTier: 'draft',
    variantCount: 3,
    values: { palette: 'terminal' },
  });
  assert.throws(() => normalizeRecipeOptions('ascii-story', { variantCount: 8 }), /between 1 and 6/);
  assert.throws(() => normalizeRecipeOptions('ascii-story', { palette: 'neon' }), /palette must be one of/);
  assert.throws(() => getProductionRecipe('imaginary-engine'), /unknown video recipe/);
});

test('recipe catalog expands all bounded combinations into stable selectable variants', () => {
  const context = {
    htmlCapability: { ready: true, blocker: null },
    blenderCapability: { ready: true, blocker: null },
    kokoroReady: true,
  };
  const variants = listRecipeVariants(context);
  assert.equal(variants.length, 49);
  assert.equal(new Set(variants.map((variant) => variant.id)).size, 49);
  assert.ok(variants.every((variant) => variant.selectable));
  assert.deepEqual(
    variants.filter((variant) => variant.recipeId === 'blender-film').map((variant) => variant.id),
    [
      'blender-film--visualstyle-cosmic-shrine',
      'blender-film--visualstyle-brutalist-monument',
      'blender-film--visualstyle-glass-studio',
      'blender-film--visualstyle-low-poly-valley',
      'blender-film--visualstyle-organic-bloom',
      'blender-film--visualstyle-kinetic-sculpture',
      'blender-film--visualstyle-neon-tunnel',
      'blender-film--visualstyle-paper-diorama',
    ],
  );
  const grok = variants.find((variant) => variant.recipeId === 'grok-asset-film');
  assert.equal(grok.id, 'grok-asset-film--custom-input');
  assert.deepEqual(grok.unboundedOptions.map((option) => option.id), ['approvedAssetPath']);
  assert.equal(grok.readiness.state, 'needs-input');
  assert.equal(grok.delivery.kind, 'final-video');
  assert.ok(variants.filter((variant) => variant.autoEligible).every((variant) => variant.delivery.kind === 'final-video'));
  assert.ok(variants.filter((variant) => variant.delivery.kind === 'continuation').every((variant) => !variant.autoEligible));
  assert.equal(variants.find((variant) => variant.recipeId === 'night-out-carousel').id, 'night-out-carousel--default');
  assert.deepEqual(
    variants.filter((variant) => variant.recipeId === 'local-voice-film').map((variant) => variant.values.voice),
    ['af_heart', 'am_adam'],
  );
  assert.match(variants.find((variant) => variant.id === 'local-voice-film--voice-af-heart').label, /Heart · Warm and conversational/);
});

test('stable variant ids select finite values while duration and free-form input stay separate', () => {
  assert.deepEqual(normalizeRecipeOptions('literal-lyric-video', {
    variantId: 'literal-lyric-video--visualstyle-kinetic-type--useblender-true',
    durationSeconds: 60,
  }), {
    variantId: 'literal-lyric-video--visualstyle-kinetic-type--useblender-true',
    channel: 'youtube_shorts',
    durationSeconds: 60,
    qualityTier: 'high',
    variantCount: 1,
    values: { visualStyle: 'kinetic-type', useBlender: true },
  });
  assert.equal(normalizeRecipeOptions('grok-asset-film', {
    variantId: 'grok-asset-film--custom-input',
    values: { approvedAssetPath: '/tmp/approved.mp4' },
  }).values.approvedAssetPath, '/tmp/approved.mp4');
  assert.throws(() => normalizeRecipeOptions('ascii-story', {
    variantId: 'ascii-story--palette-terminal',
    values: { palette: 'amber' },
  }), /does not match variant/);
});

test('terminal actions distinguish local build, external continuation, preview, and Postiz evidence', () => {
  const local = productionActions({
    id: 'brief-local', recipeId: 'image-slideshow', projectSlug: 'high-signal',
    media: null, sourceEvidence: {}, approval: {},
  }, { htmlCapability: { ready: true, blocker: null } });
  assert.equal(local.build.kind, 'execute');
  assert.equal(local.build.enabled, true);
  assert.equal(local.preview.enabled, false);
  assert.equal(local.post.enabled, false);

  const external = productionActions({
    id: 'brief-three', recipeId: 'threejs-scene', projectSlug: 'high-signal',
    sourceEvidence: {}, approval: {}, media: null,
  });
  assert.equal(external.build.kind, 'continue');
  assert.equal(external.build.enabled, true);
  const url = new URL(external.build.href);
  assert.equal(url.searchParams.get('studioBriefId'), 'brief-three');
  assert.equal(url.searchParams.get('recipeId'), 'threejs-scene');

  const grok = productionActions({
    id: 'brief-grok', recipeId: 'grok-asset-film', projectSlug: 'high-signal',
    recipeOptions: normalizeRecipeOptions('grok-asset-film'), sourceEvidence: {}, approval: {}, media: null,
  });
  assert.equal(grok.build.enabled, false);
  assert.match(grok.build.blocker, /approved local Grok MP4/i);

  const experiment = productionActions({
    id: 'brief-private-film', recipeId: 'image-slideshow',
    sourceEvidence: {}, approval: {}, media: null,
  }, { htmlCapability: { ready: true, blocker: null } });
  assert.equal(experiment.build.kind, 'execute');
  assert.equal(experiment.build.enabled, true);
  assert.doesNotMatch(experiment.build.blocker || '', /Fleet brand|source rights/i);
  assert.equal(experiment.post.enabled, false);
  assert.match(experiment.post.blocker, /Fleet brand|approved source rights/i);

  const unavailableModel = productionActions({
    id: 'brief-private-ltx', recipeId: 'coherent-local-film',
    modelProfileId: 'ltx-2.3-mlx-q4', sourceEvidence: {}, approval: {}, media: null,
  });
  assert.equal(unavailableModel.build.kind, 'blocked');
  assert.equal(unavailableModel.build.enabled, false);
  assert.match(unavailableModel.build.blocker, /parked|approved external clip/i);
  assert.doesNotMatch(unavailableModel.build.blocker, /Fleet brand|source rights/i);
});

test('project catalog is sourced from Fleet brand configuration', () => {
  const projects = listProductionProjects();
  assert.ok(projects.some((entry) => entry.slug === 'high-signal' && entry.name === 'High Signal'));
  assert.ok(projects.every((entry) => entry.channels.length > 0 && entry.palette.accent));
});
