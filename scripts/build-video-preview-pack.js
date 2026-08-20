#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { listRecipeVariants } from '../src/studio/production-catalog.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACK_ROOT = path.join(ROOT, 'fixtures/video-gallery');
const SOURCE_ROOT = path.join(PACK_ROOT, 'sources');
const VIDEO_ROOT = path.join(PACK_ROOT, 'videos');
const IMAGE_STORY_ROOT = path.join(PACK_ROOT, 'assets/image-stories');
const PROOF_ROOT = path.join(PACK_ROOT, 'proofs');
const RASTER_ROOT = path.join(ROOT, 'tmp/video-gallery-rasters');
const MANIFEST_PATH = path.join(PACK_ROOT, 'manifest.json');
const GALLERY_PATH = path.join(ROOT, 'config/explore-gallery.json');
const DURATION_SECONDS = 2.4;
const WIDTH = 360;
const HEIGHT = 640;
const TOTAL_BYTE_BUDGET = 8 * 1024 * 1024;
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';
const SIPS = process.env.SIPS_PATH ?? 'sips';

const FAMILY = {
  'image-slideshow': 'Image stories',
  'web-motion': 'Motion graphics',
  'ascii-story': 'Graphic experiments',
  'night-out-carousel': 'Image stories',
  'product-proof': 'Product proof',
  'local-voice-film': 'Narrated stories',
  'grok-asset-film': 'Imported generation',
  'blender-film': '3D worlds',
  'threejs-scene': '3D and diagrams',
  'guided-app-demo': 'Product proof',
  'coherent-local-film': 'Generated cinema',
  'podcast-short': 'Editorial remix',
  'literal-lyric-video': 'Music and lyrics',
};

const PALETTES = [
  ['#07100f', '#79dcc8', '#e8fff9', '#223f3a'],
  ['#0c0b12', '#c5a7ff', '#f5efff', '#382d50'],
  ['#0f0b08', '#f2b46f', '#fff3df', '#4f3522'],
  ['#07101a', '#79b8ff', '#edf7ff', '#203d5f'],
  ['#14090f', '#ff8fb8', '#fff0f6', '#52243a'],
  ['#12120e', '#d9e785', '#fbffdf', '#424827'],
];

const IMAGE_STORY_ASSETS = [
  'cinematic-world.webp',
  'editorial-world.webp',
  'three-dimensional-world.webp',
  'illustrated-world.webp',
  'motion-world.webp',
  'ascii-world.webp',
].map((name) => path.join(IMAGE_STORY_ROOT, name));
const REAL_PROOF_EVIDENCE = [
  path.join(PROOF_ROOT, 'blender/evidence.json'),
  path.join(PROOF_ROOT, 'video-model/evidence.json'),
];

const checkOnly = process.argv.includes('--check');

await mkdir(SOURCE_ROOT, { recursive: true });
await mkdir(VIDEO_ROOT, { recursive: true });
await mkdir(RASTER_ROOT, { recursive: true });

if (checkOnly) {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const failures = [];
  let totalBytes = 0;
  for (const item of manifest.items ?? []) {
    const videoPath = path.join(ROOT, item.source);
    const info = await stat(videoPath).catch(() => null);
    if (!info?.isFile()) {
      failures.push(`${item.variantId}: missing`);
      continue;
    }
    totalBytes += info.size;
    const digest = sha256(await readFile(videoPath));
    if (digest !== item.sha256) failures.push(`${item.variantId}: sha256 mismatch`);
    if (isRangeProofVariant(item.variantId)) {
      if (!['local-render', 'local-model-proof'].includes(item.sourcePosture) || item.executionMode !== 'real') {
        failures.push(`${item.variantId}: real proof posture missing`);
      }
      if (item.renderer === 'ffmpeg-svg-fixture@1') failures.push(`${item.variantId}: generic fixture renderer is not a range proof`);
      const sourceProofPath = item.sourceProof ? path.join(ROOT, item.sourceProof) : null;
      const sourceProofInfo = sourceProofPath ? await stat(sourceProofPath).catch(() => null) : null;
      if (!sourceProofInfo?.isFile()) failures.push(`${item.variantId}: proof source missing`);
      else if (sha256(await readFile(sourceProofPath)) !== item.sourceProofSha256) failures.push(`${item.variantId}: proof source sha256 mismatch`);
      const proofEvidencePath = item.proofEvidence ? path.join(ROOT, item.proofEvidence) : null;
      if (!proofEvidencePath || !(await stat(proofEvidencePath).catch(() => null))?.isFile()) {
        failures.push(`${item.variantId}: proof evidence missing`);
      }
      if (item.variantId.startsWith('coherent-local-film--')) {
        if (!item.prompt || !item.keyframeSha256 || !item.modelRevision) failures.push(`${item.variantId}: local-model generation evidence incomplete`);
      }
    }
    const probe = await probeVideo(videoPath).catch((error) => ({ error: error.message }));
    if (probe.error) failures.push(`${item.variantId}: ${probe.error}`);
    else {
      if (probe.width !== WIDTH || probe.height !== HEIGHT) failures.push(`${item.variantId}: expected ${WIDTH}x${HEIGHT}`);
      if (!probe.hasAudio) failures.push(`${item.variantId}: audio stream missing`);
      if (probe.duration < 2 || probe.duration > 3) failures.push(`${item.variantId}: duration ${probe.duration}`);
    }
  }
  const expectedVariants = listRecipeVariants().length;
  if ((manifest.items ?? []).length !== expectedVariants) failures.push(`expected ${expectedVariants} previews, found ${(manifest.items ?? []).length}`);
  if (totalBytes > TOTAL_BYTE_BUDGET) failures.push(`preview pack exceeds ${TOTAL_BYTE_BUDGET} bytes`);
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({ status: 'pass', variants: expectedVariants, totalBytes }, null, 2));
  process.exit(0);
}

