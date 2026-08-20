import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  listExploreGallery,
  listRepresentativeExploreGallery,
  openExploreGalleryMedia,
  openRepresentativeExploreGalleryMedia,
  validateExploreGallery,
  validateExploreGalleryMedia,
  validateRepresentativeExploreGallery,
  validateRepresentativeExploreGalleryMedia,
} from '../src/studio/explore-gallery.js';

function fixtureConfig(source = 'sample.mp4') {
  return {
    schema: 'fleet.video-explore-gallery.v1',
    version: 1,
    items: [{
      id: 'kinetic-proof',
      title: 'Kinetic proof',
      family: 'Motion graphics',
      description: 'A real local fixture.',
      engine: 'HTML / Canvas',
      sourcePosture: 'local-render',
      qualityTier: 'showcase',
      spend: 'No API spend',
      variantId: 'web-motion--visualstyle-kinetic-type',
      source,
    }],
  };
}

function representativeFixtureConfig(source = 'sample.mp4') {
  return {
    schema: 'fleet.video-explore-gallery-representatives.v1',
    version: 1,
    coverage: { exactOptionCount: 1, totalCapabilityCount: 1, provenCapabilityCount: 1, proofCount: 1, unproven: [] },
    items: [{
      ...fixtureConfig(source).items[0],
      recipeId: 'web-motion',
      proofRole: 'primary',
      rangeLabel: 'HTML motion · kinetic hierarchy',
      motionTags: ['kinetic-type'],
      renderer: 'html-composition@1',
      intendedRuntime: 'HTML / Canvas',
      executionMode: 'real',
      durationSeconds: 8,
      evidence: 'evidence.json',
    }],
  };
}

const representativeOptions = (root) => ({
  representativeRoot: root,
  variants: [{ id: 'web-motion--visualstyle-kinetic-type', recipeId: 'web-motion' }],
  recipes: [{ id: 'web-motion' }],
});

test('gallery registry reports playable media without exposing local paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'explore-gallery-'));
  await writeFile(path.join(root, 'sample.mp4'), Buffer.from('playable fixture'));
  const gallery = await listExploreGallery({ galleryRoot: root, galleryConfig: fixtureConfig() });
  assert.equal(gallery.count, 1);
  assert.equal(gallery.playableCount, 1);
  assert.deepEqual(gallery.families, ['Motion graphics']);
  assert.equal(gallery.items[0].playable, true);
  assert.equal(gallery.items[0].mediaUrl, '/studio/explore-gallery/kinetic-proof/media');
  assert.equal('source' in gallery.items[0], false);
  assert.equal('resolvedSource' in gallery.items[0], false);

  const media = await openExploreGalleryMedia('kinetic-proof', { galleryRoot: root, galleryConfig: fixtureConfig() });
  assert.equal(media.path, path.join(root, 'sample.mp4'));
  assert.equal(media.contentType, 'video/mp4');
  assert.equal(media.size, 16);
});

test('gallery registry preserves unavailable samples and rejects unsafe definitions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'explore-gallery-'));
  const gallery = await listExploreGallery({ galleryRoot: root, galleryConfig: fixtureConfig('missing.mp4') });
  assert.equal(gallery.playableCount, 0);
  assert.equal(gallery.items[0].playable, false);
  assert.equal(gallery.items[0].mediaUrl, null);
  assert.equal(await openExploreGalleryMedia('missing', { galleryRoot: root, galleryConfig: fixtureConfig() }), null);
  assert.throws(
    () => validateExploreGallery(fixtureConfig('../escape.mp4'), { galleryRoot: root }),
    /escapes the gallery root/,
  );
  assert.throws(
    () => validateExploreGallery({ ...fixtureConfig(), items: [{ ...fixtureConfig().items[0], variantId: 'made-up' }] }, { galleryRoot: root }),
    /unknown variant/,
  );
  assert.throws(
    () => validateExploreGallery({ ...fixtureConfig(), items: [...fixtureConfig().items, fixtureConfig().items[0]] }, { galleryRoot: root }),
    /duplicate explore gallery id/,
  );
});

