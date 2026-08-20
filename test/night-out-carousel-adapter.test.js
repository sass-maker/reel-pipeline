import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildNightOutHtml,
  buildSoundtrackMixArgs,
  loadNightOutManifest,
  NightOutCarouselAdapter,
  normalizeNightOutManifest,
} from '../src/adapters/night-out-carousel.js';
import { createRenderer } from '../src/pipeline.js';
import { normalizeVideoBrief } from '../src/video-brief.js';
import { createCastInstance } from '../src/studio/character-directory.js';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'night-out-'));
  const images = [];
  for (let index = 0; index < 4; index += 1) {
    const imagePath = path.join(root, `image-${index + 1}.png`);
    await writeFile(imagePath, Buffer.from(`image-${index + 1}`));
    images.push({ id: `card-${index + 1}`, label: `Theme ${index + 1}`, path: path.basename(imagePath) });
  }
  const manifestPath = path.join(root, 'assets.json');
  await writeFile(manifestPath, JSON.stringify({
    schema: 'fleet.night-out-assets.v1',
    theme: { id: 'test-worlds', label: 'Test worlds' },
    sourcePosture: 'original',
    rightsEvidence: 'Original test fixtures.',
    images,
  }));
  return { root, manifestPath };
}

test('Night Out render mode maps to the dedicated adapter', () => {
  assert.equal(createRenderer('night-out-carousel').constructor.name, 'NightOutCarouselAdapter');
  const brief = normalizeVideoBrief({
    id: 'night-out-mode', projectSlug: 'studio', channel: 'instagram_reels',
    title: 'Night Out', hook: "You're not gonna believe this.", body: 'Script scenes captions and visual assets.',
    renderMode: 'night-out-carousel',
  });
  assert.equal(brief.renderMode, 'night-out-carousel');
});

test('Night Out manifest resolves bounded image paths and rejects escapes', async () => {
  const { root, manifestPath } = await fixture();
  const manifest = await loadNightOutManifest(manifestPath, { assetRoots: [root], rightsEvidence: 'Approved test assets.' });
  assert.equal(manifest.images.length, 4);
  assert.equal(manifest.theme.id, 'test-worlds');
  const resolvedRoot = await realpath(root);
  assert.ok(manifest.images.every((image) => image.path.startsWith(resolvedRoot)));
  assert.throws(() => normalizeNightOutManifest({
    schema: 'fleet.night-out-assets.v1',
    theme: { id: 'escape', label: 'Escape' }, sourcePosture: 'original',
    images: Array.from({ length: 4 }, (_, index) => ({ id: `x-${index}`, label: 'X', path: '../escape.png' })),
  }, { manifestPath, assetRoots: [root] }), /approved local asset root/);
});

test('Night Out manifest rejects symlinks that leave an approved root', async () => {
  const { root, manifestPath } = await fixture();
  const outside = await mkdtemp(path.join(tmpdir(), 'night-outside-'));
  await writeFile(path.join(outside, 'outside.png'), Buffer.from('outside'));
  await symlink(path.join(outside, 'outside.png'), path.join(root, 'linked.png'));
  const raw = JSON.parse(await readFile(manifestPath, 'utf8'));
  raw.images[0].path = 'linked.png';
  await writeFile(manifestPath, JSON.stringify(raw));
  await assert.rejects(
    loadNightOutManifest(manifestPath, { assetRoots: [root], rightsEvidence: 'Approved test assets.' }),
    /approved local asset root/,
  );
});

test('Night Out HTML contains the reveal, cards, theme, and end prompt', async () => {
  const { root, manifestPath } = await fixture();
  const manifest = await loadNightOutManifest(manifestPath, { assetRoots: [root], rightsEvidence: 'Approved test assets.' });
  const html = buildNightOutHtml({
    brief: { hook: "You're not gonna believe this.", cta: 'Pick the next world.' },
    manifest,
    durationSeconds: 13,
  });
  assert.match(html, /gonna believe/);
  assert.match(html, /TEST WORLDS/);
  assert.match(html, /Theme 4/);
  assert.match(html, /Pick the next world/);
  assert.match(html, /data-start/);
});

