import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

function representativeQualityReview(overrides = {}) {
  return {
    schema: 'fleet.video-explore-gallery-quality-review.v1',
    reviews: [{ id: 'kinetic-proof', score: 19, decision: 'improved', reason: 'A linear claim, evidence, and conclusion sequence.', ...overrides }],
  };
}

const representativeOptions = (root, qualityReview = representativeQualityReview()) => ({
  representativeRoot: root,
  variants: [{ id: 'web-motion--visualstyle-kinetic-type', recipeId: 'web-motion' }],
  recipes: [{ id: 'web-motion' }],
  qualityReview,
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

test('representative registry binds every visible proof to a scored quality review', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'representative-review-'));
  await writeFile(path.join(root, 'sample.mp4'), Buffer.from('representative video'));
  await writeFile(path.join(root, 'evidence.json'), Buffer.from('{}'));
  const showcase = representativeFixtureConfig();
  assert.equal(showcase.items[0].qualityTier, 'showcase');

  assert.throws(
    () => validateRepresentativeExploreGallery(showcase, representativeOptions(root, { schema: 'fleet.video-explore-gallery-quality-review.v1', reviews: [] })),
    /a quality review entry is required/,
  );
  assert.throws(
    () => validateRepresentativeExploreGallery(showcase, representativeOptions(root, representativeQualityReview({ decision: 'removed' }))),
    /a removed proof cannot stay visible/,
  );
  assert.throws(
    () => validateRepresentativeExploreGallery(showcase, representativeOptions(root, representativeQualityReview({ score: null, decision: 'replacement' }))),
    /showcase tier requires a scored quality review/,
  );
  assert.throws(
    () => validateRepresentativeExploreGallery(showcase, representativeOptions(root, representativeQualityReview({ score: 13, decision: 'kept-as-experiment' }))),
    /showcase tier requires a review score of at least 15, not 13/,
  );

  // An unscored or low-scoring proof may still ship, but only at experiment tier.
  const experiment = { ...showcase, items: [{ ...showcase.items[0], qualityTier: 'experiment' }] };
  const unscored = validateRepresentativeExploreGallery(experiment, representativeOptions(root, representativeQualityReview({ score: null, decision: 'replacement' })));
  assert.equal(unscored.items[0].review.score, null);
  const lowScore = validateRepresentativeExploreGallery(experiment, representativeOptions(root, representativeQualityReview({ score: 13, decision: 'kept-as-experiment' })));
  assert.equal(lowScore.items[0].review.score, 13);
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

  // Every showcase claim is backed by a scored review; the two 13/14-scoring proofs and
  // the never-scored ASCII replacement ship at experiment tier instead.
  assert.ok(gallery.items.every((item) => item.qualityTier !== 'showcase' || item.review.score >= 15));
  assert.deepEqual(
    gallery.items.filter((item) => item.qualityTier === 'experiment').map((item) => [item.id, item.review.score]),
    [
      ['representative-ascii-kinetic', null],
      ['representative-local-voice-film', 14],
      ['representative-three-cel', 13],
      ['representative-podcast-short', 16],
    ],
  );

  const validation = await validateRepresentativeExploreGalleryMedia();
  assert.equal(validation.capabilities, 9);
  assert.equal(validation.proofs, 14);
  assert.ok(validation.totalBytes > 0);
});

test('representative coverage has exactly one ledger and explains absent receipts', async () => {
  const representativeRoot = new URL('../fixtures/video-gallery/representatives/', import.meta.url);

  // A second, unread proof manifest under fixtures/ silently under-reported the unproven
  // set. config/explore-gallery-representatives.json is the only coverage ledger.
  assert.equal(existsSync(new URL('manifest.json', representativeRoot)), false);
  const builder = readFileSync(new URL('../scripts/build-representative-gallery.js', import.meta.url), 'utf8');
  assert.equal(builder.includes("writeFile(path.join(representativeRoot, 'manifest.json')"), false, 'the builder must not write a second ledger');
  assert.equal(builder.includes("exists(path.join(representativeRoot, 'manifest.json'))"), true, 'the builder must fail if a second ledger reappears');

  const gallery = await listRepresentativeExploreGallery();
  for (const item of gallery.items) {
    const evidence = JSON.parse(readFileSync(new URL(`../${item.evidence}`, import.meta.url), 'utf8'));
    const receipt = evidence.source?.receipt;
    if (typeof receipt !== 'string' || !receipt.length) continue;
    assert.equal(path.isAbsolute(receipt), false, `${item.id}: receipt must be repository-relative`);
    if (existsSync(new URL(`../${receipt}`, import.meta.url))) continue;
    assert.ok(
      String(evidence.source.receiptLocation ?? '').trim().length > 0,
      `${item.id}: an absent receipt must carry a receiptLocation explanation`,
    );
  }

  // The guided-app-demo blocker must describe the current state, not the removed proof.
  const guided = gallery.unproven.find((entry) => entry.recipeId === 'guided-app-demo');
  assert.match(guided.reason, /5\.5s/);
  assert.match(guided.reason, /fixtures\/guided-app-demo\/cartoon-hand-pointer\/evidence\.json/);
  const demoEvidence = JSON.parse(readFileSync(new URL('../fixtures/guided-app-demo/cartoon-hand-pointer/evidence.json', import.meta.url), 'utf8'));
  assert.equal(demoEvidence.outputs.find((output) => output.key === 'cartoonHand').durationSeconds, 5.5);
});
