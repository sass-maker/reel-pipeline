#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { AsciiAnimationAdapter } from '../src/adapters/ascii-animation.js';
import { HtmlCompositionAdapter } from '../src/adapters/html-composition.js';
import { listRecipeVariants, PRODUCTION_RECIPE_IDS } from '../src/studio/production-catalog.js';
import { normalizeVideoBrief } from '../src/video-brief.js';

const execFileAsync = promisify(execFile);
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const localFleetRoot = process.env.FLEET_ROOT ?? '/Users/sarthak/Desktop/fleet';
const representativeRoot = path.join(root, 'fixtures/video-gallery/representatives');
const videoDir = path.join(representativeRoot, 'videos');
const posterDir = path.join(representativeRoot, 'posters');
const evidenceDir = path.join(representativeRoot, 'evidence');
const liveCaptureDir = path.join(representativeRoot, 'live-captures');
const configPath = path.join(root, 'config/explore-gallery-representatives.json');
const checkOnly = process.argv.includes('--check');

const imageProofs = [
  {
    key: 'image-storm-push', title: 'Storm observatory · slow push', rangeLabel: 'Image model · push in', motionTags: ['push-in', 'cinematic-photo'],
    asset: 'storm-observatory.png', variantId: 'image-slideshow--visualstyle-cinematic-slideshow', move: 'push-in', proofRole: 'primary',
    description: 'A generated cinematic observatory image becomes an eight-second focal push through weather, rock, and one warm human window.',
  },
  {
    key: 'image-paper-pan', title: 'Paper ocean · lateral pan', rangeLabel: 'Image model · pan', motionTags: ['lateral-pan', 'paper-collage'],
    asset: 'paper-ocean.png', variantId: 'image-slideshow--visualstyle-editorial-cutout', move: 'pan', proofRole: 'range',
    description: 'Generated tactile paper layers move laterally at a controlled crop, exposing the physical depth of the waves and sun.',
  },
  {
    key: 'image-glass-pull', title: 'Glass ecosystem · pull back', rangeLabel: 'Image model · pull out', motionTags: ['pull-out', 'generated-3d'],
    asset: 'glass-ecosystem.png', variantId: 'image-slideshow--visualstyle-soft-parallax', move: 'pull-out', proofRole: 'range',
    description: 'A close generated glass ecosystem opens into a full floating world through a deliberate camera pull-back.',
  },
  {
    key: 'image-train-drift', title: 'Rain train · diagonal drift', rangeLabel: 'Image model · drift', motionTags: ['diagonal-drift', 'painterly-cinema'],
    asset: 'rain-train.png', variantId: 'image-slideshow--visualstyle-filmstrip', move: 'drift', proofRole: 'range',
    description: 'A generated retro-future station holds its period detail while the frame drifts from reflective platform to waiting train.',
  },
].map((item) => ({ ...item, source: path.join(root, 'fixtures/video-gallery/assets/image-model', item.asset) }));

const asciiProofs = [
  {
    key: 'ascii-kinetic', title: 'ASCII signal story', rangeLabel: 'ASCII · staged narrative', motionTags: ['scene-progression', 'glyph-animation'],
    sceneStyle: 'kinetic-type', palette: 'mono', variantId: 'ascii-story--palette-mono', proofRole: 'primary',
    description: 'A legible glyph world progresses from atom to bond to orbit while a travelling signal connects the three states.',
  },
];

const blenderProofs = [
  ['organic-bloom', 'Orbital bloom', 'Blender · procedural growth', ['growth', 'organic']],
  ['kinetic-sculpture', 'Kinetic sculpture', 'Blender · object motion', ['object-motion', 'sculpture']],
].map(([key, title, rangeLabel, motionTags]) => ({
  key: `blender-${key}`, source: path.join(root, 'fixtures/video-gallery/proofs/blender', `${key}.mp4`),
  title, rangeLabel, motionTags, variantId: `blender-film--visualstyle-${key}`,
  proofRole: key === 'kinetic-sculpture' ? 'primary' : 'range',
  qualityTier: ['kinetic-sculpture', 'organic-bloom'].includes(key) ? 'showcase' : 'experiment',
  description: `${title} is a real Blender 5.2 animation proof with its own scene grammar, camera, lighting, and material system.`,
}));