const variants = listRecipeVariants();
const realProofs = await loadRealProofs();
const items = [];
for (const [index, variant] of variants.entries()) {
  const sourceName = `${variant.id}.svg`;
  const videoName = `${variant.id}.mp4`;
  const sourcePath = path.join(SOURCE_ROOT, sourceName);
  const videoPath = path.join(VIDEO_ROOT, videoName);
  const rasterPath = path.join(RASTER_ROOT, `${variant.id}.png`);
  const isImageSlideshow = variant.recipeId === 'image-slideshow';
  const realProof = realProofs.get(variant.id);
  let sourceFixture;
  let sourceSha256;
  let sourceAssets;
  let sourceAssetSha256s;
  let sourceProof;
  let sourceProofSha256;
  if (isImageSlideshow) {
    const imagePaths = imageStoryAssetsFor(index);
    await renderImageSlideshowPreview(variant.values.visualStyle, imagePaths, videoPath, 180 + (index * 17) % 280);
    sourceAssets = imagePaths.map((assetPath) => path.relative(ROOT, assetPath));
    sourceAssetSha256s = await Promise.all(imagePaths.map(async (assetPath) => sha256(await readFile(assetPath))));
  } else if (realProof) {
    const proofPath = path.join(ROOT, realProof.source);
    await renderProofPreview(proofPath, videoPath, 180 + (index * 17) % 280);
    sourceProof = realProof.source;
    sourceProofSha256 = realProof.sha256;
  } else {
    const svg = fixtureSvg(variant, index);
    await writeFile(sourcePath, svg);
    await rasterizeSvg(sourcePath, rasterPath);
    await renderPreview(rasterPath, videoPath, 180 + (index * 17) % 280, index);
    sourceFixture = path.relative(ROOT, sourcePath);
    sourceSha256 = sha256(Buffer.from(svg));
  }
  const videoBytes = await readFile(videoPath);
  const probe = await probeVideo(videoPath);
  items.push({
    id: `fixture-${variant.id}`,
    title: variant.label,
    family: FAMILY[variant.recipeId],
    description: realProof
      ? `${variant.outputStyle}. A real ${variant.recipeId === 'blender-film' ? 'Blender 5.2 animation' : 'local LTX image-to-video'} proof of this exact option.`
      : isImageSlideshow
        ? `${variant.outputStyle}. A deterministic multi-image preview of this exact option.`
        : `${variant.outputStyle}. A deterministic preview of this exact option.`,
    engine: realProof?.engine ?? (isImageSlideshow ? 'Fleet image sequence renderer' : 'Fleet fixture renderer'),
    renderer: realProof?.renderer ?? (isImageSlideshow ? 'ffmpeg-image-sequence@1' : 'ffmpeg-svg-fixture@1'),
    intendedRuntime: variant.runtime,
    sourcePosture: realProof?.sourcePosture ?? 'fixture',
    executionMode: realProof ? 'real' : 'fixture',
    qualityTier: 'showcase',
    spend: variant.spend.label,
    variantId: variant.id,
    prompt: realProof?.prompt ?? promptFor(variant),
    source: path.relative(ROOT, videoPath),
    ...(sourceFixture ? { sourceFixture } : {}),
    ...(sourceAssets ? { sourceAssets } : {}),
    evidence: realProof?.evidencePath ?? path.relative(ROOT, MANIFEST_PATH),
    ...(sourceProof ? { sourceProof } : {}),
    ...(realProof?.evidencePath ? { proofEvidence: realProof.evidencePath } : {}),
    sha256: sha256(videoBytes),
    ...(sourceSha256 ? { sourceSha256 } : {}),
    ...(sourceAssetSha256s ? { sourceAssetSha256s } : {}),
    ...(sourceProofSha256 ? { sourceProofSha256 } : {}),
    ...(realProof?.keyframe ? { keyframe: realProof.keyframe } : {}),
    ...(realProof?.keyframeSha256 ? { keyframeSha256: realProof.keyframeSha256 } : {}),
    ...(realProof?.modelRevision ? { modelRevision: realProof.modelRevision } : {}),
    media: probe,
  });
  process.stdout.write(`built ${index + 1}/${variants.length} ${variant.id}\n`);
}

const totalBytes = (await Promise.all(items.map((item) => stat(path.join(ROOT, item.source))))).reduce((sum, info) => sum + info.size, 0);
if (totalBytes > TOTAL_BYTE_BUDGET) throw new Error(`preview pack exceeds ${TOTAL_BYTE_BUDGET} bytes: ${totalBytes}`);

const manifest = {
  schema: 'fleet.video-preview-pack.v1',
  version: 1,
  generatedAt: '2026-08-01T00:00:00.000Z',
  renderer: 'fleet-gallery-fixtures@2',
  rights: 'Original deterministic image, text, tone, and vector fixtures; no commercial media.',
  width: WIDTH,
  height: HEIGHT,
  durationSeconds: DURATION_SECONDS,
  totalBytes,
  items,
};
await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

const gallery = {
  schema: 'fleet.video-explore-gallery.v1',
  version: 2,
  items: items.map(({ sourceFixture, sourceSha256, sourceAssets, sourceAssetSha256s, media, ...item }) => item),
};
await writeFile(GALLERY_PATH, `${JSON.stringify(gallery, null, 2)}\n`);
console.log(JSON.stringify({ status: 'built', variants: items.length, totalBytes, manifest: path.relative(ROOT, MANIFEST_PATH) }, null, 2));

