import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, open, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { recordScreencast } from '../../scripts/cdp-capture.js';
import { resolveModelProfile, resolveThemePack } from '../studio/model-options.js';
import { normalizeSoundtrack, soundtrackReadiness } from '../studio/soundtrack.js';
import { compileCastPrompt } from '../studio/character-directory.js';
import { StableDiffusionCppAdapter } from './stable-diffusion-cpp.js';

export const NIGHT_OUT_MANIFEST_SCHEMA = 'fleet.night-out-assets.v1';
const DEFAULT_ARTIFACT_DIR = './artifacts/night-out-carousel';
const DEFAULT_ASSET_ROOTS = ['./.reel-pipeline', './artifacts'];
const SOURCE_POSTURES = new Set(['original', 'operator-owned', 'named-ip']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const SAMPLE_RATE = 48_000;
const execFileAsync = promisify(execFile);

export class NightOutCarouselAdapter {
  constructor(options = {}) {
    this.artifactDir = path.resolve(options.artifactDir ?? DEFAULT_ARTIFACT_DIR);
    this.assetRoots = (options.assetRoots ?? DEFAULT_ASSET_ROOTS).map((root) => path.resolve(root));
    this.commandRunner = options.commandRunner ?? defaultCommandRunner;
    this.screencastRunner = options.screencastRunner ?? recordScreencast;
    this.ffmpegPath = options.ffmpegPath ?? 'ffmpeg';
    this.now = options.now ?? (() => new Date());
    this.imageGenerator = options.imageGenerator ?? new StableDiffusionCppAdapter(options.stableDiffusionCpp);
    this.musicGenerator = options.musicGenerator ?? null;
    this.generatedMusicRuntime = options.generatedMusicRuntime ?? null;
    this.modelRootDir = options.modelRootDir;
  }

  async createVideo(brief) {
    const taskId = `night_out_${stableSlug(brief.id)}_${this.now().getTime()}`;
    const dir = path.join(this.artifactDir, taskId);
    const htmlPath = path.join(dir, 'composition.html');
    const silentPath = path.join(dir, 'silent.mp4');
    const videoPath = path.join(dir, `${stableSlug(brief.projectSlug)}-${stableSlug(brief.id)}.mp4`);
    const receiptPath = path.join(dir, 'render-receipt.json');
    const durationSeconds = clamp(Number(brief.durationSeconds ?? 12.5), 8, 30);
    await mkdir(dir, { recursive: true });
    const prepared = await this.prepareManifest(brief, dir);
    const { manifest, rightsEvidence, modelSelection, generation } = prepared;
    await writeFile(htmlPath, buildNightOutHtml({ brief, manifest, durationSeconds }));

    const capture = await this.screencastRunner(
      pathToFileURL(htmlPath).href,
      [{ action: 'click', selector: '[data-start]', waitMs: Math.round(durationSeconds * 1000) }],
      silentPath,
      { width: 1080, height: 1920, fps: 24 },
    );
    if (!capture?.frameDir || !Number.isInteger(capture.frameCount) || capture.frameCount < 2) {
      throw new Error('Night Out screencast captured insufficient frames');
    }
    const inputFps = capture.frameCount / durationSeconds;
    try {
      await this.commandRunner(this.ffmpegPath, [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-framerate', inputFps.toFixed(6),
        '-i', path.join(capture.frameDir, 'frame-%05d.png'),
        '-t', String(durationSeconds),
        '-vf', 'scale=1080:1920:flags=lanczos',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', silentPath,
      ]);
    } finally {
      await rm(capture.frameDir, { recursive: true, force: true }).catch(() => {});
    }
    const soundtrack = normalizeSoundtrack(brief.soundtrack);
    const audio = await this.prepareSoundtrack(soundtrack, dir, durationSeconds);
    if (audio.embed) {
      await this.commandRunner(this.ffmpegPath, buildSoundtrackMixArgs({
        silentPath, audioPath: audio.path, videoPath, durationSeconds, mix: soundtrack.mix,
      }));
    } else {
      await copyFile(silentPath, videoPath);
    }
    const info = await stat(videoPath).catch(() => null);
    if (!info?.isFile() || info.size < 8) throw new Error('Night Out renderer produced no playable MP4');

    const receipt = {
      schema: 'fleet.night-out-render.v1',
      renderer: 'night-out-carousel@1',
      renderedAt: this.now().toISOString(),
      briefId: brief.id,
      durationSeconds,
      dimensions: { width: 1080, height: 1920 },
      frameCount: capture.frameCount,
      inputFps,
      theme: manifest.theme,
      sourcePosture: manifest.sourcePosture,
      rightsEvidence,
      contentScope: prepared.contentScope,
      modelProfile: modelSelection,
      generation,
      images: await Promise.all(manifest.images.map(async (image) => ({
        label: image.label,
        path: image.path,
        sha256: createHash('sha256').update(await readFile(image.path)).digest('hex'),
      }))),
      audio: {
        lane: soundtrack.lane,
        kind: audio.kind,
        path: audio.path,
        sha256: audio.sha256,
        evidence: audio.evidence,
        mix: soundtrack.mix,
        silentUploadMaster: !audio.embed,
        finalQuality: soundtrack.lane !== 'procedural-draft',
      },
      output: { path: videoPath, bytes: info.size },
      publication: 'review-required',
    };
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

    return {
      provider: 'night-out-carousel',
      externalTaskId: taskId,
      status: 'completed',
      videos: [videoPath],
      durationSeconds,
      proofType: 'approved_asset_carousel',
      captionText: brief.hook,
      renderLog: [
        'renderer=night-out-carousel@1',
        `theme=${manifest.theme.id}`,
        `modelProfile=${modelSelection.profileId}`,
        `images=${manifest.images.length}`,
        `audio=${soundtrack.lane}`,
        'publication=review-required',
      ],
      raw: {
        videoPath,
        previewHtmlPath: htmlPath,
        manifestPath: receiptPath,
        audioPath: audio.path,
        aspect: '9:16',
        width: 1080,
        height: 1920,
        fps: inputFps,
      },
    };
  }

  async prepareSoundtrack(soundtrack, dir, durationSeconds) {
    const readiness = soundtrackReadiness(soundtrack, { generatedRuntime: this.generatedMusicRuntime });
    if (!readiness.ready) throw new Error(readiness.blocker);
    if (soundtrack.lane === 'platform-sound') {
      return {
        embed: false,
        kind: 'official-platform-reference',
        path: null,
        sha256: null,
        evidence: structuredClone(soundtrack.platformSound),
      };
    }
    if (soundtrack.lane === 'procedural-draft') {
      const audioPath = path.join(dir, 'procedural-draft-funk.wav');
      await writeOriginalFunk(audioPath, durationSeconds, SAMPLE_RATE);
      return {
        embed: true,
        kind: 'procedural-draft-funk',
        path: audioPath,
        sha256: createHash('sha256').update(await readFile(audioPath)).digest('hex'),
        evidence: { bpm: soundtrack.proceduralDraft.bpm, finalQuality: false },
      };
    }
    if (soundtrack.lane === 'owned-local') {
      const owned = soundtrack.ownedLocal;
      if (!['owned', 'licensed'].includes(owned.rightsPosture) || !owned.rightsEvidence) {
        throw new Error('Owned local music requires owned or licensed posture and rights evidence.');
      }
      const resolved = await realpath(path.resolve(owned.path)).catch(() => null);
      if (!resolved) throw new Error(`Owned soundtrack is missing: ${owned.path}`);
      const resolvedRoots = await Promise.all(this.assetRoots.map((root) => realpath(root).catch(() => root)));
      assertInsideRoots(resolved, resolvedRoots, 'owned soundtrack');
      const info = await stat(resolved);
      if (!info.isFile()) throw new Error(`Owned soundtrack is missing: ${owned.path}`);
      return {
        embed: true,
        kind: 'owned-local',
        path: resolved,
        sha256: createHash('sha256').update(await readFile(resolved)).digest('hex'),
        evidence: {
          rightsPosture: owned.rightsPosture,
          rightsEvidence: owned.rightsEvidence,
          attribution: owned.attribution,
        },
      };
    }
    if (typeof this.musicGenerator?.generate !== 'function') {
      throw new Error('Generated music runtime is marked ready but no registered music executor is available.');
    }
    const result = await this.musicGenerator.generate({
      ...soundtrack.generated,
      outputDir: path.join(dir, 'generated-music'),
    });
    const variations = Array.isArray(result?.variations) ? result.variations : [];
    const selectedId = soundtrack.generated.selectedVariationId ?? result?.selectedVariationId ?? variations[0]?.id;
    const selected = variations.find((entry) => entry.id === selectedId);
    if (!selected?.audioPath) throw new Error('Generated music executor returned no selected playable variation.');
    const resolved = await realpath(path.resolve(selected.audioPath)).catch(() => null);
    if (!resolved) throw new Error(`Generated soundtrack is missing: ${selected.audioPath}`);
    assertInsideRoots(resolved, [path.resolve(dir)], 'generated soundtrack');
    return {
      embed: true,
      kind: 'generated',
      path: resolved,
      sha256: createHash('sha256').update(await readFile(resolved)).digest('hex'),
      evidence: {
        runtimeId: soundtrack.generated.runtimeId,
        selectedVariationId: selectedId,
        prompt: soundtrack.generated.prompt,
        durationSeconds: soundtrack.generated.durationSeconds,
        controls: soundtrack.generated.controls,
        seed: selected.seed ?? null,
        runtime: result.runtime ?? null,
      },
    };
  }

  async prepareManifest(brief, dir) {
    const renderOptions = brief.renderOptions ?? {};
    if (renderOptions.assetManifestPath) {
      const rightsEvidence = requiredString(renderOptions.rightsEvidence, 'Night Out rights evidence');
      const manifest = await loadNightOutManifest(renderOptions.assetManifestPath, {
        assetRoots: this.assetRoots,
        rightsEvidence,
      });
      return {
        manifest,
        rightsEvidence,
        contentScope: renderOptions.contentScope ?? 'general',
        modelSelection: {
          requestedProfileId: 'approved-assets',
          profileId: 'approved-assets',
          selectionMode: 'provided-assets',
          reason: 'Operator supplied an approved image manifest.',
          modelRevision: null,
          modelSha256: null,
          runtimeRevision: null,
        },
        generation: null,
      };
    }
    const requestedProfileId = renderOptions.modelProfileId ?? 'auto';
    const theme = resolveThemePack(renderOptions.themePackId ?? 'auto', brief.summary ?? brief.title ?? '');
    const { profile, selectionMode, reason } = resolveModelProfile(requestedProfileId, {
      generationMode: 'image-to-reel',
      rootDir: this.modelRootDir,
    });
    if (!profile.readiness.ready) throw new Error(profile.readiness.blocker);
    if (profile.id !== 'wai-illustrious-v17-sdcpp') {
      throw new Error(`${profile.name} is not an image-to-reel generator.`);
    }
    const contentScope = renderOptions.contentScope ?? theme.contentScope;
    const cast = Array.isArray(brief.cast) && brief.cast.length ? await compileCastPrompt(brief.cast) : [];
    const peopleDirection = contentScope === 'mature-enabled'
      ? 'four fictional consenting adult characters age 25 or older, no real-person likeness'
      : 'four fictional adult characters age 25 or older, fully clothed, no real-person likeness';
    const prompt = [
      brief.summary,
      brief.creativeDirection,
      brief.title,
      theme.promptFragment,
      peopleDirection,
      ...cast.map((entry) => entry.identity),
      'laughing together at a neon nightlife party, candid energy, dynamic composition, anime illustration, masterpiece, best quality, amazing quality',
    ].filter(Boolean).join(', ');
    const scopeNegative = contentScope === 'mature-enabled' ? '' : 'nude, explicit';
    const negativePrompt = [
      'bad quality, worst quality, worst detail, sketch, censor, child, minor, teen, young-looking, uncertain age, non-consensual, real-person likeness, bad anatomy, bad hands, extra fingers, text, watermark, logo',
      scopeNegative,
      ...cast.flatMap((entry) => entry.negativeConstraints ?? []),
      theme.negativePrompt,
    ].filter(Boolean).join(', ');
    const generated = await this.imageGenerator.generateCards({
      outputDir: path.join(dir, 'generated-images'),
      count: 4,
      prompt,
      negativePrompt,
      seed: Number(renderOptions.seed ?? 424_242),
    });
    const manifest = {
      schema: NIGHT_OUT_MANIFEST_SCHEMA,
      theme: { id: theme.id, label: theme.name },
      sourcePosture: theme.sourcePosture,
      images: generated.images.map((imagePath, index) => ({
        id: `beat-${index + 1}`,
        label: ['THE ARRIVAL', 'THE DANCE FLOOR', 'THE KARAOKE DETOUR', 'THE AFTERPARTY'][index],
        path: imagePath,
      })),
    };
    const rightsEvidence = theme.sourcePosture === 'named-ip'
      ? requiredString(renderOptions.rightsEvidence ?? 'Private concept only; no commercial rights evidence supplied.', 'Night Out rights evidence')
      : 'Original images generated locally from the saved prompt and theme pack.';
    return {
      manifest,
      rightsEvidence,
      contentScope,
      modelSelection: {
        requestedProfileId,
        profileId: profile.id,
        selectionMode,
        reason,
        modelRevision: profile.model?.revision ?? profile.version,
        modelSha256: profile.model?.sha256 ?? null,
        runtimeRevision: profile.runtime?.revision ?? null,
      },
      generation: { ...generated.sampling, prompt, negativePrompt },
      cast: cast.map((entry) => ({
        castInstanceId: entry.castInstanceId,
        characterId: entry.characterId,
        characterRevision: entry.characterRevision,
        references: entry.references,
      })),
    };
  }
}

export async function loadNightOutManifest(inputPath, options = {}) {
  const manifestPath = path.resolve(requiredString(inputPath, 'Night Out asset manifest path'));
  const roots = (options.assetRoots ?? DEFAULT_ASSET_ROOTS).map((root) => path.resolve(root));
  assertInsideRoots(manifestPath, roots, 'asset manifest');
  const [resolvedManifestPath, resolvedRoots] = await Promise.all([
    realpath(manifestPath),
    Promise.all(roots.map((root) => realpath(root).catch(() => root))),
  ]);
  assertInsideRoots(resolvedManifestPath, resolvedRoots, 'asset manifest');
  const raw = JSON.parse(await readFile(resolvedManifestPath, 'utf8'));
  const manifest = normalizeNightOutManifest(raw, { manifestPath: resolvedManifestPath, assetRoots: resolvedRoots });
  requiredString(options.rightsEvidence ?? raw.rightsEvidence, 'Night Out rights evidence');
  for (const image of manifest.images) {
    const resolvedImagePath = await realpath(image.path).catch(() => null);
    if (!resolvedImagePath) throw new Error(`Night Out image is missing: ${image.path}`);
    assertInsideRoots(resolvedImagePath, resolvedRoots, 'Night Out image');
    image.path = resolvedImagePath;
    const info = await stat(resolvedImagePath).catch(() => null);
    if (!info?.isFile()) throw new Error(`Night Out image is missing: ${image.path}`);
  }
  return manifest;
}

export function normalizeNightOutManifest(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Night Out manifest must be an object');
  if (input.schema !== NIGHT_OUT_MANIFEST_SCHEMA) throw new Error(`Night Out manifest must use ${NIGHT_OUT_MANIFEST_SCHEMA}`);
  const manifestPath = path.resolve(requiredString(options.manifestPath, 'manifestPath'));
  const roots = (options.assetRoots ?? DEFAULT_ASSET_ROOTS).map((root) => path.resolve(root));
  const theme = {
    id: stableSlug(requiredString(input.theme?.id, 'theme.id')),
    label: requiredString(input.theme?.label, 'theme.label'),
  };
  const sourcePosture = requiredString(input.sourcePosture, 'sourcePosture');
  if (!SOURCE_POSTURES.has(sourcePosture)) throw new Error('sourcePosture must be original, operator-owned, or named-ip');
  if (!Array.isArray(input.images) || input.images.length < 4 || input.images.length > 8) {
    throw new Error('Night Out manifest must contain between 4 and 8 images');
  }
  const ids = new Set();
  const images = input.images.map((entry, index) => {
    const id = stableSlug(entry?.id ?? `card-${index + 1}`);
    if (ids.has(id)) throw new Error(`duplicate Night Out image id: ${id}`);
    ids.add(id);
    const source = requiredString(entry?.path, `images[${index}].path`);
    const resolved = path.resolve(path.dirname(manifestPath), source);
    assertInsideRoots(resolved, roots, `images[${index}].path`);
    if (!IMAGE_EXTENSIONS.has(path.extname(resolved).toLowerCase())) throw new Error(`unsupported Night Out image type: ${source}`);
    return { id, label: requiredString(entry?.label, `images[${index}].label`), path: resolved };
  });
  return { schema: NIGHT_OUT_MANIFEST_SCHEMA, theme, sourcePosture, images };
}

export function buildNightOutHtml({ brief, manifest, durationSeconds = 12.5 }) {
  const hook = escapeHtml(brief.hook || "You're not gonna believe this.");
  const endPrompt = escapeHtml(brief.cta || 'Which universe are we doing next?');
  const hookSeconds = Math.min(2.1, durationSeconds * .2);
  const endSeconds = Math.min(2.25, durationSeconds * .2);
  const carouselSeconds = durationSeconds - hookSeconds - endSeconds;
  const cardSeconds = Math.max(1.3, carouselSeconds / manifest.images.length);
  const cards = manifest.images.map((image, index) => {
    const delay = hookSeconds + index * cardSeconds;
    return `<article class="card" style="--delay:${delay.toFixed(3)}s;--card-duration:${(cardSeconds + .45).toFixed(3)}s"><img src="${pathToFileURL(image.path).href}" alt=""><div><strong>${escapeHtml(image.label)}</strong><span>${String(index + 1).padStart(2, '0')} / ${String(manifest.images.length).padStart(2, '0')}</span></div></article>`;
  }).join('');
  const endDelay = durationSeconds - endSeconds;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#07060b;color:#fff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.stage{position:relative;width:1080px;height:1920px;overflow:hidden;background:radial-gradient(circle at 50% 40%,#3d1d7a 0,transparent 34%),#08070d}.kicker{position:absolute;top:54px;left:58px;z-index:30;font:800 22px/1 monospace;letter-spacing:.14em;opacity:.74}.hook{position:absolute;inset:0;z-index:20;background:#09070d}.hook img{width:100%;height:100%;object-fit:cover;filter:saturate(.9) contrast(1.08) brightness(.68)}.hook:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,rgba(0,0,0,.82))}.copy{position:absolute;left:60px;right:60px;bottom:120px;z-index:2;font-size:116px;font-weight:950;line-height:.84;letter-spacing:-.07em;text-transform:uppercase}.copy span{display:block;width:max-content;max-width:100%;padding:12px 20px 18px;color:#08070c;background:#fff;transform:translateX(-120%)}.copy span:nth-child(2){color:#fff;background:#6d39ff}.copy span:nth-child(3){background:#ffe14c}.playing .copy span:nth-child(1){animation:line .36s .08s cubic-bezier(.1,.9,.2,1.25) both}.playing .copy span:nth-child(2){animation:line .36s .43s cubic-bezier(.1,.9,.2,1.25) both}.playing .copy span:nth-child(3){animation:line .36s .78s cubic-bezier(.1,.9,.2,1.25) both}.playing .hook{animation:hookout ${hookSeconds}s linear both}.carousel{position:absolute;inset:128px 0 148px;perspective:1200px}.card{position:absolute;left:75px;top:55px;width:930px;height:1480px;padding:22px 22px 30px;border:3px solid #fff;border-radius:28px;background:#fff;box-shadow:0 40px 100px rgba(0,0,0,.58);opacity:0;transform:translate3d(1180px,90px,-300px) rotate(9deg) scale(.7)}.card img{width:100%;height:1302px;object-fit:cover;border-radius:13px}.card div{height:120px;display:flex;align-items:center;justify-content:space-between;padding:20px 8px 0;color:#09070d}.card strong{max-width:690px;font-size:55px;line-height:.88;letter-spacing:-.055em;text-transform:uppercase}.card span{font:900 25px/1 monospace;color:#6d39ff}.playing .card{animation:card var(--card-duration) var(--delay) cubic-bezier(.15,.78,.15,1) both}.end{position:absolute;inset:0;z-index:25;display:grid;align-content:center;justify-items:center;gap:28px;padding:80px;text-align:center;background:radial-gradient(circle at 50% 42%,rgba(109,57,255,.55),transparent 32%),#09070d;opacity:0}.end b{color:#ffe14c;font:900 23px/1 monospace;letter-spacing:.14em}.end h1{margin:0;max-width:900px;font-size:116px;line-height:.84;letter-spacing:-.065em;text-transform:uppercase}.end p{margin:0;color:rgba(255,255,255,.7);font-size:34px}.playing .end{animation:endin ${endSeconds}s ${endDelay}s cubic-bezier(.2,.8,.2,1) both}.start{position:absolute;inset:0;z-index:100;border:0;background:#09070d;color:#fff}.playing .start{display:none}@keyframes line{from{transform:translateX(-120%) rotate(-2deg)}70%{transform:translateX(3%) rotate(1deg)}to{transform:translateX(0)}}@keyframes hookout{0%,78%{opacity:1}100%{opacity:0;visibility:hidden}}@keyframes card{0%{opacity:0;transform:translate3d(1180px,90px,-300px) rotate(9deg) scale(.7)}14%{opacity:1}34%{opacity:1;transform:translate3d(-40px,-20px,0) rotate(-3deg) scale(1.045)}46%{transform:translate3d(5px,0,0) rotate(1.1deg) scale(.985)}55%,74%{opacity:1;transform:translate3d(0,0,0) rotate(-.6deg) scale(1)}100%{opacity:0;transform:translate3d(-1180px,-80px,-260px) rotate(-10deg) scale(.74)}}@keyframes endin{from{opacity:0;transform:scale(1.12)}to{opacity:1;transform:scale(1)}}
</style></head><body><main class="stage"><div class="kicker">NIGHT OUT // ${escapeHtml(manifest.theme.label.toUpperCase())}</div><section class="hook"><img src="${pathToFileURL(manifest.images[0].path).href}" alt=""><div class="copy" aria-label="${hook}"><span>You're not</span><span>gonna believe</span><span>this.</span></div></section><section class="carousel">${cards}</section><section class="end"><b>YOUR NIGHT. YOUR UNIVERSE.</b><h1>${endPrompt}</h1><p>Same edit. A different world every time.</p></section><button class="start" data-start>Start</button></main><script>document.querySelector('[data-start]').addEventListener('click',()=>document.body.classList.add('playing'),{once:true})</script></body></html>`;
}

export async function writeOriginalFunk(outPath, seconds, rate = SAMPLE_RATE) {
  const frameCount = Math.floor(seconds * rate);
  const dataSize = frameCount * 4;
  const file = await open(outPath, 'w');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + dataSize, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(dataSize, 40);
  await file.write(header);
  let noise = 0x6d2b79f5;
  const beatSeconds = 60 / 118;
  const bassNotes = [55, 55, 65.41, 55, 73.42, 65.41, 82.41, 73.42];
  for (let start = 0; start < frameCount; start += 8192) {
    const count = Math.min(8192, frameCount - start);
    const chunk = Buffer.alloc(count * 4);
    for (let i = 0; i < count; i += 1) {
      const t = (start + i) / rate;
      const beat = t / beatSeconds;
      const beatPhase = beat % 1;
      const eighth = Math.floor(beat * 2);
      const eighthPhase = (beat * 2) % 1;
      const barBeat = Math.floor(beat) % 4;
      const kick = Math.sin(2 * Math.PI * (48 + 72 * Math.exp(-18 * beatPhase)) * t) * Math.exp(-20 * beatPhase) * .52;
      noise ^= noise << 13; noise ^= noise >>> 17; noise ^= noise << 5;
      const white = ((noise >>> 0) / 0xffffffff) * 2 - 1;
      const snare = (barBeat === 1 || barBeat === 3) && beatPhase < .26 ? white * Math.exp(-15 * beatPhase) * .24 : 0;
      const hat = eighthPhase < .16 ? white * Math.exp(-34 * eighthPhase) * (eighth % 2 ? .11 : .075) : 0;
      const note = bassNotes[eighth % bassNotes.length];
      const bassEnv = Math.min(1, eighthPhase * 16) * Math.exp(-2.8 * eighthPhase);
      const bass = (Math.sin(2 * Math.PI * note * t) + .28 * Math.sin(4 * Math.PI * note * t)) * bassEnv * .25;
      const stabPhase = (beat + .5) % 1;
      const chord = stabPhase < .22 ? (Math.sin(2 * Math.PI * 220 * t) + .55 * Math.sin(2 * Math.PI * 277.18 * t) + .45 * Math.sin(2 * Math.PI * 329.63 * t)) * Math.exp(-16 * stabPhase) * .075 : 0;
      const master = clamp(kick + snare + hat + bass + chord, -.96, .96);
      chunk.writeInt16LE(Math.round(master * 32767), i * 4);
      chunk.writeInt16LE(Math.round(clamp(master * .94 + hat * (eighth % 2 ? .2 : -.2), -1, 1) * 32767), i * 4 + 2);
    }
    await file.write(chunk);
  }
  await file.close();
}

export function buildSoundtrackMixArgs({ silentPath, audioPath, videoPath, durationSeconds, mix }) {
  const musicSeconds = Math.max(0.05, durationSeconds - mix.offsetSeconds);
  const filters = [
    `atrim=duration=${musicSeconds.toFixed(3)}`,
    'asetpts=PTS-STARTPTS',
  ];
  if (mix.fadeInSeconds > 0) filters.push(`afade=t=in:st=0:d=${Math.min(mix.fadeInSeconds, musicSeconds).toFixed(3)}`);
  if (mix.fadeOutSeconds > 0) {
    filters.push(`afade=t=out:st=${Math.max(0, musicSeconds - mix.fadeOutSeconds).toFixed(3)}:d=${Math.min(mix.fadeOutSeconds, musicSeconds).toFixed(3)}`);
  }
  filters.push(`volume=${mix.gainDb}dB`);
  if (mix.offsetSeconds > 0) {
    const delayMs = Math.round(mix.offsetSeconds * 1000);
    filters.push(`adelay=${delayMs}|${delayMs}`);
  }
  filters.push(`apad=whole_dur=${Number(durationSeconds).toFixed(3)}`);
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', silentPath];
  if (mix.loop) args.push('-stream_loop', '-1');
  if (mix.trimStartSeconds > 0) args.push('-ss', String(mix.trimStartSeconds));
  args.push('-i', audioPath, '-filter_complex', `[1:a]${filters.join(',')}[music]`);
  args.push(
    '-map', '0:v:0', '-map', '[music]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-t', String(durationSeconds), '-movflags', '+faststart', '-shortest', videoPath,
  );
  return args;
}

function assertInsideRoots(candidate, roots, label) {
  const inside = roots.some((root) => candidate === root || candidate.startsWith(`${root}${path.sep}`));
  if (!inside) throw new Error(`${label} must be inside an approved local asset root`);
}

async function defaultCommandRunner(binary, args) {
  return execFileAsync(binary, args, { timeout: 240_000, maxBuffer: 16 * 1024 * 1024 });
}

function stableSlug(value) {
  return String(value ?? 'night-out').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'night-out';
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