const threeProofs = [
  ['cel', 'toon', 'Cel-shaded rail world', 'Three.js · tracked orbit', ['tracked-orbit', 'toon-world']],
].map(([capture, variant, title, rangeLabel, motionTags], index) => ({
  key: `three-${capture}`, source: path.join(liveCaptureDir, `threejs-scene--${capture}.webm`), title, rangeLabel, motionTags,
  variantId: `threejs-scene--scenestyle-${variant}`, proofRole: index === 0 ? 'primary' : 'range',
  qualityTier: 'experiment',
  description: `${title} is captured from a live WebGL scene; geometry and camera motion run in Three.js rather than a video placeholder.`,
}));

const modelProofs = [
  ['balanced-object-motion', 'balanced', 'Sculpture camera arc', 'LTX · object motion', ['camera-arc', 'object-motion']],
  ['experimental-transformation', 'experimental', 'Collage transformation', 'LTX · transformation', ['parallax', 'transformation']],
].map(([key, continuity, title, rangeLabel, motionTags], index) => ({
  key: `model-${key}`, source: path.join(root, 'fixtures/video-gallery/proofs/video-model', `${key}.mp4`), title, rangeLabel, motionTags,
  variantId: `coherent-local-film--continuity-${continuity}`, proofRole: index === 0 ? 'primary' : 'range',
  description: `${title} is a six-second LTX 2.3 MLX image-to-video render generated locally from an approved keyframe.`,
}));

const sources = {
  voice: path.join(localFleetRoot, 'foundry/marketing/reel-pipeline/.reel-pipeline/first-deliverable/s01/mixed-media/demo-2026-07-26T17-56-56-853Z/local-video-forge-mixed-media.mp4'),
  podcast: path.join(localFleetRoot, 'foundry/marketing/reel-pipeline/.reel-pipeline/podcast-edits/runs/zeropod-conviction-short-2026-07-29T09-48-39-947Z/podcast-edit.mp4'),
  podcastReceipt: path.join(localFleetRoot, 'foundry/marketing/reel-pipeline/.reel-pipeline/podcast-edits/runs/zeropod-conviction-short-2026-07-29T09-48-39-947Z/receipt.json'),
  lyric: path.join(root, 'fixtures/video-gallery/proofs/lyric-clean/lyric_twinkle-literal-canary_1785682469829/twinkle-literally.mp4'),
};

if (checkOnly) {
  await checkRepresentativePack();
  process.exit(0);
}

await mkdir(videoDir, { recursive: true });
await mkdir(posterDir, { recursive: true });
await mkdir(evidenceDir, { recursive: true });
const scratch = await mkdtemp(path.join(tmpdir(), 'fleet-representative-gallery-'));