test('checked-in gallery is complete, playable, hash-valid, and portable', async () => {
  const gallery = await listExploreGallery();
  assert.equal(gallery.version, 2);
  assert.equal(gallery.count, 49);
  assert.equal(gallery.playableCount, 49);
  assert.equal(new Set(gallery.items.map((item) => item.variantId)).size, 49);
  const blenderProofs = gallery.items.filter((item) => item.variantId.startsWith('blender-film--'));
  const videoModelProofs = gallery.items.filter((item) => item.variantId.startsWith('coherent-local-film--'));
  const remainingFixtures = gallery.items.filter((item) => !blenderProofs.includes(item) && !videoModelProofs.includes(item));
  assert.equal(blenderProofs.length, 8);
  assert.ok(blenderProofs.every((item) => item.sourcePosture === 'local-render'
    && item.executionMode === 'real'
    && item.renderer === 'blender-eevee-animation@1'));
  assert.equal(videoModelProofs.length, 3);
  assert.ok(videoModelProofs.every((item) => item.sourcePosture === 'local-model-proof'
    && item.executionMode === 'real'
    && item.renderer === 'ltx-2.3-mlx-q4'));
  assert.ok(remainingFixtures.every((item) => item.sourcePosture === 'fixture' && item.executionMode === 'fixture'));
  const validation = await validateExploreGalleryMedia();
  assert.equal(validation.variants, 49);
  assert.ok(validation.totalBytes > 0 && validation.totalBytes < 8 * 1024 * 1024);
});

test('representative registry requires substantive proof and compatible coverage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'representative-gallery-'));
  await writeFile(path.join(root, 'sample.mp4'), Buffer.from('representative video'));
  await writeFile(path.join(root, 'evidence.json'), Buffer.from('{}'));
  const gallery = await listRepresentativeExploreGallery({
    ...representativeOptions(root),
    representativeConfig: representativeFixtureConfig(),
  });
  assert.equal(gallery.provenCapabilityCount, 1);
  assert.equal(gallery.exactOptionCount, 1);
  assert.equal(gallery.proofCount, 1);
  assert.equal(gallery.items[0].durationSeconds, 8);
  assert.equal(gallery.items[0].mediaUrl, '/studio/explore-gallery/representatives/kinetic-proof/media');
  const media = await openRepresentativeExploreGalleryMedia('kinetic-proof', {
    ...representativeOptions(root),
    representativeConfig: representativeFixtureConfig(),
  });
  assert.equal(media.path, path.join(root, 'sample.mp4'));
  assert.throws(
    () => validateRepresentativeExploreGallery({
      ...representativeFixtureConfig(),
      items: [{ ...representativeFixtureConfig().items[0], sourcePosture: 'fixture' }],
    }, representativeOptions(root)),
    /placeholder proof cannot be representative/,
  );
  assert.throws(
    () => validateRepresentativeExploreGallery({
      ...representativeFixtureConfig(),
      items: [{ ...representativeFixtureConfig().items[0], durationSeconds: 2 }],
    }, representativeOptions(root)),
    /duration must be 6–15 seconds/,
  );
});

test('checked-in representative gallery is honest, playable, and hash-valid', async () => {
  const gallery = await listRepresentativeExploreGallery();
  assert.equal(gallery.totalCapabilityCount, 13);
  assert.equal(gallery.provenCapabilityCount, 9);
  assert.equal(gallery.proofCount, 14);
  assert.equal(gallery.playableCount, 14);
  assert.equal(gallery.exactOptionCount, 49);
  assert.deepEqual(gallery.unproven.map((entry) => entry.recipeId), ['grok-asset-film', 'guided-app-demo', 'product-proof', 'night-out-carousel']);
  assert.ok(gallery.items.every((item) => item.durationSeconds >= 6 && item.durationSeconds <= 15));
  assert.ok(gallery.items.every((item) => item.sourcePosture !== 'fixture' && item.executionMode === 'real'));
  assert.ok(gallery.items.every((item) => ['primary', 'range'].includes(item.proofRole)));
  assert.ok(gallery.items.every((item) => item.rangeLabel && item.motionTags.length));
  assert.ok(gallery.items.every((item) => item.posterUrl?.endsWith('/poster')));
  assert.equal(gallery.items.find((item) => item.recipeId === 'threejs-scene')?.renderer, 'three-webgl-visual-lab@2');
  const validation = await validateRepresentativeExploreGalleryMedia();
  assert.equal(validation.capabilities, 9);
  assert.equal(validation.proofs, 14);
  assert.ok(validation.totalBytes > 0);
});