function fixtureSvg(variant, index) {
  const [background, accent, text, surface] = PALETTES[index % PALETTES.length];
  const option = Object.values(variant.values).filter((value) => value !== '' && value !== false).join(' · ') || 'default';
  const titleLines = wrap(variant.name.toUpperCase(), 19, 2);
  const optionLines = wrap(humanize(option), 24, 3);
  const visual = visualFor(variant, accent, surface, text, index);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${background}"/><stop offset="1" stop-color="${surface}"/></linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="360" height="640" fill="url(#wash)"/>
  <circle cx="310" cy="76" r="82" fill="${accent}" opacity=".12" filter="url(#soft)"/>
  <text x="28" y="39" fill="${accent}" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="700" letter-spacing="1.8">FLEET · FIXTURE PREVIEW</text>
  ${visual}
  ${titleLines.map((line, lineIndex) => `<text x="28" y="${430 + lineIndex * 30}" fill="${text}" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="800" letter-spacing="-.8">${escapeXml(line)}</text>`).join('')}
  ${optionLines.map((line, lineIndex) => `<text x="28" y="${510 + lineIndex * 19}" fill="${accent}" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="700">${escapeXml(line)}</text>`).join('')}
  <line x1="28" y1="596" x2="332" y2="596" stroke="${accent}" opacity=".34"/>
  <text x="28" y="618" fill="${text}" opacity=".7" font-family="Arial,Helvetica,sans-serif" font-size="10">${escapeXml(variant.runtime)} · ${index + 1}/${variant.recipeId === 'night-out-carousel' ? variants.length : 48}</text>
</svg>`;
}

function visualFor(variant, accent, surface, text, index) {
  const recipeId = variant.recipeId;
  const selected = Object.values(variant.values).find((value) => value !== '' && value !== false);
  const style = String(selected ?? 'default');
  const shift = index % 5;
  if (recipeId === 'image-slideshow') return imageVisual(style, accent, surface, text, shift);
  if (recipeId === 'web-motion') return webVisual(style, accent, surface, text);
  if (recipeId === 'ascii-story') return `<g fill="${accent}" font-family="Menlo,monospace" font-size="15" opacity=".9"><text x="48" y="125">+--------------------------+</text><text x="48" y="151">|  *   .   /\\    .  *     |</text><text x="48" y="177">|     __ /  \\ __          |</text><text x="48" y="203">|  . /  V /\\ V  \\   .    |</text><text x="48" y="229">|   /___ /  \\ ___\\       |</text><text x="48" y="255">|      &gt; SIGNAL_           |</text><text x="48" y="281">+--------------------------+</text></g>`;
  if (recipeId === 'night-out-carousel') return `<g transform="rotate(-5 180 220)"><rect x="66" y="96" width="228" height="286" rx="8" fill="${text}"/><rect x="80" y="112" width="200" height="220" rx="4" fill="${accent}" opacity=".38"/><circle cx="130" cy="182" r="38" fill="${surface}"/><circle cx="215" cy="167" r="45" fill="${text}" opacity=".28"/><path d="M96 306l45-61 39 38 42-70 44 93z" fill="${surface}"/><text x="180" y="361" text-anchor="middle" fill="${surface}" font-family="Arial" font-size="18" font-weight="900">NIGHT OUT</text></g>`;
  if (recipeId === 'product-proof') return productVisual(style, accent, surface, text);
  if (recipeId === 'local-voice-film' || recipeId === 'podcast-short') return `<g><circle cx="180" cy="192" r="70" fill="${accent}" opacity=".2"/><circle cx="180" cy="185" r="35" fill="${accent}" opacity=".65"/><path d="M70 300v-35m18 35v-62m18 62v-28m18 28v-84m18 84v-48m18 48v-99m18 99v-55m18 55v-79m18 79v-39m18 39v-68m18 68v-31m18 31v-52" stroke="${accent}" stroke-width="7"/></g>`;
  if (recipeId === 'grok-asset-film') return `<g><rect x="52" y="99" width="256" height="244" rx="10" fill="${surface}" stroke="${accent}"/><path d="M72 118h22v18H72zm194 0h22v18h-22zM72 306h22v18H72zm194 0h22v18h-22z" fill="${accent}" opacity=".65"/><path d="M151 170l87 51-87 51z" fill="${accent}"/><rect x="102" y="290" width="156" height="8" fill="${text}" opacity=".35"/></g>`;
  if (recipeId === 'blender-film') return blenderVisual(style, accent, surface, text);
  if (recipeId === 'threejs-scene') return threeVisual(style, accent, surface, text);
  if (recipeId === 'guided-app-demo') return guidedVisual(style, accent, surface, text);
  if (recipeId === 'coherent-local-film') return coherentVisual(style, accent, surface, text);
  if (recipeId === 'podcast-short') return podcastVisual(style, accent, surface, text);
  return lyricVisual(style, variant.values.useBlender === true, accent, surface, text);
}

function imageVisual(style, accent, surface, text, shift) {
  if (style === 'editorial-cutout') return `<g><rect x="43" y="102" width="274" height="252" fill="${text}" opacity=".08"/><circle cx="226" cy="214" r="91" fill="${accent}"/><path d="M94 336V166h88v170z" fill="${surface}"/><text x="63" y="151" fill="${text}" font-family="Arial" font-size="42" font-weight="900">A</text><path d="M194 321c18-94 83-125 107-118v118z" fill="${text}" opacity=".72"/></g>`;
  if (style === 'filmstrip') return `<g><rect x="61" y="91" width="238" height="276" fill="${surface}" stroke="${accent}"/><path d="M72 105h16v16H72zm0 38h16v16H72zm0 38h16v16H72zm0 38h16v16H72zm0 38h16v16H72zm0 38h16v16H72zm0 38h16v16H72zm200-228h16v16h-16zm0 38h16v16h-16zm0 38h16v16h-16zm0 38h16v16h-16zm0 38h16v16h-16zm0 38h16v16h-16zm0 38h16v16h-16z" fill="${accent}"/><rect x="101" y="119" width="158" height="96" fill="${text}" opacity=".14"/><rect x="101" y="233" width="158" height="100" fill="${accent}" opacity=".3"/></g>`;
  if (style === 'split-frame') return `<g><rect x="42" y="100" width="132" height="260" fill="${accent}" opacity=".28"/><rect x="186" y="100" width="132" height="260" fill="${text}" opacity=".08"/><circle cx="108" cy="210" r="44" fill="${text}" opacity=".74"/><path d="M205 321l34-83 30 38 28-70 7 115z" fill="${accent}"/><path d="M180 100v260" stroke="${text}" stroke-width="3"/></g>`;
  if (style === 'polaroid-stack') return `<g transform="rotate(-7 180 220)"><rect x="59" y="113" width="202" height="235" fill="${text}" opacity=".35"/></g><g transform="rotate(8 190 220)"><rect x="105" y="92" width="202" height="235" fill="${text}"/><rect x="119" y="108" width="174" height="168" fill="${accent}" opacity=".4"/><circle cx="205" cy="187" r="42" fill="${surface}"/><path d="M128 261l43-52 34 33 36-48 44 67z" fill="${surface}" opacity=".8"/></g>`;
  if (style === 'soft-parallax') return `<g><circle cx="253" cy="148" r="57" fill="${accent}" opacity=".55"/><path d="M32 331l91-142 60 73 52-112 94 181z" fill="${text}" opacity=".12"/><path d="M23 354l96-91 48 42 57-85 117 134z" fill="${accent}" opacity=".28"/><path d="M41 371l81-54 55 31 69-60 73 83z" fill="${surface}" stroke="${accent}"/></g>`;
  return `<g transform="translate(${shift * 2} 0)"><rect x="38" y="90" width="205" height="252" rx="5" fill="${text}" opacity=".12"/><rect x="73" y="111" width="238" height="268" rx="5" fill="${accent}" opacity=".28"/><rect x="98" y="137" width="205" height="210" rx="3" fill="${surface}" stroke="${accent}"/><circle cx="201" cy="211" r="46" fill="${accent}" opacity=".55"/><path d="M113 328l58-72 37 40 36-50 44 82z" fill="${text}" opacity=".72"/></g>`;
}

function webVisual(style, accent, surface, text) {
  if (style === 'editorial-grid') return `<g><path d="M42 100h276v270H42zM42 190h276M180 100v270" fill="none" stroke="${accent}" opacity=".5"/><rect x="58" y="116" width="105" height="58" fill="${text}"/><rect x="197" y="116" width="104" height="22" fill="${accent}"/><rect x="197" y="149" width="72" height="12" fill="${text}" opacity=".35"/><circle cx="110" cy="278" r="49" fill="${accent}" opacity=".3"/><path d="M198 225h102v118H198z" fill="${text}" opacity=".08"/></g>`;
  if (style === 'data-pulse') return `<g fill="none" stroke="${accent}"><circle cx="180" cy="225" r="113" opacity=".18"/><circle cx="180" cy="225" r="78" opacity=".4" stroke-width="5"/><circle cx="180" cy="225" r="42" stroke-width="12"/><path d="M56 331l58-61 43 29 66-108 81 70" stroke="${text}" stroke-width="5"/></g>`;
  if (style === 'modular-cards') return `<g><rect x="46" y="94" width="268" height="74" fill="${accent}" opacity=".32"/><rect x="46" y="181" width="128" height="162" fill="${text}" opacity=".1"/><rect x="186" y="181" width="128" height="74" fill="${surface}" stroke="${accent}"/><rect x="186" y="269" width="128" height="74" fill="${accent}" opacity=".18"/><circle cx="83" cy="131" r="19" fill="${accent}"/><path d="M116 123h154M116 140h96" stroke="${text}" opacity=".6" stroke-width="8"/></g>`;
  if (style === 'diagram-flow') return `<g stroke="${accent}" stroke-width="4"><circle cx="77" cy="227" r="35" fill="${surface}"/><circle cx="180" cy="137" r="42" fill="${accent}"/><circle cx="283" cy="227" r="35" fill="${surface}"/><rect x="138" y="294" width="84" height="60" fill="${text}" opacity=".16"/><path d="M105 205l43-40m64 0l43 40M91 257l57 54m64 0l57-54" fill="none"/></g>`;
  if (style === 'minimal-statement') return `<g><path d="M56 122h248" stroke="${accent}"/><text x="180" y="209" text-anchor="middle" fill="${text}" font-family="Arial" font-size="48" font-weight="900">ONE</text><text x="180" y="259" text-anchor="middle" fill="${accent}" font-family="Arial" font-size="48" font-weight="900">IDEA.</text><path d="M112 310h136" stroke="${text}" stroke-width="10" opacity=".16"/></g>`;
  return `<g><circle cx="180" cy="225" r="112" fill="none" stroke="${accent}" opacity=".25" stroke-width="2"/><circle cx="180" cy="225" r="76" fill="none" stroke="${accent}" stroke-width="8" stroke-dasharray="92 28"/><rect x="71" y="164" width="218" height="34" fill="${text}" opacity=".9"/><rect x="101" y="216" width="158" height="18" fill="${accent}"/><rect x="126" y="254" width="108" height="12" fill="${text}" opacity=".5"/></g>`;
}

function productVisual(style, accent, surface, text) {
  if (style === 'changelog') return `<g><rect x="52" y="92" width="256" height="276" fill="${surface}" stroke="${accent}"/><text x="74" y="132" fill="${text}" font-family="Arial" font-size="18" font-weight="800">WHAT CHANGED</text><circle cx="80" cy="178" r="8" fill="${accent}"/><path d="M102 174h164M102 190h111" stroke="${text}" opacity=".5" stroke-width="7"/><circle cx="80" cy="237" r="8" fill="${accent}"/><path d="M102 233h131M102 249h85" stroke="${text}" opacity=".5" stroke-width="7"/><circle cx="80" cy="296" r="8" fill="${accent}"/><path d="M102 292h176M102 308h103" stroke="${text}" opacity=".5" stroke-width="7"/></g>`;
  if (style === 'mini-demo') return `<g><rect x="42" y="98" width="276" height="246" rx="8" fill="${surface}" stroke="${accent}"/><rect x="58" y="132" width="244" height="38" fill="${text}" opacity=".08"/><rect x="58" y="187" width="115" height="130" fill="${accent}" opacity=".24"/><rect x="186" y="187" width="116" height="61" fill="${text}" opacity=".12"/><path d="M210 280h68" stroke="${accent}" stroke-width="16"/><path d="M202 234l20 54 13-19 22 12-55-47z" fill="${text}"/></g>`;
  return `<g><rect x="42" y="104" width="276" height="236" rx="8" fill="${surface}" stroke="${accent}"/><line x1="180" y1="141" x2="180" y2="321" stroke="${accent}" opacity=".4"/><rect x="61" y="163" width="92" height="102" fill="${text}" opacity=".12"/><rect x="207" y="163" width="92" height="102" fill="${accent}" opacity=".32"/><path d="M145 296h70" stroke="${accent}" stroke-width="7"/><path d="M204 287l12 9-12 9" fill="none" stroke="${accent}" stroke-width="4"/></g>`;
}

function blenderVisual(style, accent, surface, text) {
  if (style === 'brutalist-monument') return `<g><rect x="61" y="121" width="92" height="230" fill="${text}" opacity=".18"/><rect x="145" y="82" width="75" height="269" fill="${accent}" opacity=".42"/><rect x="211" y="156" width="96" height="195" fill="${text}" opacity=".1"/><path d="M43 351h274" stroke="${accent}" stroke-width="4"/></g>`;
  if (style === 'glass-studio') return `<g><circle cx="116" cy="239" r="69" fill="${accent}" opacity=".18" stroke="${text}"/><circle cx="250" cy="190" r="54" fill="${text}" opacity=".12" stroke="${accent}"/><path d="M180 89l65 112-65 112-65-112z" fill="${accent}" opacity=".28" stroke="${text}"/><ellipse cx="180" cy="342" rx="116" ry="19" fill="${accent}" opacity=".12"/></g>`;
  if (style === 'low-poly-valley') return `<g><circle cx="269" cy="131" r="48" fill="${accent}" opacity=".68"/><path d="M31 345l85-196 65 196z" fill="${text}" opacity=".14"/><path d="M104 345l98-245 127 245z" fill="${accent}" opacity=".3"/><path d="M31 345h298" stroke="${text}" opacity=".5"/></g>`;
  if (style === 'organic-bloom') return `<g transform="translate(180 221)"><ellipse rx="33" ry="105" fill="${accent}" opacity=".42"/><ellipse rx="33" ry="105" fill="${accent}" opacity=".32" transform="rotate(60)"/><ellipse rx="33" ry="105" fill="${accent}" opacity=".32" transform="rotate(120)"/><circle r="39" fill="${text}" opacity=".72"/></g>`;
  if (style === 'kinetic-sculpture') return `<g fill="none" stroke="${accent}"><ellipse cx="180" cy="211" rx="117" ry="58" stroke-width="13" transform="rotate(-18 180 211)"/><ellipse cx="180" cy="211" rx="117" ry="58" stroke-width="7" transform="rotate(48 180 211)" opacity=".55"/><circle cx="180" cy="211" r="31" fill="${text}" opacity=".25"/></g>`;
  if (style === 'neon-tunnel') return `<g fill="none" stroke="${accent}"><path d="M40 93h280v278H40z" opacity=".2"/><path d="M71 122h218v220H71z" opacity=".35" stroke-width="4"/><path d="M105 154h150v156H105z" opacity=".55" stroke-width="7"/><path d="M140 186h80v92h-80z" stroke-width="10"/></g>`;
  if (style === 'paper-diorama') return `<g><circle cx="263" cy="139" r="42" fill="${accent}" opacity=".65"/><path d="M34 345l91-139 57 65 46-92 102 166z" fill="${text}" opacity=".09"/><path d="M34 364l91-88 50 45 60-74 95 117z" fill="${accent}" opacity=".24"/><path d="M34 382l102-55 48 31 75-56 71 80z" fill="${surface}" stroke="${accent}"/></g>`;
  return `<g><ellipse cx="180" cy="325" rx="120" ry="28" fill="${accent}" opacity=".12"/><path d="M180 89l88 151-88 82-88-82z" fill="${accent}" opacity=".28" stroke="${accent}" stroke-width="3"/><path d="M180 89v233M92 240h176" stroke="${text}" opacity=".48"/><circle cx="180" cy="206" r="48" fill="none" stroke="${accent}" stroke-width="12"/></g>`;
}

function threeVisual(style, accent, surface, text) {
  if (style === 'diagram') return `<g stroke="${accent}" stroke-width="3"><path d="M72 222h72m72 0h72M180 154v136"/><circle cx="72" cy="222" r="28" fill="${surface}"/><circle cx="180" cy="154" r="35" fill="${accent}"/><circle cx="288" cy="222" r="28" fill="${surface}"/><rect x="140" y="290" width="80" height="58" fill="${text}" opacity=".16"/></g>`;
  if (style === 'atmospheric') return `<g><circle cx="178" cy="214" r="122" fill="${accent}" opacity=".08"/><circle cx="124" cy="184" r="61" fill="${accent}" opacity=".25"/><circle cx="235" cy="240" r="81" fill="${text}" opacity=".08"/><path d="M60 332c76-102 151-80 240-155" fill="none" stroke="${accent}" stroke-width="5" opacity=".6"/></g>`;
  return `<g><path d="M180 91l93 54v108l-93 54-93-54V145z" fill="${accent}" opacity=".24" stroke="${accent}" stroke-width="4"/><path d="M180 91v108m93-54l-93 54-93-54m93 54v108" fill="none" stroke="${text}" opacity=".48"/><circle cx="180" cy="199" r="34" fill="${accent}"/></g>`;
}

function guidedVisual(style, accent, surface, text) {
  const presenter = style === 'none' ? '' : `<circle cx="276" cy="333" r="${style === 'camera-and-mic' ? 40 : 34}" fill="${accent}"/><circle cx="276" cy="322" r="11" fill="${surface}"/><path d="M257 350c4-18 34-18 38 0" fill="${surface}"/>${style === 'camera-and-mic' ? `<path d="M236 364h80" stroke="${text}" stroke-width="5" stroke-dasharray="8 5"/>` : ''}`;
  return `<g><rect x="49" y="88" width="262" height="290" rx="9" fill="${surface}" stroke="${accent}"/><rect x="65" y="119" width="230" height="42" fill="${text}" opacity=".1"/><rect x="65" y="177" width="101" height="165" fill="${accent}" opacity=".22"/><rect x="179" y="177" width="116" height="78" fill="${text}" opacity=".13"/><path d="M207 235l20 54 13-19 22 12-55-47z" fill="${text}"/>${presenter}</g>`;
}

function coherentVisual(style, accent, surface, text) {
  if (style === 'strict') return `<g><rect x="50" y="102" width="260" height="248" fill="${surface}" stroke="${accent}"/><path d="M50 184h260M50 267h260M137 102v248M224 102v248" stroke="${accent}" opacity=".42"/><circle cx="94" cy="143" r="23" fill="${accent}"/><circle cx="180" cy="225" r="23" fill="${accent}"/><circle cx="267" cy="309" r="23" fill="${accent}"/><path d="M113 160l48 47m38 36l49 48" stroke="${text}" stroke-width="4"/></g>`;
  if (style === 'experimental') return `<g><path d="M43 118l105-31 28 115-104 34zM187 127l129 39-43 111-115-49zM77 256l115-28 35 126-135 19zM221 268l91-21 18 103-116 24z" fill="${accent}" opacity=".2" stroke="${text}"/><circle cx="180" cy="220" r="43" fill="${accent}"/></g>`;
  return `<g><path d="M57 125h246v178H57z" fill="${surface}" stroke="${accent}"/><path d="M57 125l82 178 82-178 82 178" fill="none" stroke="${accent}" opacity=".35"/><circle cx="180" cy="212" r="54" fill="${accent}" opacity=".35"/><path d="M125 341h110" stroke="${text}" stroke-width="10" opacity=".4"/></g>`;
}

function podcastVisual(style, accent, surface, text) {
  if (style === 'captions-first') return `<g><rect x="44" y="95" width="272" height="258" fill="${surface}" stroke="${accent}"/><rect x="67" y="130" width="226" height="42" fill="${text}"/><rect x="89" y="189" width="182" height="32" fill="${accent}"/><rect x="61" y="239" width="238" height="38" fill="${text}" opacity=".28"/><path d="M71 321h218" stroke="${accent}" stroke-width="8" stroke-dasharray="15 7"/></g>`;
  if (style === 'split') return `<g><rect x="44" y="95" width="272" height="258" fill="${surface}" stroke="${accent}"/><circle cx="112" cy="188" r="48" fill="${accent}" opacity=".5"/><circle cx="248" cy="188" r="48" fill="${text}" opacity=".14"/><path d="M180 110v227" stroke="${accent}"/><rect x="68" y="289" width="224" height="34" fill="${text}" opacity=".22"/></g>`;
  return `<g><circle cx="180" cy="184" r="82" fill="${accent}" opacity=".25"/><circle cx="180" cy="170" r="37" fill="${accent}"/><path d="M118 286c8-57 116-57 124 0" fill="${text}" opacity=".14"/><path d="M70 330v-28m24 28v-52m24 52v-22m24 22v-68m24 68v-37m24 37v-83m24 83v-43m24 43v-61m24 61v-28" stroke="${accent}" stroke-width="6"/></g>`;
}

function lyricVisual(style, useBlender, accent, surface, text) {
  if (style === 'kinetic-type') return `<g><text x="180" y="164" text-anchor="middle" fill="${text}" font-family="Arial" font-size="46" font-weight="900">EVERY</text><text x="180" y="222" text-anchor="middle" fill="${accent}" font-family="Arial" font-size="58" font-weight="900">WORD</text><text x="180" y="266" text-anchor="middle" fill="${text}" font-family="Arial" font-size="30" font-weight="800">MOVES.</text><path d="M61 318h238" stroke="${accent}" stroke-width="8" stroke-dasharray="24 10"/>${useBlender ? `<path d="M180 87l112 194-112 76L68 281z" fill="none" stroke="${accent}" opacity=".28"/>` : ''}</g>`;
  return `<g><circle cx="180" cy="194" r="101" fill="${accent}" opacity=".15"/><text x="180" y="190" text-anchor="middle" fill="${text}" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="800">THE WORDS</text><text x="180" y="230" text-anchor="middle" fill="${accent}" font-family="Arial,Helvetica,sans-serif" font-size="22">BECOME THE SCENE</text><path d="M91 277h178" stroke="${accent}" stroke-width="5" stroke-dasharray="19 9"/>${useBlender ? `<path d="M180 86l95 164-95 85-95-85z" fill="none" stroke="${text}" opacity=".3"/>` : ''}</g>`;
}

function imageStoryAssetsFor(index) {
  const offset = (index * 2) % IMAGE_STORY_ASSETS.length;
  return [0, 1, 2].map((step) => IMAGE_STORY_ASSETS[(offset + step) % IMAGE_STORY_ASSETS.length]);
}

async function renderImageSlideshowPreview(style, imagePaths, videoPath, frequency) {
  const inputArgs = imagePaths.flatMap((imagePath) => [
    '-loop', '1', '-framerate', '25', '-t', String(DURATION_SECONDS), '-i', imagePath,
  ]);
  await run(FFMPEG, [
    '-y', '-loglevel', 'error', ...inputArgs,
    '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=${DURATION_SECONDS}`,
    '-filter_complex', imageSlideshowFilter(style),
    '-t', String(DURATION_SECONDS),
    '-map', '[outv]', '-map', `${imagePaths.length}:a`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-profile:v', 'main',
    '-c:a', 'aac', '-b:a', '48k', '-ac', '2', '-ar', '48000', '-shortest',
    '-map_metadata', '-1', '-movflags', '+faststart', videoPath,
  ]);
}