try {
  for (const proof of imageProofs) await renderImageMotion(proof.source, output(proof.key), proof.move, 8);
  await renderHtmlProof('web-motion', 'kinetic-type', 'A claim is not proof.', 'The claim enters as typography. Evidence interrupts it with a visible result. The hierarchy resolves: show the work.');
  for (const proof of asciiProofs) await renderAsciiProof(proof);
  await transcode(sources.voice, output('local-voice-film'), { duration: 12 });
  for (const proof of blenderProofs) await transcode(proof.source, output(proof.key), { duration: 7.5, speed: 3, audio: false });
  for (const proof of threeProofs) await transcode(proof.source, output(proof.key), { duration: 8, audio: false });
  for (const proof of modelProofs) await transcode(proof.source, output(proof.key), { duration: 6, audio: false });
  await renderPodcast();
  await renderCleanLyric();

  const config = await buildConfig();
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  await writeFile(path.join(representativeRoot, 'manifest.json'), `${JSON.stringify({
    schema: 'fleet.video-representative-proof-manifest.v2',
    generatedAt: new Date().toISOString(),
    renderer: 'scripts/build-representative-gallery.js',
    items: config.items.map(({ id, recipeId, proofRole, rangeLabel, motionTags, source, poster, evidence, sha256, durationSeconds }) => ({
      id, recipeId, proofRole, rangeLabel, motionTags, source, poster, evidence, sha256, durationSeconds,
    })),
    unproven: config.coverage.unproven,
  }, null, 2)}\n`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}

await checkRepresentativePack();

function output(key) {
  return path.join(videoDir, `${key}.mp4`);
}

function posterOutput(key) {
  return path.join(posterDir, `${key}.jpg`);
}

async function renderHtmlProof(recipeId, visualStyle, title, body) {
  const adapter = new HtmlCompositionAdapter({ artifactDir: path.join(scratch, recipeId), now: () => new Date('2026-08-02T00:00:00.000Z') });
  const brief = normalizeVideoBrief({
    id: `representative-${recipeId}`, projectSlug: 'gallery', channel: 'instagram_reels', title, hook: title,
    body: `Script: ${body}\nShot list: opening statement, visible proof, conclusion.\nCaptions: readable, authored, concise.\nAsset prompts: original abstract editorial imagery with no third-party marks.`,
    renderMode: 'html-composition', durationSeconds: 8, renderOptions: { visualStyle },
  });
  const render = await adapter.createVideo(brief);
  await transcode(render.videos[0], output(recipeId), { duration: 8 });
}

async function renderAsciiProof(proof) {
  const adapter = new AsciiAnimationAdapter({
    artifactDir: path.join(scratch, 'ascii'), renderer: 'browser', width: 1080, height: 1920, fps: 24,
    now: () => new Date('2026-08-02T00:00:00.000Z'),
  });
  const brief = normalizeVideoBrief({
    id: `representative-${proof.key}`, projectSlug: 'gallery', channel: 'instagram_reels',
    title: proof.title, hook: proof.rangeLabel,
    body: 'Script: Enter a glyph world, make the spatial motion unmistakable, and land one readable thought.\nShot list: authored opening, motion proof, conclusion.\nCaptions: motion has meaning.\nAsset prompts: repository-owned glyph geometry with no external source assets.',
    renderMode: 'ascii-animation', durationSeconds: 8,
    renderOptions: { palette: proof.palette, sceneStyle: proof.sceneStyle },
  });
  const render = await adapter.createVideo(brief);
  await transcode(render.videos[0], output(proof.key), { duration: 8 });
}

async function renderImageMotion(input, destination, move, durationSeconds) {
  const frames = durationSeconds * 24;
  const expressions = {
    'push-in': `z='min(1+on*0.00185,1.35)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
    'pull-out': `z='max(1.35-on*0.00185,1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
    pan: `z='1.38':x='(iw-iw/zoom)*on/${frames - 1}':y='ih/2-(ih/zoom/2)'`,
    drift: `z='1.42':x='(iw-iw/zoom)*(1-on/${frames - 1})':y='(ih-ih/zoom)*on/${frames - 1}'`,
  };
  await ffmpeg([
    '-loop', '1', '-i', input, '-t', String(durationSeconds),
    '-vf', `scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,zoompan=${expressions[move]}:d=${frames}:s=360x640:fps=24,eq=saturation=1.04:contrast=1.02,format=yuv420p`,
    '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-movflags', '+faststart', destination,
  ]);
}

async function renderCleanLyric() {
  await transcode(sources.lyric, output('literal-lyric-video'), { duration: 12 });
}

async function renderPodcast() {
  const adapter = new HtmlCompositionAdapter({ artifactDir: path.join(scratch, 'podcast-short'), now: () => new Date('2026-08-02T00:00:00.000Z') });
  const brief = normalizeVideoBrief({
    id: 'representative-podcast-short', projectSlug: 'zeropod', channel: 'instagram_reels',
    title: 'Conviction over money', hook: 'What advice matters when you are new?',
    body: 'Script: Ask what matters after the hype. Answer with conviction and stoicism. Land on believing in more than money.\nShot list: source question, speaker answer, memorable conclusion.\nCaptions: conviction and stoicism; believe in more than money.\nAsset prompts: restrained editorial waveform and source-credit typography.',
    renderMode: 'html-composition', durationSeconds: 12, renderOptions: { visualStyle: 'editorial-grid' },
  });
  const render = await adapter.createVideo(brief);
  await ffmpeg(['-i', render.videos[0], '-i', sources.podcast, '-t', '12', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', output('podcast-short')]);
}

async function transcode(input, destination, options = {}) {
  const args = [];
  if (options.loops) args.push('-stream_loop', String(options.loops));
  args.push('-i', input);
  if (options.duration) args.push('-t', String(options.duration));
  const speed = options.speed ? `setpts=${options.speed}*PTS,` : '';
  args.push('-vf', `${speed}scale=360:640:force_original_aspect_ratio=increase,crop=360:640,fps=24,format=yuv420p`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '22');
  if (options.audio === false) args.push('-an');
  else args.push('-c:a', 'aac', '-b:a', '128k');
  args.push('-movflags', '+faststart', destination);
  await ffmpeg(args);
}

async function ffmpeg(args) {
  await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 16 * 1024 * 1024 });
}

function baseDefinition({
  key, recipeId, title, family, description, engine, renderer, intendedRuntime, sourcePosture,
  qualityTier = 'showcase', spend = 'Local compute', variantId, proofRole = 'primary', rangeLabel, motionTags,
}) {
  return { key, recipeId, title, family, description, engine, renderer, intendedRuntime, sourcePosture, qualityTier, spend, variantId, proofRole, rangeLabel, motionTags };
}

function definitions() {
  return [
    ...imageProofs.map((proof) => baseDefinition({ ...proof, recipeId: 'image-slideshow', family: 'Image model', engine: 'OpenAI image generation + FFmpeg', renderer: 'openai-imagegen-ffmpeg@1', intendedRuntime: 'OpenAI image generation + FFmpeg', sourcePosture: 'specialist-proof', spend: 'Image generation + local compute' })),
    baseDefinition({ key: 'web-motion', recipeId: 'web-motion', title: 'Kinetic motion system', family: 'Motion graphics', description: 'Browser-rendered type, graphic hierarchy, and timed scene changes explain one idea instead of vibrating a card.', engine: 'HTML composition', renderer: 'html-composition@1', intendedRuntime: 'HTML / Canvas', sourcePosture: 'local-render', spend: 'No API spend', variantId: 'web-motion--visualstyle-kinetic-type', rangeLabel: 'HTML motion · kinetic hierarchy', motionTags: ['kinetic-type', 'scene-progression'] }),
    ...asciiProofs.map((proof) => baseDefinition({ ...proof, recipeId: 'ascii-story', family: 'ASCII', engine: 'ASCII animation', renderer: 'ascii-raster-ffmpeg@2', intendedRuntime: 'Raster glyph frames + FFmpeg', sourcePosture: 'local-render' })),
    baseDefinition({ key: 'local-voice-film', recipeId: 'local-voice-film', title: 'Narrated mixed-media film', family: 'Narrated', description: 'A real local voice render combines narration, captions, b-roll, and changing layouts over twelve seconds.', engine: 'Local Video Forge', renderer: 'local-video-forge-mixed-media@1', intendedRuntime: 'Kokoro + FFmpeg', sourcePosture: 'local-model-proof', qualityTier: 'experiment', variantId: 'local-voice-film--voice-af-heart', rangeLabel: 'Local voice · mixed media', motionTags: ['narration', 'mixed-media'] }),
    ...blenderProofs.map((proof) => baseDefinition({ ...proof, recipeId: 'blender-film', family: 'Blender', engine: 'Blender', renderer: 'blender-eevee-animation@1', intendedRuntime: 'Blender 5.2', sourcePosture: 'local-render' })),
    ...threeProofs.map((proof) => baseDefinition({ ...proof, recipeId: 'threejs-scene', family: 'Three.js', engine: 'Three.js Visual Lab', renderer: 'three-webgl-visual-lab@2', intendedRuntime: 'Editorial Visual Lab / Three.js', sourcePosture: 'specialist-proof' })),
    ...modelProofs.map((proof) => baseDefinition({ ...proof, recipeId: 'coherent-local-film', family: 'Internal video model', engine: 'LTX local model', renderer: 'ltx-2.3-mlx-q4', intendedRuntime: 'Forge local model', sourcePosture: 'local-model-proof' })),
    baseDefinition({ key: 'podcast-short', recipeId: 'podcast-short', title: 'CC0 podcast short', family: 'Podcast', description: 'A source-faithful CC0 podcast excerpt preserves the original speaker, source credit, and readable burned captions.', engine: 'Editorial', renderer: 'editorial-podcast-render@1', intendedRuntime: 'Editorial', sourcePosture: 'specialist-proof', qualityTier: 'experiment', spend: 'No API spend', variantId: 'podcast-short--layout-speaker-first', rangeLabel: 'Podcast · speaker first', motionTags: ['captions', 'source-edit'] }),
    baseDefinition({ key: 'literal-lyric-video', recipeId: 'literal-lyric-video', title: 'Literal lyric scene', family: 'Lyric video', description: 'An original twelve-second public-domain lyric canary times readable words against literal star scenes and audio.', engine: 'Lyric compositor', renderer: 'lyric-canvas@1', intendedRuntime: 'Lyric compositor + optional Blender', sourcePosture: 'local-render', variantId: 'literal-lyric-video--visualstyle-literal-cinematic--useblender-false', rangeLabel: 'Lyrics · literal scene', motionTags: ['timed-lyrics', 'literal-imagery'] }),
  ];
}

async function buildConfig() {
  const items = [];
  for (const definition of definitions()) {
    const file = output(definition.key);
    const posterFile = posterOutput(definition.key);
    await ffmpeg(['-ss', '1', '-i', file, '-frames:v', '1', '-vf', 'scale=360:640:force_original_aspect_ratio=increase,crop=360:640', '-q:v', '3', posterFile]);
    const durationSeconds = await probeDuration(file);
    const source = path.relative(root, file);
    const poster = path.relative(root, posterFile);
    const evidence = path.relative(root, path.join(evidenceDir, `${definition.key}.json`));
    const sha256 = await sha(file);
    const evidencePayload = {
      schema: 'fleet.video-representative-proof-evidence.v2',
      recipeId: definition.recipeId,
      proofRole: definition.proofRole,
      rangeLabel: definition.rangeLabel,
      motionTags: definition.motionTags,
      renderer: definition.renderer,
      sourcePosture: definition.sourcePosture,
      durationSeconds,
      sha256,
      source: sourceEvidence(definition),
    };
    await writeFile(path.join(root, evidence), `${JSON.stringify(evidencePayload, null, 2)}\n`);
    items.push({
      id: `representative-${definition.key}`,
      recipeId: definition.recipeId,
      proofRole: definition.proofRole,
      rangeLabel: definition.rangeLabel,
      motionTags: definition.motionTags,
      title: definition.title,
      family: definition.family,
      description: definition.description,
      engine: definition.engine,
      renderer: definition.renderer,
      intendedRuntime: definition.intendedRuntime,
      sourcePosture: definition.sourcePosture,
      executionMode: 'real',
      qualityTier: definition.qualityTier,
      spend: definition.spend,
      variantId: definition.variantId,
      prompt: `Create ${definition.title.toLowerCase()} using ${definition.motionTags.join(' and ')} with visible progression and a readable conclusion.`,
      durationSeconds,
      source,
      poster,
      evidence,
      sha256,
    });
  }
  const provenCapabilityCount = new Set(items.map((item) => item.recipeId)).size;
  const exactOptionCount = listRecipeVariants().length;
  const totalCapabilityCount = PRODUCTION_RECIPE_IDS.length;
  return {
    schema: 'fleet.video-explore-gallery-representatives.v1', version: 1,
    coverage: {
      exactOptionCount, totalCapabilityCount, provenCapabilityCount, proofCount: items.length,
      unproven: [
        { recipeId: 'grok-asset-film', reason: 'Intentionally excluded: no valid operator-approved Grok MP4 with provenance is available.' },
        { recipeId: 'guided-app-demo', reason: 'Quality-gated: the available recording showed an unavailable local state instead of a successful product flow.' },
        { recipeId: 'product-proof', reason: 'Quality-gated: the available slideshow did not demonstrate a complete, legible product interaction.' },
        { recipeId: 'night-out-carousel', reason: 'Exact option fixture exists; no substantive owner-approved representative proof is available yet.' },
      ],
    },
    items,
  };
}

function sourceEvidence(definition) {
  if (definition.recipeId === 'image-slideshow') {
    const proof = imageProofs.find((entry) => entry.key === definition.key);
    return { kind: 'generated-image-motion', generator: 'OpenAI built-in image generation', asset: path.relative(root, proof.source), cameraMove: proof.move };
  }
  if (definition.recipeId === 'podcast-short') return { kind: 'licensed-source', receipt: path.relative(root, sources.podcastReceipt), license: 'CC0 / zero rights reserved' };
  if (definition.recipeId === 'literal-lyric-video') return {
    kind: 'original-canary',
    composition: 'public-domain',
    master: 'Fleet generated',
    quality: 'fixtures/video-gallery/proofs/lyric-clean/lyric_twinkle-literal-canary_1785682469829/quality.json',
  };
  if (definition.recipeId === 'threejs-scene') return { kind: 'live-browser-capture', capturedBy: 'scripts/capture-live-gallery-proofs.js' };
  if (definition.recipeId === 'blender-film') return { kind: 'local-render-range', evidence: 'fixtures/video-gallery/proofs/blender/evidence.json', proof: definition.key };
  if (definition.recipeId === 'coherent-local-film') return { kind: 'local-model-range', evidence: 'fixtures/video-gallery/proofs/video-model/evidence.json', proof: definition.key };
  return { kind: 'fleet-owned-local-proof' };
}

async function checkRepresentativePack() {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const expectedOptionCount = listRecipeVariants().length;
  const expectedCapabilityCount = PRODUCTION_RECIPE_IDS.length;
  if (config.coverage.exactOptionCount !== expectedOptionCount || config.coverage.totalCapabilityCount !== expectedCapabilityCount) throw new Error('representative coverage summary drifted');
  const uniqueRecipes = new Set(config.items.map((item) => item.recipeId));
  if (uniqueRecipes.size !== config.coverage.provenCapabilityCount) throw new Error('proven capability count drifted');
  if (config.items.length !== config.coverage.proofCount) throw new Error('proof count drifted');
  const coveredRecipes = new Set([...uniqueRecipes, ...config.coverage.unproven.map((item) => item.recipeId)]);
  if (coveredRecipes.size !== expectedCapabilityCount || PRODUCTION_RECIPE_IDS.some((recipeId) => !coveredRecipes.has(recipeId))) {
    throw new Error('representative capability coverage drifted');
  }
  for (const recipeId of uniqueRecipes) {
    const primary = config.items.filter((item) => item.recipeId === recipeId && item.proofRole === 'primary');
    if (primary.length !== 1) throw new Error(`${recipeId}: exactly one primary proof is required`);
  }
  for (const item of config.items) {
    if (!['primary', 'range'].includes(item.proofRole)) throw new Error(`${item.id}: proofRole must be primary or range`);
    if (!item.rangeLabel || !Array.isArray(item.motionTags) || item.motionTags.length === 0) throw new Error(`${item.id}: range label and motion tags are required`);
    if (item.sourcePosture === 'fixture' || item.executionMode !== 'real' || item.renderer === 'ffmpeg-svg-fixture@1') throw new Error(`${item.recipeId}: placeholder proof cannot be representative`);
    if (!(item.durationSeconds >= 6 && item.durationSeconds <= 15)) throw new Error(`${item.recipeId}: duration must be 6–15 seconds`);
    const mediaPath = path.join(root, item.source);
    const posterPath = path.join(root, item.poster);
    const info = await stat(mediaPath);
    if (!info.isFile() || info.size < 1) throw new Error(`${item.recipeId}: representative media is missing`);
    if (await sha(mediaPath) !== item.sha256) throw new Error(`${item.recipeId}: hash mismatch`);
    const posterInfo = await stat(posterPath);
    if (!posterInfo.isFile() || posterInfo.size < 1) throw new Error(`${item.recipeId}: representative poster is missing`);
    const [width, height] = await probeDimensions(mediaPath);
    if (height <= width) throw new Error(`${item.recipeId}: representative media must be vertical`);
    const evidence = JSON.parse(await readFile(path.join(root, item.evidence), 'utf8'));
    if (evidence.sha256 !== item.sha256 || evidence.renderer !== item.renderer) throw new Error(`${item.recipeId}: evidence drifted`);
  }
  process.stdout.write(`Representative gallery: ${uniqueRecipes.size}/${config.coverage.totalCapabilityCount} proven capabilities, ${config.items.length} substantive proofs, ${config.coverage.exactOptionCount} exact maker options.\n`);
}

async function probeDuration(file) {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return Number(Number(stdout.trim()).toFixed(3));
}

async function probeDimensions(file) {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]);
  return stdout.trim().split(',').map(Number);
}

async function sha(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}
