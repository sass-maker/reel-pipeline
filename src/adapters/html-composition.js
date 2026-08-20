import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { captureScreenshotPng, evaluate, navigateAndWait, withChrome } from '../../scripts/cdp-capture.js';

const DEFAULT_ARTIFACT_DIR = './artifacts/html-composition';
const DEFAULT_CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const VISUAL_STYLES = new Set([
  'cinematic-slideshow',
  'editorial-cutout',
  'filmstrip',
  'split-frame',
  'polaroid-stack',
  'soft-parallax',
  'kinetic-type',
  'editorial-grid',
  'data-pulse',
  'modular-cards',
  'diagram-flow',
  'minimal-statement',
]);
const execFileAsync = promisify(execFile);

export class HtmlCompositionAdapter {
  constructor(options = {}) {
    this.artifactDir = options.artifactDir ?? process.env.REEL_HTML_COMPOSITION_ARTIFACT_DIR ?? DEFAULT_ARTIFACT_DIR;
    this.ffmpegPath = options.ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg';
    this.chromePath = options.chromePath ?? process.env.REEL_RENDER_CHROME ?? DEFAULT_CHROME_PATH;
    this.commandRunner = options.commandRunner ?? defaultCommandRunner;
    this.frameRenderer = options.frameRenderer ?? renderHtmlSceneFrames;
    this.now = options.now ?? (() => new Date());
    this.keepFrames = Boolean(options.keepFrames);
  }

  async createVideo(brief) {
    const taskId = `html_${stableSlug(brief.id)}_${this.now().getTime()}`;
    const dir = path.resolve(this.artifactDir, taskId);
    await mkdir(dir, { recursive: true });

    const composition = buildHtmlComposition(brief);
    const previewHtmlPath = path.join(dir, 'composition.html');
    const timelinePath = path.join(dir, 'timeline.json');
    const captionsPath = path.join(dir, 'captions.json');
    const manifestPath = path.join(dir, 'manifest.json');
    const framesDir = path.join(dir, 'frames');
    const videoPath = path.join(dir, `${stableSlug(brief.projectSlug)}-${stableSlug(brief.id)}.mp4`);

    await mkdir(framesDir, { recursive: true });
    await writeFile(previewHtmlPath, composition.html);
    await writeFile(timelinePath, `${JSON.stringify(composition.timeline, null, 2)}\n`);
    await writeFile(captionsPath, `${JSON.stringify(composition.captions, null, 2)}\n`);

    const frames = await this.frameRenderer(previewHtmlPath, composition.timeline, framesDir, { chromePath: this.chromePath });
    await encodeSceneFrames({
      frames,
      timeline: composition.timeline,
      ffmpegPath: this.ffmpegPath,
      videoPath,
      commandRunner: this.commandRunner,
    });
    const videoInfo = await stat(videoPath).catch(() => null);
    if (!videoInfo?.isFile() || videoInfo.size < 8) throw new Error('HTML composition encode did not produce a playable MP4 artifact');
    if (!this.keepFrames) await rm(framesDir, { recursive: true, force: true });

    const render = {
      provider: 'html-composition',
      externalTaskId: taskId,
      status: 'completed',
      videos: [videoPath],
      durationSeconds: composition.timeline.durationSeconds,
      proofType: 'generated_card',
      captionText: brief.hook,
      renderLog: [
        'style=html-css-composition',
        `visualStyle=${composition.timeline.visualStyle}`,
        `scenes=${composition.timeline.scenes.length}`,
        `captions=${composition.captions.length}`,
        `durationSeconds=${composition.timeline.durationSeconds}`,
        'delivery=final-video',
      ],
      raw: {
        previewHtmlPath,
        videoPath,
        timelinePath,
        captionsPath,
        manifestPath,
        aspect: '9:16',
        width: WIDTH,
        height: HEIGHT,
        fps: FPS,
      },
    };

    await writeFile(manifestPath, `${JSON.stringify({ taskId, brief, render }, null, 2)}\n`);
    return render;
  }