async function renderProofPreview(sourcePath, videoPath, frequency) {
  await run(FFMPEG, [
    '-y', '-loglevel', 'error', '-i', sourcePath,
    '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=${DURATION_SECONDS}`,
    '-filter_complex', `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=25,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1,trim=duration=${DURATION_SECONDS},format=yuv420p[outv]`,
    '-map', '[outv]', '-map', '1:a', '-t', String(DURATION_SECONDS),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-profile:v', 'main',
    '-c:a', 'aac', '-b:a', '48k', '-ac', '2', '-ar', '48000', '-shortest',
    '-map_metadata', '-1', '-movflags', '+faststart', videoPath,
  ]);
}

async function loadRealProofs() {
  const proofs = new Map();
  for (const evidencePath of REAL_PROOF_EVIDENCE) {
    const evidenceBytes = await readFile(evidencePath);
    const evidence = JSON.parse(evidenceBytes.toString('utf8'));
    for (const item of evidence.items ?? []) {
      if (!isRangeProofVariant(item.variantId)) continue;
      if (proofs.has(item.variantId)) throw new Error(`duplicate real proof: ${item.variantId}`);
      const sourcePath = path.join(ROOT, item.source);
      const sourceBytes = await readFile(sourcePath);
      const sourceDigest = sha256(sourceBytes);
      if (sourceDigest !== item.sha256) throw new Error(`${item.variantId}: proof source sha256 mismatch`);
      const isBlender = item.variantId.startsWith('blender-film--');
      proofs.set(item.variantId, {
        ...item,
        evidencePath: path.relative(ROOT, evidencePath),
        engine: isBlender ? `Blender ${evidence.blenderVersion}` : 'Local LTX-2.3 MLX',
        renderer: evidence.renderer,
        sourcePosture: isBlender ? 'local-render' : 'local-model-proof',
        modelRevision: isBlender ? null : evidence.runtime?.modelRevision,
      });
    }
  }
  const expected = variantsForRangeProofs();
  for (const variantId of expected) {
    if (!proofs.has(variantId)) throw new Error(`missing real proof: ${variantId}`);
  }
  return proofs;
}