test('Night Out adapter writes a playable result contract and detailed receipt', async () => {
  const { root, manifestPath } = await fixture();
  const frames = path.join(root, 'frames');
  const adapter = new NightOutCarouselAdapter({
    artifactDir: path.join(root, 'artifacts'),
    assetRoots: [root],
    now: () => new Date('2026-08-04T00:00:00.000Z'),
    screencastRunner: async () => {
      await mkdir(frames, { recursive: true });
      await writeFile(path.join(frames, 'frame-00000.png'), Buffer.from('frame'));
      await writeFile(path.join(frames, 'frame-00001.png'), Buffer.from('frame'));
      return { frameDir: frames, frameCount: 2, fps: 24 };
    },
    commandRunner: async (_binary, args) => {
      await writeFile(args.at(-1), Buffer.from('fixture-video'));
      return { stdout: '', stderr: '' };
    },
  });
  const result = await adapter.createVideo({
    id: 'night-out-proof', projectSlug: 'studio', durationSeconds: 13,
    hook: "You're not gonna believe this.", cta: 'Which universe next?',
    renderOptions: { assetManifestPath: manifestPath, rightsEvidence: 'Approved test assets.' },
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.provider, 'night-out-carousel');
  assert.equal(result.videos.length, 1);
  const receipt = JSON.parse(await readFile(result.raw.manifestPath, 'utf8'));
  assert.equal(receipt.images.length, 4);
  assert.equal(receipt.audio.lane, 'procedural-draft');
  assert.equal(receipt.audio.kind, 'procedural-draft-funk');
  assert.equal(receipt.audio.finalQuality, false);
  assert.equal(receipt.publication, 'review-required');
});

test('Night Out accepts cleared owned music and records the normalized mix', async () => {
  const { root } = await fixture();
  const audioPath = path.join(root, 'owned.wav');
  await writeFile(audioPath, 'owned-audio');
  const adapter = new NightOutCarouselAdapter({ assetRoots: [root] });
  const soundtrack = {
    schema: 'fleet.reel-soundtrack.v1',
    lane: 'owned-local',
    ownedLocal: { path: audioPath, rightsPosture: 'owned', rightsEvidence: 'Operator recording.' },
    mix: { trimStartSeconds: 1, offsetSeconds: 2, loop: true, fadeInSeconds: 0.2, fadeOutSeconds: 0.5, gainDb: -7, ducking: {} },
  };
  const prepared = await adapter.prepareSoundtrack(soundtrack, root, 13);
  assert.equal(prepared.kind, 'owned-local');
  assert.match(prepared.sha256, /^[a-f0-9]{64}$/);
  const args = buildSoundtrackMixArgs({
    silentPath: '/tmp/silent.mp4', audioPath, videoPath: '/tmp/final.mp4', durationSeconds: 13,
    mix: soundtrack.mix,
  });
  assert.ok(args.includes('-stream_loop'));
  assert.ok(args.includes('-ss'));
  assert.match(args[args.indexOf('-filter_complex') + 1], /adelay=2000\|2000/);
  assert.match(args[args.indexOf('-filter_complex') + 1], /volume=-7dB/);
});

test('Night Out keeps official platform sounds out of the encoded file', async () => {
  const { root } = await fixture();
  const adapter = new NightOutCarouselAdapter({ assetRoots: [root] });
  const prepared = await adapter.prepareSoundtrack({
    lane: 'platform-sound',
    platformSound: { provider: 'instagram', url: 'https://www.instagram.com/reels/audio/123', startSeconds: 2 },
  }, root, 13);
  assert.equal(prepared.embed, false);
  assert.equal(prepared.path, null);
  assert.equal(prepared.evidence.provider, 'instagram');
});

test('Night Out parks local card generation even when the model files exist', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'night-out-generated-'));
  for (const relativePath of [
    '.reel-pipeline/engines/stable-diffusion.cpp/bin/sd-cli',
    '.reel-pipeline/models/wai-illustrious-v17/waiIllustriousSDXL_v170.safetensors',
  ]) {
    const target = path.join(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'fixture');
  }
  let request = null;
  const adapter = new NightOutCarouselAdapter({
    modelRootDir: root,
    imageGenerator: {
      generateCards: async (options) => {
        request = options;
        await mkdir(options.outputDir, { recursive: true });
        const images = await Promise.all(Array.from({ length: 4 }, async (_, index) => {
          const imagePath = path.join(options.outputDir, `card-${index + 1}.png`);
          await writeFile(imagePath, `generated-${index + 1}`);
          return imagePath;
        }));
        return { images, sampling: { seed: options.seed } };
      },
    },
  });
  await assert.rejects(adapter.prepareManifest({
    id: 'generated',
    title: 'Original anime night out',
    summary: 'A bouncy rooftop party for fictional adults.',
    creativeDirection: 'Tasteful topless editorial portrait with visible adult nudity.',
    renderOptions: {
      themePackId: 'original-anime',
      modelProfileId: 'wai-illustrious-v17-sdcpp',
      contentScope: 'mature-enabled',
    },
    cast: [createCastInstance({
      schema: 'fleet.character.v1', id: 'rhea', revision: 2,
      createdAt: '2026-08-05T00:00:00Z', updatedAt: '2026-08-05T00:00:00Z',
      name: 'Rhea', fictional: true, age: 28, adultConfirmed: true, consentPosture: 'affirmative',
      appearance: { hair: 'black bob' }, wardrobe: ['silver dress'], palette: [],
      promptTokens: [], negativeConstraints: ['identity drift'], continuityNotes: null, references: [],
      sourcePosture: 'original', likenessPosture: 'fictional', likenessEvidence: null,
    })],
  }, path.join(root, 'artifact')), /Local image generation is parked/i);
  assert.equal(request, null);
});