  async getStatus(externalTaskId) {
    const manifestPath = path.resolve(this.artifactDir, externalTaskId, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    return manifest.render;
  }
}

export async function probeHtmlComposition(options = {}) {
  const commandRunner = options.commandRunner ?? defaultCommandRunner;
  const chromePath = options.chromePath ?? process.env.REEL_RENDER_CHROME ?? DEFAULT_CHROME_PATH;
  const ffmpegPath = options.ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg';
  const failures = [];
  for (const [name, executable, args] of [
    ['Chrome', chromePath, ['--version']],
    ['FFmpeg', ffmpegPath, ['-version']],
  ]) {
    try {
      const result = await commandRunner(executable, args, { timeout: 15_000, maxBuffer: 1024 * 1024 });
      const output = `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`.trim();
      if (!output) failures.push(`${name} version output was empty`);
    } catch (error) {
      failures.push(`${name} is unavailable: ${String(error?.code === 'ENOENT' ? 'not found' : error?.message ?? error)}`);
    }
  }
  return failures.length
    ? { ready: false, chromePath, ffmpegPath, blocker: failures.join(' ') }
    : { ready: true, chromePath, ffmpegPath, blocker: null };
}

export async function renderHtmlSceneFrames(previewHtmlPath, timeline, framesDir, options = {}) {
  const frames = [];
  await withChrome({ width: timeline.width, height: timeline.height, chromePath: options.chromePath }, async (cdp) => {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: timeline.width,
      height: timeline.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigateAndWait(cdp, pathToFileURL(previewHtmlPath).href);
    for (const scene of timeline.scenes) {
      const framePath = path.join(framesDir, `scene_${String(scene.index + 1).padStart(3, '0')}.png`);
      const sampleTime = Math.min(scene.end - 0.05, scene.start + Math.max(0.1, scene.duration * 0.5));
      await evaluate(cdp, `(() => {
        window.setCompositionTime(${JSON.stringify(sampleTime)});
        for (const node of document.querySelectorAll('.scene')) {
          node.style.animation = 'none';
          node.style.opacity = node.dataset.scene === ${JSON.stringify(scene.id)} ? '1' : '0';
          node.style.transform = node.dataset.scene === ${JSON.stringify(scene.id)} ? 'none' : 'translateY(28px) scale(.985)';
        }
        const caption = document.getElementById('caption');
        if (caption) caption.textContent = ${JSON.stringify(scene.caption)};
      })()`);
      await captureScreenshotPng(cdp, framePath);
      frames.push({ path: framePath, duration: scene.duration, motion: scene.motion });
    }
  });
  return frames;
}

async function encodeSceneFrames({ frames, timeline, ffmpegPath, videoPath, commandRunner }) {
  if (!frames.length) throw new Error('HTML composition has no scene frames to encode');
  const args = ['-y'];
  for (const frame of frames) args.push('-framerate', String(timeline.fps), '-loop', '1', '-t', String(frame.duration), '-i', frame.path);
  args.push('-f', 'lavfi', '-t', String(timeline.durationSeconds), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  const videoFilters = frames.map((frame, index) => (
    `[${index}:v]scale=${timeline.width}:${timeline.height}:force_original_aspect_ratio=increase,`
    + `crop=${timeline.width}:${timeline.height},zoompan=z='${zoomForMotion(frame.motion)}':d=1:s=${timeline.width}x${timeline.height}:fps=${timeline.fps},`
    + `trim=duration=${frame.duration},setpts=PTS-STARTPTS,setsar=1[v${index}]`
  ));
  const concatInputs = frames.map((_, index) => `[v${index}]`).join('');
  args.push(
    '-filter_complex', `${videoFilters.join(';')};${concatInputs}concat=n=${frames.length}:v=1:a=0[v]`,
    '-map', '[v]',
    '-map', `${frames.length}:a`,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-crf', '18',
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', '+faststart',
    '-shortest',
    videoPath,
  );
  await commandRunner(ffmpegPath, args, { timeout: Math.max(120_000, timeline.durationSeconds * 10_000), maxBuffer: 16 * 1024 * 1024 });
}

export function buildHtmlComposition(brief) {
  const durationSeconds = clampDuration(brief.durationSeconds ?? 20);
  const visualStyle = visualStyleFor(brief);
  const palette = paletteFor(`${brief.projectSlug}:${visualStyle}`);
  const sceneTexts = buildSceneTexts(brief);
  const motions = motionPlanFor(visualStyle);
  const scenes = distributeScenes(sceneTexts, durationSeconds).map((scene, index) => ({
    id: `scene-${index + 1}`,
    index,
    kind: scene.kind,
    start: round(scene.start),
    duration: round(scene.duration),
    end: round(scene.start + scene.duration),
    title: scene.title,
    caption: scene.caption,
    motion: motions[index % motions.length],
    accent: palette.accent,
  }));

  const captions = scenes.flatMap((scene) => captionsForScene(scene));
  const timeline = {
    format: 'html-composition-v1',
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    aspect: '9:16',
    durationSeconds,
    visualStyle,
    projectSlug: brief.projectSlug,
    title: brief.title,
    scenes,
  };

  return {
    timeline,
    captions,
    html: renderHtml({ brief, timeline, captions, palette }),
  };
}

function buildSceneTexts(brief) {
  const bodySentences = splitSentences(cleanBody(brief.body)).slice(0, 3);
  const bodyScenes = bodySentences.map((caption, index) => ({
    kind: index === 0 ? 'setup' : index === bodySentences.length - 1 ? 'conclusion' : 'evidence',
    title: index === 0 ? 'The setup' : index === bodySentences.length - 1 ? 'The conclusion' : 'The evidence',
    caption,
  }));
  return [
    { kind: 'hook', title: brief.title, caption: brief.hook },
    ...bodyScenes,
    ...(brief.cta ? [{ kind: 'cta', title: 'Next step', caption: brief.cta }] : []),
  ].slice(0, 5);
}

function distributeScenes(sceneTexts, durationSeconds) {
  const count = Math.max(1, sceneTexts.length);
  const base = durationSeconds / count;
  let cursor = 0;
  return sceneTexts.map((scene, index) => {
    const duration = index === count - 1 ? durationSeconds - cursor : base;
    const out = { ...scene, start: cursor, duration };
    cursor += duration;
    return out;
  });
}

function captionsForScene(scene) {
  const words = scene.caption.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const cueDuration = scene.duration / Math.ceil(words.length / 4);
  const cues = [];
  for (let i = 0; i < words.length; i += 4) {
    const cueWords = words.slice(i, i + 4);
    const start = scene.start + cues.length * cueDuration;
    const end = Math.min(scene.end, start + cueDuration);
    cues.push({
      sceneId: scene.id,
      start: round(start),
      end: round(end),
      text: cueWords.join(' '),
      words: cueWords.map((word, wordIndex) => {
        const wordDuration = (end - start) / cueWords.length;
        return {
          text: word,
          start: round(start + wordDuration * wordIndex),
          end: round(start + wordDuration * (wordIndex + 1)),
        };
      }),
    });
  }
  return cues;
}

function renderHtml({ brief, timeline, captions, palette }) {
  const sceneMarkup = timeline.scenes
    .map((scene) => `
      <section class="scene scene-${scene.index}" data-scene="${scene.id}">
        <div class="label">${escapeHtml(scene.kind)}</div>
        <h1>${escapeHtml(scene.title)}</h1>
        <p>${escapeHtml(scene.caption)}</p>
        <div class="motif" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="meter"><span></span></div>
      </section>`)
    .join('\n');
  const sceneCss = timeline.scenes.map((scene) => sceneAnimationCss(scene, timeline.durationSeconds)).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(brief.title)} - HTML composition preview</title>
  <style>
    :root {
      --bg: ${palette.bg};
      --fg: ${palette.fg};
      --muted: ${palette.muted};
      --accent: ${palette.accent};
      --duration: ${timeline.durationSeconds}s;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body { margin: 0; background: #111; color: var(--fg); display: grid; min-height: 100vh; place-items: center; }
    .stage {
      position: relative;
      width: min(100vw, ${WIDTH}px);
      aspect-ratio: 9 / 16;
      overflow: hidden;
      background:
        radial-gradient(circle at 25% 20%, color-mix(in srgb, var(--accent) 42%, transparent), transparent 28%),
        linear-gradient(160deg, var(--bg), #08090d 72%);
      box-shadow: 0 24px 80px rgb(0 0 0 / 48%);
      isolation: isolate;
    }
    .stage::before { content: ""; position: absolute; inset: 5%; border: 1px solid rgb(255 255 255 / 14%); }
    .stage::after { content: ""; position: absolute; pointer-events: none; }
    .brand { position: absolute; left: 56px; top: 56px; color: var(--muted); font-size: 24px; letter-spacing: .08em; text-transform: uppercase; }
    .scene {
      position: absolute;
      inset: 150px 72px 180px;
      display: grid;
      align-content: center;
      gap: 26px;
      opacity: 0;
      transform: translateY(28px) scale(.985);
      animation-duration: var(--duration);
      animation-fill-mode: both;
      animation-timing-function: linear;
      animation-iteration-count: infinite;
    }
    .label { color: var(--accent); font-size: 28px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0; max-width: 900px; font-size: 92px; line-height: .94; letter-spacing: 0; }
    p { margin: 0; max-width: 860px; color: var(--fg); font-size: 54px; line-height: 1.08; }
    .meter { width: 100%; height: 8px; border-radius: 999px; background: rgb(255 255 255 / 13%); overflow: hidden; }
    .meter span { display: block; height: 100%; width: 100%; background: var(--accent); transform-origin: left; animation: meter var(--duration) linear infinite; }
    .motif { position: relative; width: 100%; height: 180px; overflow: hidden; }
    .motif i { position: absolute; display: block; border: 3px solid var(--accent); }
    .motif i:nth-child(1) { inset: 8% 55% 12% 3%; }
    .motif i:nth-child(2) { inset: 28% 24% 3% 38%; border-color: color-mix(in srgb, var(--accent) 55%, white); }
    .motif i:nth-child(3) { inset: 2% 2% 38% 72%; border-color: rgb(255 255 255 / 25%); }
    .stage[data-style="kinetic-type"] h1 { max-width: none; font-size: 122px; line-height: .82; text-transform: uppercase; }
    .stage[data-style="kinetic-type"] p { max-width: 760px; padding-left: 170px; }
    .stage[data-style="kinetic-type"] .motif { height: 54px; background: var(--accent); clip-path: polygon(0 34%, 82% 34%, 82% 0, 100% 50%, 82% 100%, 82% 66%, 0 66%); }
    .stage[data-style="kinetic-type"] .motif i { display: none; }
    .stage[data-style="editorial-grid"] { background: linear-gradient(90deg, transparent 49.8%, rgb(255 255 255 / 13%) 50%, transparent 50.2%), var(--bg); }
    .stage[data-style="editorial-grid"] .scene { inset-inline: 96px; grid-template-columns: 1fr 1fr; align-items: center; }
    .stage[data-style="editorial-grid"] .label, .stage[data-style="editorial-grid"] .meter { grid-column: 1 / -1; }
    .stage[data-style="editorial-grid"] h1 { font-size: 78px; }
    .stage[data-style="editorial-grid"] p { padding-left: 40px; border-left: 1px solid rgb(255 255 255 / 18%); font-size: 44px; }
    .stage[data-style="editorial-grid"] .motif { display: none; }
    .stage[data-style="data-pulse"] .scene { text-align: center; justify-items: center; }
    .stage[data-style="data-pulse"] h1 { font-size: 76px; }
    .stage[data-style="data-pulse"] .motif { width: 420px; height: 420px; border: 38px solid rgb(255 255 255 / 10%); border-top-color: var(--accent); border-radius: 50%; }
    .stage[data-style="data-pulse"] .motif i { inset: 50%; width: 18px; height: 18px; border: 0; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 80px color-mix(in srgb, var(--accent) 12%, transparent), 0 0 0 160px color-mix(in srgb, var(--accent) 6%, transparent); transform: translate(-50%, -50%); }
    .stage[data-style="data-pulse"] .motif i:nth-child(n+2) { display: none; }
    .stage[data-style="modular-cards"] .scene { inset: 180px 62px 190px; padding: 56px; border: 2px solid rgb(255 255 255 / 18%); background: color-mix(in srgb, var(--bg) 75%, black); box-shadow: 24px 24px 0 color-mix(in srgb, var(--accent) 22%, transparent); }
    .stage[data-style="modular-cards"] h1 { font-size: 74px; }
    .stage[data-style="modular-cards"] .motif { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; height: 150px; }
    .stage[data-style="modular-cards"] .motif i { position: static; border-width: 1px; background: color-mix(in srgb, var(--accent) 12%, transparent); }
    .stage[data-style="diagram-flow"] .motif { height: 240px; overflow: visible; }
    .stage[data-style="diagram-flow"] .motif::before { content: ""; position: absolute; left: 12%; right: 12%; top: 50%; height: 3px; background: var(--accent); }
    .stage[data-style="diagram-flow"] .motif i { top: 50%; width: 82px; height: 82px; border-radius: 50%; background: var(--bg); transform: translateY(-50%); }
    .stage[data-style="diagram-flow"] .motif i:nth-child(1) { left: 8%; right: auto; bottom: auto; }
    .stage[data-style="diagram-flow"] .motif i:nth-child(2) { left: calc(50% - 41px); right: auto; bottom: auto; }
    .stage[data-style="diagram-flow"] .motif i:nth-child(3) { left: auto; right: 8%; bottom: auto; }
    .stage[data-style="minimal-statement"] .brand, .stage[data-style="minimal-statement"] .label, .stage[data-style="minimal-statement"] .caption, .stage[data-style="minimal-statement"] .motif { display: none; }
    .stage[data-style="minimal-statement"] .scene { inset: 120px; text-align: center; justify-items: center; }
    .stage[data-style="minimal-statement"] h1 { max-width: 780px; font-size: 112px; line-height: .9; }
    .stage[data-style="minimal-statement"] p { max-width: 680px; color: var(--muted); font-size: 38px; }
    .stage[data-style="filmstrip"]::before { inset: 0 42px; border-width: 0 18px; border-style: solid; border-color: #090909; }
    .stage[data-style="filmstrip"]::after { inset: 0 18px; background: repeating-linear-gradient(180deg, #ece8dc 0 18px, transparent 18px 42px); opacity: .78; clip-path: polygon(0 0, 16px 0, 16px 100%, 0 100%, 0 0, calc(100% - 16px) 0, 100% 0, 100% 100%, calc(100% - 16px) 100%); }
    .stage[data-style="filmstrip"] .scene { inset-inline: 112px; }
    .stage[data-style="split-frame"] { background: linear-gradient(90deg, var(--bg) 0 52%, color-mix(in srgb, var(--accent) 24%, #08090d) 52%); }
    .stage[data-style="split-frame"] .scene { grid-template-columns: 1.15fr .85fr; align-items: center; }
    .stage[data-style="split-frame"] .label, .stage[data-style="split-frame"] .meter { grid-column: 1 / -1; }
    .stage[data-style="split-frame"] h1 { font-size: 76px; }
    .stage[data-style="split-frame"] p { padding-left: 46px; font-size: 42px; }
    .stage[data-style="split-frame"] .motif { display: none; }
    .stage[data-style="polaroid-stack"] .motif { height: 380px; overflow: visible; }
    .stage[data-style="polaroid-stack"] .motif i { inset: auto; width: 280px; height: 330px; border: 24px solid #f0ecdf; border-bottom-width: 66px; background: color-mix(in srgb, var(--accent) 36%, #111); }
    .stage[data-style="polaroid-stack"] .motif i:nth-child(1) { left: 4%; top: 22px; transform: rotate(-9deg); }
    .stage[data-style="polaroid-stack"] .motif i:nth-child(2) { left: 34%; top: 0; transform: rotate(4deg); }
    .stage[data-style="polaroid-stack"] .motif i:nth-child(3) { right: 2%; top: 30px; transform: rotate(11deg); }
    .stage[data-style="editorial-cutout"] h1 { max-width: 860px; font-size: 104px; line-height: .86; }
    .stage[data-style="editorial-cutout"] .motif { position: absolute; right: -72px; bottom: 180px; width: 460px; height: 620px; border-radius: 50% 50% 8% 8%; background: var(--accent); mix-blend-mode: screen; opacity: .42; }
    .stage[data-style="editorial-cutout"] .motif i { display: none; }
    .stage[data-style="soft-parallax"]::after { inset: -10%; background: radial-gradient(circle at 20% 25%, var(--accent), transparent 25%), radial-gradient(circle at 78% 64%, color-mix(in srgb, var(--accent) 55%, #704cff), transparent 32%); filter: blur(60px); opacity: .42; }
    .stage[data-style="soft-parallax"] .scene { z-index: 1; padding: 44px; background: rgb(5 8 10 / 28%); backdrop-filter: blur(16px); }
    .stage[data-style="cinematic-slideshow"] .motif { height: 440px; background: linear-gradient(140deg, color-mix(in srgb, var(--accent) 44%, #09090c), #09090c); clip-path: polygon(0 18%, 64% 0, 100% 22%, 88% 100%, 14% 92%); }
    .stage[data-style="cinematic-slideshow"] .motif i { border-radius: 50%; }
    .caption {
      position: absolute;
      left: 72px;
      right: 72px;
      bottom: 72px;
      min-height: 92px;
      border-radius: 8px;
      background: rgb(0 0 0 / 62%);
      color: white;
      padding: 24px 28px;
      font-size: 38px;
      line-height: 1.08;
    }
    ${sceneCss}
    @keyframes meter { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  </style>
</head>
<body>
  <main class="stage" data-duration="${timeline.durationSeconds}" data-style="${escapeHtml(timeline.visualStyle)}">
    <div class="brand">${escapeHtml(brief.projectSlug)}</div>
${sceneMarkup}
    <div class="caption" id="caption">${escapeHtml(captions[0]?.text ?? brief.hook)}</div>
  </main>
  <script type="application/json" id="timeline">${jsonScript(timeline)}</script>
  <script type="application/json" id="captions">${jsonScript(captions)}</script>
  <script>
    const captions = JSON.parse(document.getElementById('captions').textContent);
    const captionEl = document.getElementById('caption');
    window.setCompositionTime = (seconds) => {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = seconds * 1000;
      }
      const cue = captions.find((item) => seconds >= item.start && seconds < item.end) || captions.at(-1);
      if (cue) captionEl.textContent = cue.text;
    };
    setInterval(() => window.setCompositionTime((performance.now() / 1000) % ${timeline.durationSeconds}), 100);
  </script>
</body>
</html>
`;
}

function sceneAnimationCss(scene, durationSeconds) {
  const start = (scene.start / durationSeconds) * 100;
  const fadeIn = Math.min(start + 5, 100);
  const hold = Math.max(start, ((scene.end / durationSeconds) * 100) - 5);
  const end = (scene.end / durationSeconds) * 100;
  return `.scene-${scene.index} { animation-name: scene-${scene.index}; }
    @keyframes scene-${scene.index} {
      0%, ${pct(start)} { opacity: 0; transform: translateY(28px) scale(.985); }
      ${pct(fadeIn)}, ${pct(hold)} { opacity: 1; transform: translateY(0) scale(1); }
      ${pct(end)}, 100% { opacity: 0; transform: translateY(-24px) scale(1.015); }
    }`;
}

function pct(value) {
  return `${Math.max(0, Math.min(100, value)).toFixed(3)}%`;
}

function paletteFor(projectSlug) {
  const palettes = [
    { bg: '#15130f', fg: '#fff7df', muted: '#c7bfa7', accent: '#f2b84b' },
    { bg: '#101923', fg: '#eff9ff', muted: '#9eb7c9', accent: '#43d3ff' },
    { bg: '#111920', fg: '#f5fff9', muted: '#a9c0b0', accent: '#61e294' },
    { bg: '#1d1420', fg: '#fff4ff', muted: '#c6aacd', accent: '#ff83c9' },
  ];
  const index = stableIndex(projectSlug, palettes.length);
  return palettes[index];
}

function visualStyleFor(brief) {
  const direct = brief.renderOptions?.visualStyle;
  if (VISUAL_STYLES.has(direct)) return direct;
  const legacyMotion = {
    kinetic: 'kinetic-type',
    editorial: 'editorial-grid',
    minimal: 'minimal-statement',
  }[brief.renderOptions?.motionStyle];
  if (legacyMotion) return legacyMotion;
  const legacyTransition = {
    dissolve: 'soft-parallax',
    push: 'split-frame',
    cut: 'filmstrip',
  }[brief.renderOptions?.transition];
  return legacyTransition ?? 'kinetic-type';
}

function motionPlanFor(visualStyle) {
  if (['minimal-statement', 'editorial-grid'].includes(visualStyle)) return ['settle', 'cut'];
  if (['filmstrip', 'split-frame'].includes(visualStyle)) return ['push', 'cut', 'push'];
  if (['data-pulse', 'diagram-flow'].includes(visualStyle)) return ['pulse', 'settle', 'pulse'];
  return ['rise', 'push', 'split', 'settle'];
}

function zoomForMotion(motion) {
  if (motion === 'settle' || motion === 'cut') return '1';
  if (motion === 'pulse' || motion === 'split') return "1.015+0.012*sin(on/18)";
  if (motion === 'rise') return 'min(zoom+0.00035,1.025)';
  return 'min(zoom+0.0008,1.04)';
}

function cleanBody(body) {
  return String(body ?? '')
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\b(script|shot list|shots|captions?|asset prompts?|visuals?):/gi, '')
    .replace(/[-*]\s+/g, '')
    .trim();
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.slice(0, 150));
}

function clampDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return 20;
  return Math.max(5, Math.min(90, duration));
}

function round(value) {
  return Number(value.toFixed(3));
}

function stableSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'composition';
}

function stableIndex(value, length) {
  const text = String(value ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % length;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

async function defaultCommandRunner(binary, args, options) {
  return execFileAsync(binary, args, { ...options, shell: false });
}