function variantsForRangeProofs() {
  return [
    'blender-film--visualstyle-cosmic-shrine',
    'blender-film--visualstyle-brutalist-monument',
    'blender-film--visualstyle-glass-studio',
    'blender-film--visualstyle-low-poly-valley',
    'blender-film--visualstyle-organic-bloom',
    'blender-film--visualstyle-kinetic-sculpture',
    'blender-film--visualstyle-neon-tunnel',
    'blender-film--visualstyle-paper-diorama',
    'coherent-local-film--continuity-strict',
    'coherent-local-film--continuity-balanced',
    'coherent-local-film--continuity-experimental',
  ];
}

function isRangeProofVariant(variantId) {
  return variantsForRangeProofs().includes(variantId);
}

function imageSlideshowFilter(style) {
  const cover = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},setsar=1,fps=25`;
  if (style === 'editorial-cutout') {
    return `[0:v]${cover},drawbox=x=0:y=0:w=iw:h=12:color=#ef553d:t=fill[v0];`
      + `[1:v]${cover},drawbox=x=0:y=0:w=12:h=ih:color=#1d4ed8:t=fill[v1];`
      + `[2:v]${cover},drawbox=x=0:y=h-12:w=iw:h=12:color=#f2c94c:t=fill[v2];`
      + `[v0][v1]xfade=transition=slideleft:duration=0.18:offset=0.72[x1];`
      + `[x1][v2]xfade=transition=wipeup:duration=0.18:offset=1.48,trim=duration=${DURATION_SECONDS},format=yuv420p[outv]`;
  }
  if (style === 'filmstrip') {
    return `[0:v]scale=280:498:force_original_aspect_ratio=increase,crop=280:498,pad=304:546:12:12:color=#f4ead8[v0];`
      + `[1:v]scale=280:498:force_original_aspect_ratio=increase,crop=280:498,pad=304:546:12:12:color=#f4ead8[v1];`
      + `[2:v]scale=280:498:force_original_aspect_ratio=increase,crop=280:498,pad=304:546:12:12:color=#f4ead8[v2];`
      + `[v0][v1][v2]vstack=inputs=3[stack];`
      + `[stack]pad=360:1638:28:0:color=#111111,crop=360:640:0:'min((in_h-out_h)*t/${DURATION_SECONDS},in_h-out_h)',fps=25,setsar=1,format=yuv420p[outv]`;
  }
  if (style === 'split-frame') {
    return `[0:v]scale=180:640:force_original_aspect_ratio=increase,crop=180:640,setsar=1,fps=25[left];`
      + `[1:v]scale=180:640:force_original_aspect_ratio=increase,crop=180:640,setsar=1,fps=25[mid];`
      + `[mid]split=2[mid1][mid2];`
      + `[2:v]scale=180:640:force_original_aspect_ratio=increase,crop=180:640,setsar=1,fps=25[right];`
      + `[left][mid1]hstack=inputs=2[first];[mid2][right]hstack=inputs=2[second];`
      + `[first][second]xfade=transition=wipeleft:duration=0.24:offset=1.12,trim=duration=${DURATION_SECONDS},format=yuv420p[outv]`;
  }
  if (style === 'polaroid-stack') {
    return `color=c=#121314:s=${WIDTH}x${HEIGHT}:r=25:d=${DURATION_SECONDS}[base];`
      + `[0:v]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,pad=294:534:12:12:color=white,format=rgba,rotate=-.055:ow=rotw(iw):oh=roth(ih):c=none[p0];`
      + `[1:v]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,pad=294:534:12:12:color=white,format=rgba,rotate=.05:ow=rotw(iw):oh=roth(ih):c=none,fade=t=in:st=0.72:d=0.18:alpha=1[p1];`
      + `[2:v]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,pad=294:534:12:12:color=white,format=rgba,rotate=-.025:ow=rotw(iw):oh=roth(ih):c=none,fade=t=in:st=1.48:d=0.18:alpha=1[p2];`
      + `[base][p0]overlay=x='(W-w)/2-10':y=55:shortest=1[s0];`
      + `[s0][p1]overlay=x='(W-w)/2+10':y=70:shortest=1[s1];`
      + `[s1][p2]overlay=x='(W-w)/2':y=62:shortest=1,format=yuv420p[outv]`;
  }
  if (style === 'soft-parallax') {
    return `[0:v]scale=430:764:force_original_aspect_ratio=increase,crop=360:640:x='(iw-ow)*t/${DURATION_SECONDS}':y='(ih-oh)*(1-t/${DURATION_SECONDS})',setsar=1,fps=25[base];`
      + `[1:v]scale=250:444:force_original_aspect_ratio=increase,crop=250:444,format=rgba,colorchannelmixer=aa=.58[layer1];`
      + `[2:v]scale=180:320:force_original_aspect_ratio=increase,crop=180:320,format=rgba,colorchannelmixer=aa=.7[layer2];`
      + `[base][layer1]overlay=x='24+10*sin(t*2)':y='92-16*t':shortest=1[s1];`
      + `[s1][layer2]overlay=x='150-8*t':y='270+12*t':shortest=1,format=yuv420p[outv]`;
  }
  return `[0:v]scale=400:712:force_original_aspect_ratio=increase,crop=360:640:x='(iw-ow)*t/${DURATION_SECONDS}':y='(ih-oh)/2',setsar=1,fps=25[v0];`
    + `[1:v]scale=400:712:force_original_aspect_ratio=increase,crop=360:640:x='(iw-ow)*(1-t/${DURATION_SECONDS})':y='(ih-oh)/2',setsar=1,fps=25[v1];`
    + `[2:v]scale=400:712:force_original_aspect_ratio=increase,crop=360:640:x='(iw-ow)*t/${DURATION_SECONDS}':y='(ih-oh)/2',setsar=1,fps=25[v2];`
    + `[v0][v1]xfade=transition=fade:duration=0.28:offset=0.72[x1];`
    + `[x1][v2]xfade=transition=fade:duration=0.28:offset=1.48,trim=duration=${DURATION_SECONDS},format=yuv420p[outv]`;
}

async function renderPreview(sourcePath, videoPath, frequency, index) {
  const pan = index % 2 === 0 ? "sin(on/9)*4" : "cos(on/11)*4";
  await run(FFMPEG, [
    '-y', '-loglevel', 'error', '-loop', '1', '-framerate', '25', '-i', sourcePath,
    '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=${DURATION_SECONDS}`,
    '-t', String(DURATION_SECONDS),
    '-vf', `scale=${WIDTH}:${HEIGHT},zoompan=z='min(zoom+0.0015,1.07)':x='iw/2-(iw/zoom/2)+${pan}':y='ih/2-(ih/zoom/2)':d=60:s=${WIDTH}x${HEIGHT}:fps=25,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '31', '-profile:v', 'main',
    '-c:a', 'aac', '-b:a', '48k', '-ac', '2', '-ar', '48000', '-shortest',
    '-map_metadata', '-1', '-movflags', '+faststart', videoPath,
  ]);
}

async function rasterizeSvg(sourcePath, rasterPath) {
  await run(SIPS, ['-s', 'format', 'png', sourcePath, '--out', rasterPath]);
}

async function probeVideo(videoPath) {
  const output = await run(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', videoPath]);
  const parsed = JSON.parse(output);
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
  return {
    width: video?.width ?? null,
    height: video?.height ?? null,
    duration: Number(parsed.format?.duration ?? 0),
    hasAudio: parsed.streams?.some((stream) => stream.codec_type === 'audio') === true,
  };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}: ${stderr.trim()}`)));
  });
}

function promptFor(variant) {
  const details = Object.entries(variant.values)
    .filter(([, value]) => value !== '' && value !== false)
    .map(([key, value]) => `${humanize(key)} ${humanize(value)}`)
    .join(', ');
  return `Create a concise vertical story using ${variant.name}${details ? ` with ${details}` : ''}. Make the central idea visually literal and readable.`;
}

function humanize(value) {
  if (value === true) return 'Blender on';
  return String(value).replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function wrap(value, limit, maxLines) {
  const words = String(value).split(/\s+/);
  const lines = [];
  for (const word of words) {
    const current = lines.at(-1) ?? '';
    if (!current || `${current} ${word}`.length > limit) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  if (lines.length > maxLines) {
    const result = lines.slice(0, maxLines);
    result[maxLines - 1] = `${result[maxLines - 1].slice(0, Math.max(1, limit - 1))}…`;
    return result;
  }
  return lines;
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
