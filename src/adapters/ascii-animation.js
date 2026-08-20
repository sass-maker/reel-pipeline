import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { captureScreenshotPng, evaluate, navigateAndWait, withChrome } from '../../scripts/cdp-capture.js';

const execFileAsync = promisify(execFile);
const DEFAULT_ARTIFACT_DIR = './artifacts/ascii-animation';
const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_FPS = 24;
const DEFAULT_DURATION = 6;
const COLS = 24;
const ROWS = 42;

const COLORS = {
  bg: [16, 15, 13],
  panel: [23, 19, 15],
  dim: [80, 72, 59],
  dot: [163, 151, 123],
  cream: [247, 235, 202],
  amber: [231, 168, 73],
  red: [225, 86, 76],
  blue: [139, 226, 255],
  green: [145, 233, 143],
  spark: [255, 243, 155],
  rail: [28, 24, 19],
};

const ASCII_PALETTES = {
  amber: { bg: '#100f0d', panel: '#17130f', ink: '#242018', dim: '#5d5444', dot: '#a3977b', cream: '#f7ebca', amber: '#e7a849', red: '#e1564c', blue: '#8be2ff', green: '#91e98f', spark: '#fff39b' },
  mono: { bg: '#0b0c0e', panel: '#141619', ink: '#24282d', dim: '#6e757c', dot: '#9ca4aa', cream: '#f4f6f7', amber: '#c3c9cd', red: '#ffffff', blue: '#aab3ba', green: '#d9dee1', spark: '#ffffff' },
  terminal: { bg: '#02120b', panel: '#041a10', ink: '#07301d', dim: '#347354', dot: '#62aa7f', cream: '#caffdd', amber: '#8bff9c', red: '#ff7f7f', blue: '#6ef5d0', green: '#40ff84', spark: '#e3ff83' },
  cobalt: { bg: '#07101f', panel: '#0b1930', ink: '#122c50', dim: '#587095', dot: '#8399bb', cream: '#edf5ff', amber: '#ffd166', red: '#ff6b87', blue: '#61dafb', green: '#7ce38b', spark: '#fff08a' },
  magenta: { bg: '#180817', panel: '#260e25', ink: '#42183f', dim: '#86587f', dot: '#b77cad', cream: '#fff0fb', amber: '#ffca6b', red: '#ff4f9a', blue: '#7ee8fa', green: '#bbff85', spark: '#fff18c' },
  paper: { bg: '#e8e0ce', panel: '#d8cfba', ink: '#bcb19a', dim: '#8b816c', dot: '#6d6556', cream: '#1a1814', amber: '#9b5f1f', red: '#a33f32', blue: '#225f78', green: '#3d6d4a', spark: '#b87916' },
};

const FONT = {
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'C': ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'G': ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  'J': ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01111', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '11110'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '\\': ['10000', '01000', '01000', '00100', '00010', '00010', '00001'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  ';': ['00000', '01100', '01100', '00000', '01100', '00100', '01000'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  '"': ['01010', '01010', '01010', '00000', '00000', '00000', '00000'],
  '\'': ['00100', '00100', '00100', '00000', '00000', '00000', '00000'],
  '`': ['01000', '00100', '00100', '00000', '00000', '00000', '00000'],
  '*': ['00100', '10101', '01110', '11111', '01110', '10101', '00100'],
  '@': ['01110', '10001', '10111', '10101', '10111', '10000', '01111'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '[': ['01110', '01000', '01000', '01000', '01000', '01000', '01110'],
  ']': ['01110', '00010', '00010', '00010', '00010', '00010', '01110'],
  '{': ['00010', '00100', '00100', '01000', '00100', '00100', '00010'],
  '}': ['01000', '00100', '00100', '00010', '00100', '00100', '01000'],
  '|': ['00100', '00100', '00100', '00100', '00100', '00100', '00100'],
  '>': ['10000', '01000', '00100', '00010', '00100', '01000', '10000'],
  '<': ['00001', '00010', '00100', '01000', '00100', '00010', '00001'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

export class AsciiAnimationAdapter {
  constructor(options = {}) {
    this.artifactDir = options.artifactDir ?? process.env.REEL_ASCII_ARTIFACT_DIR ?? DEFAULT_ARTIFACT_DIR;
    this.ffmpegPath = options.ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg';
    this.commandRunner = options.commandRunner ?? defaultCommandRunner;
    this.now = options.now ?? (() => new Date());
    this.keepFrames = Boolean(options.keepFrames);
    this.renderer = options.renderer ?? process.env.REEL_ASCII_RENDERER ?? 'browser';
    this.width = options.width ?? DEFAULT_WIDTH;
    this.height = options.height ?? DEFAULT_HEIGHT;
    this.fps = options.fps ?? DEFAULT_FPS;
  }

  async createVideo(brief) {
    const taskId = `ascii_${stableSlug(brief.id)}_${this.now().getTime()}`;
    const dir = path.resolve(this.artifactDir, taskId);
    const framesDir = path.join(dir, 'frames');
    const durationSeconds = clampDuration(brief.durationSeconds ?? DEFAULT_DURATION);
    const frameCount = Math.round(this.fps * durationSeconds);
    const videoPath = path.join(dir, `${stableSlug(brief.projectSlug)}-${stableSlug(brief.id)}.mp4`);
    await mkdir(framesDir, { recursive: true });

    const theme = buildAsciiTheme(brief);
    const renderLog = ['style=ascii-fable', `palette=${theme.palette.id}`, `sceneStyle=${theme.sceneStyle}`];
    let framePattern = path.join(framesDir, 'frame_%04d.ppm');
    try {
      if (this.renderer === 'browser') {
        framePattern = await renderAsciiBrowserFrames(brief, {
          artifactDir: dir,
          framesDir,
          width: this.width,
          height: this.height,
          frameCount,
        });
        renderLog.push('renderer=browser-html');
      } else {
        framePattern = await renderAsciiFrames(brief, {
          framesDir,
          width: this.width,
          height: this.height,
          fps: this.fps,
          frameCount,
        });
        renderLog.push('renderer=raster-fallback');
      }
    } catch (error) {
      if (this.renderer !== 'browser') throw error;
      await rm(framesDir, { recursive: true, force: true });
      await mkdir(framesDir, { recursive: true });
      framePattern = await renderAsciiFrames(brief, {
        framesDir,
        width: this.width,
        height: this.height,
        fps: this.fps,
        frameCount,
      });
      renderLog.push('renderer=raster-fallback');
      renderLog.push(`browserRendererFailed=${formatError(error)}`);
    }

    await this.commandRunner(this.ffmpegPath, [
      '-y',
      '-framerate', String(this.fps),
      '-i', framePattern,
      '-f', 'lavfi',
      '-i', asciiAudioFilter(durationSeconds),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', '18',
      '-preset', 'veryfast',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-shortest',
      videoPath,
    ], { timeout: 120_000 });

    if (!this.keepFrames) await rm(framesDir, { recursive: true, force: true });

    const render = {
      provider: 'ascii-animation',
      externalTaskId: taskId,
      status: 'completed',
      videos: [videoPath],
      durationSeconds,
      proofType: 'generated_card',
      captionText: brief.hook,
      renderLog: [
        ...renderLog,
        'layout=authored-ascii-plates',
        `frames=${frameCount}`,
        `durationSeconds=${durationSeconds}`,
      ],
      raw: {
        manifestPath: path.join(dir, 'manifest.json'),
        aspect: '9:16',
        width: this.width,
        height: this.height,
        fps: this.fps,
      },
    };

    await writeFile(render.raw.manifestPath, `${JSON.stringify({ taskId, brief, render }, null, 2)}\n`);
    return render;
  }

  async getStatus(externalTaskId) {
    const manifestPath = path.resolve(this.artifactDir, externalTaskId, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    return manifest.render;
  }
}

export async function renderAsciiFrames(brief, options) {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const frameCount = options.frameCount;
  const framesDir = options.framesDir;
  const theme = buildAsciiTheme(brief);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const pixels = makeCanvas(width, height);
    const scene = new AsciiScene(pixels, width, height, theme.colors);
    drawFrame(scene, frame, frameCount, theme);
    await writeFile(path.join(framesDir, `frame_${String(frame).padStart(4, '0')}.ppm`), ppmBuffer(width, height, pixels));
  }
  return path.join(framesDir, 'frame_%04d.ppm');
}

export async function renderAsciiBrowserFrames(brief, options) {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const frameCount = options.frameCount;
  const framesDir = options.framesDir;
  const htmlPath = path.join(options.artifactDir, 'ascii-terminal.html');
  const theme = buildAsciiTheme(brief);
  await writeFile(htmlPath, browserHtml(theme));
  await withChrome({ width, height }, async (cdp) => {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigateAndWait(cdp, pathToFileURL(htmlPath).href);
    for (let frame = 0; frame < frameCount; frame += 1) {
      const progress = frame / Math.max(1, frameCount - 1);
      await evaluate(cdp, `window.renderAsciiFrame(${JSON.stringify(progress)}, ${JSON.stringify(frame)})`);
      await captureScreenshotPng(cdp, path.join(framesDir, `frame_${String(frame).padStart(4, '0')}.png`));
    }
  });
  return path.join(framesDir, 'frame_%04d.png');
}

function browserHtml(theme) {
  const payload = JSON.stringify(theme);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1080,height=1920,initial-scale=1">
<style>
  :root {
    --bg: ${theme.palette.bg};
    --panel: ${theme.palette.panel};
    --ink: ${theme.palette.ink};
    --dim: ${theme.palette.dim};
    --dot: ${theme.palette.dot};
    --cream: ${theme.palette.cream};
    --amber: ${theme.palette.amber};
    --red: ${theme.palette.red};
    --blue: ${theme.palette.blue};
    --green: ${theme.palette.green};
    --spark: ${theme.palette.spark};
  }
  * { box-sizing: border-box; }
  html, body {
    width: 1080px;
    height: 1920px;
    margin: 0;
    overflow: hidden;
    background: var(--bg);
    color: var(--cream);
    font-family: "SF Mono", "Menlo", "Monaco", "Courier New", monospace;
  }
  body {
    background:
      linear-gradient(180deg, var(--bg) 0%, color-mix(in srgb, var(--panel) 82%, var(--bg)) 56%, var(--panel) 100%);
  }
  .frame {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 92px 76px 88px;
  }
  .frame::before,
  .frame::after {
    content: "";
    position: absolute;
    inset: 44px 34px;
    border: 10px solid var(--ink);
    pointer-events: none;
  }
  .frame::after {
    inset: 62px 58px;
    border: 0;
    background-image:
      radial-gradient(circle, var(--dot) 0 3px, transparent 4px),
      radial-gradient(circle, rgba(163,151,123,0.34) 0 2px, transparent 3px);
    background-size: 74px 74px, 111px 111px;
    background-position: var(--phase-x, 0px) var(--phase-y, 0px), 12px 34px;
    opacity: 0.42;
    mask-image: linear-gradient(180deg, black, rgba(0,0,0,0.58));
  }
  .title {
    position: relative;
    z-index: 2;
    margin: 0;
    font-size: 70px;
    line-height: 0.95;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--cream);
    text-shadow: 0 0 20px rgba(247,235,202,0.08);
  }
  .subtitle {
    position: relative;
    z-index: 2;
    margin-top: 24px;
    font-size: 26px;
    line-height: 1;
    color: var(--amber);
  }
  .terminal {
    position: relative;
    z-index: 2;
    margin-top: 38px;
    width: 640px;
    padding: 24px 28px;
    border: 1px solid rgba(163,151,123,0.22);
    background: rgba(23,19,15,0.78);
    box-shadow: inset 0 0 0 1px rgba(247,235,202,0.05);
  }
  .terminal pre {
    margin: 0;
    color: var(--dot);
    font-size: 23px;
    line-height: 1.26;
  }
  .stage {
    position: relative;
    z-index: 2;
    margin-top: 112px;
    min-height: 620px;
    display: grid;
    place-items: center;
  }
  .scene-label {
    position: absolute;
    top: -34px;
    left: 0;
    right: 0;
    text-align: center;
    color: var(--amber);
    font-size: 30px;
    line-height: 1;
  }
  .art {
    margin: 0;
    color: var(--blue);
    font-size: 42px;
    line-height: 1.04;
    letter-spacing: 0;
    text-align: center;
    white-space: pre;
    text-shadow: 0 0 16px rgba(139,226,255,0.13);
  }
  .art .core { color: var(--red); }
  .art .warm { color: var(--amber); }
  .art .spark { color: var(--spark); }
  .caption {
    position: relative;
    z-index: 2;
    margin-top: 52px;
    font-size: 30px;
    line-height: 1;
    color: var(--cream);
    text-align: center;
  }
  .footer {
    position: absolute;
    z-index: 2;
    left: 116px;
    right: 116px;
    bottom: 205px;
    padding: 24px 26px;
    background: rgba(23,19,15,0.82);
    border: 1px solid rgba(163,151,123,0.18);
    color: var(--cream);
    font-size: 31px;
    line-height: 1;
    text-align: center;
  }
</style>
</head>
<body>
<main class="frame" id="frame">
  <h1 class="title" id="title"></h1>
  <div class="subtitle" id="subtitle"></div>
  <section class="terminal"><pre id="code"></pre></section>
  <section class="stage">
    <div class="scene-label" id="label"></div>
    <pre class="art" id="art"></pre>
  </section>
  <div class="caption" id="caption"></div>
  <div class="footer">SAME LAWS. DIFFERENT SCALE.</div>
</main>
<script>
const theme = ${payload};
const frameEl = document.getElementById('frame');
const titleEl = document.getElementById('title');
const subtitleEl = document.getElementById('subtitle');
const codeEl = document.getElementById('code');
const labelEl = document.getElementById('label');
const artEl = document.getElementById('art');
const captionEl = document.getElementById('caption');

const scenes = [
  {
    label: 'ATOM',
    caption: theme.atomCaption,
    art: [
      '        .       .',
      '    .     \\\\   /     .',
      ' .         \\\\ /         .',
      '      -----(@)-----',
      ' .         / \\\\         .',
      '    .     /   \\\\     .',
      '        .       .',
    ],
  },
  {
    label: 'BOND',
    caption: theme.bondCaption,
    art: [
      '          (O)',
      '           |',
      '    (O)---+---(O)',
      '       \\\\  |  /',
      '        \\\\ | /',
      '          O',
      '          |',
      '         (O)',
    ],
  },
  {
    label: 'ORBIT',
    caption: theme.orbitCaption,
    art: [
      '      .-----------.',
      '   .-/             \\\\-.',
      '  /       ( O )       \\\\',
      '  \\\\                   /',
      "   '-.             .-'",
      "      '----...----'",
    ],
  },
];

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
}

function colorize(line, sparkIndex = -1) {
  let out = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const safe = escapeHtml(ch);
    if (i === sparkIndex) out += '<span class="spark">*</span>';
    else if (ch === '@') out += '<span class="core">@</span>';
    else if (ch === 'O') out += '<span class="warm">O</span>';
    else out += safe;
  }
  return out;
}

function renderArt(scene, frame) {
  const rows = scene.art.slice();
  const row = frame % 32 < 16 ? Math.min(rows.length - 1, Math.floor(rows.length / 2) + 1) : Math.max(0, Math.floor(rows.length / 2) - 1);
  const line = rows[row];
  const col = Math.max(0, Math.min(line.length - 1, Math.floor((frame * 0.45) % Math.max(1, line.length))));
  return rows.map((text, index) => colorize(text, index === row ? col : -1)).join('\\n');
}

window.renderAsciiFrame = (progress, frame) => {
  const index = progress < 0.36 ? 0 : progress < 0.69 ? 1 : 2;
  const scene = scenes[index];
  titleEl.textContent = theme.title;
  subtitleEl.textContent = theme.subtitle;
  codeEl.textContent = [
    '> SCALE.RUN();',
    'STATE = [' + theme.sequence.join(', ') + '];',
    'RETURN MOTION' + (frame % 24 < 12 ? '_' : ' '),
  ].join('\\n');
  labelEl.textContent = '-- ' + scene.label + ' --';
  artEl.innerHTML = renderArt(scene, frame);
  captionEl.textContent = scene.caption;
  frameEl.style.setProperty('--phase-x', (frame % 74) + 'px');
  frameEl.style.setProperty('--phase-y', ((frame * 0.5) % 74) + 'px');
};
window.renderAsciiFrame(0, 0);
</script>
</body>
</html>`;
}

function drawFrame(scene, frame, frameCount, theme) {
  if (theme.sceneStyle === 'tunnel') return drawTunnelFrame(scene, frame, frameCount, theme);
  if (theme.sceneStyle === 'terrain') return drawTerrainFrame(scene, frame, frameCount, theme);
  if (theme.sceneStyle === 'kinetic-type') return drawKineticAsciiFrame(scene, frame, frameCount, theme);
  return drawScaleFrame(scene, frame, frameCount, theme);
}

function drawScaleFrame(scene, frame, frameCount, theme) {
  const colors = theme.colors;
  const p = frame / Math.max(1, frameCount - 1);
  scene.background();
  scene.box(1, 1, 22, 40, Math.floor(frame / 5) % 2);
  scene.text(2.0, 2.2, theme.title, colors.cream, 1.9);
  scene.mono(3.2, 5.6, [theme.subtitle], colors.amber, 0.72);
  drawCodeRail(scene, frame, theme);

  if (p < 0.36) {
    drawAtom(scene, frame, theme);
  } else if (p < 0.69) {
    drawBond(scene, frame, theme);
  } else {
    drawOrbit(scene, frame, theme);
  }

  const [sx, sy] = sparkPosition(p);
  scene.cell(sx - 2, sy, '.', colors.dot, 0.8);
  scene.cell(sx - 1, sy, 'O', colors.cream, 0.85);
  scene.cell(sx, sy, '*', colors.spark, 1);
  for (let i = 0; i < 18; i += 1) {
    const x = 4 + ((i * 7 + Math.floor(frame / 6)) % 16);
    const y = 14 + ((i * 5) % 18);
    scene.cell(x, y, '.', colors.dim, 0.5);
  }
  scene.panel(2.5, 35.0, 19.0, 3.0, colors.rail);
  scene.mono(3.45, 35.85, ['SAME LAWS. DIFFERENT SCALE.'], colors.cream, 0.72);
}

function drawTunnelFrame(scene, frame, frameCount, theme) {
  const colors = theme.colors;
  const p = frame / Math.max(1, frameCount - 1);
  scene.background();
  scene.text(2.0, 2.2, 'DEPTH RUN', colors.cream, 1.9);
  scene.mono(3.2, 5.6, ['CAMERA PUSH / GLYPH SPACE'], colors.amber, 0.66);
  scene.box(1, 1, 22, 40, Math.floor(frame / 4) % 2);

  const center = [12, 22];
  for (let layer = 0; layer < 8; layer += 1) {
    const depth = (layer / 8 + p) % 1;
    const rx = 1 + depth * 10;
    const ry = 1 + depth * 15;
    const glyph = depth > 0.72 ? '#' : depth > 0.42 ? '*' : '.';
    const color = depth > 0.72 ? colors.spark : depth > 0.42 ? colors.blue : colors.dim;
    const points = [
      [center[0], center[1] - ry],
      [center[0] + rx, center[1]],
      [center[0], center[1] + ry],
      [center[0] - rx, center[1]],
    ];
    for (let index = 0; index < points.length; index += 1) {
      scene.line(points[index], points[(index + 1) % points.length], glyph, color);
    }
  }

  for (let index = 0; index < 28; index += 1) {
    const angle = index * 2.399;
    const radius = 2 + (((index * 0.173 + p * 1.8) % 1) * 17);
    scene.cell(
      Math.round(center[0] + Math.cos(angle) * radius * 0.58),
      Math.round(center[1] + Math.sin(angle) * radius),
      index % 5 === 0 ? '*' : '.',
      index % 5 === 0 ? colors.amber : colors.dot,
      0.72,
    );
  }
  scene.panel(2.5, 35.0, 19.0, 3.0, colors.rail);
  scene.mono(3.35, 35.85, ['THE FRAME MOVES THROUGH DATA.'], colors.cream, 0.66);
}

function drawTerrainFrame(scene, frame, frameCount, theme) {
  const colors = theme.colors;
  const p = frame / Math.max(1, frameCount - 1);
  scene.background();
  scene.text(2.0, 2.2, 'FIELD MAP', colors.cream, 1.9);
  scene.mono(3.2, 5.6, ['LATERAL SCAN / TOPOGRAPHY'], colors.amber, 0.66);
  scene.box(1, 1, 22, 40, Math.floor(frame / 6) % 2);

  for (let row = 0; row < 18; row += 1) {
    const yBase = 13 + row * 1.13;
    const depth = row / 17;
    for (let column = 0; column < 20; column += 1) {
      const wave = Math.sin(column * 0.72 + row * 0.43 + p * Math.PI * 4) * (1.8 - depth * 0.9);
      const ridge = Math.cos(column * 0.31 - p * Math.PI * 2) * 0.65;
      const color = wave + ridge > 1.2 ? colors.spark : depth > 0.58 ? colors.green : colors.blue;
      scene.cell(2 + column, yBase + wave + ridge, wave > 0.6 ? '*' : '.', color, 0.64 + depth * 0.18);
    }
  }

  const scanX = 2 + Math.round(p * 19);
  scene.line([scanX, 12], [scanX, 34], '|', colors.red);
  scene.mono(3.1, 10.2, [`SCAN X=${String(scanX).padStart(2, '0')}`], colors.dot, 0.58);
  scene.panel(2.5, 35.0, 19.0, 3.0, colors.rail);
  scene.mono(3.25, 35.85, ['A LANDSCAPE MADE OF SIGNAL.'], colors.cream, 0.68);
}

function drawKineticAsciiFrame(scene, frame, frameCount, theme) {
  const colors = theme.colors;
  const p = frame / Math.max(1, frameCount - 1);
  scene.background();
  scene.box(1, 1, 22, 40, Math.floor(frame / 3) % 2);
  const phase = Math.min(2, Math.floor(p * 3));
  const words = ['MOVE', 'THROUGH', 'SIGNAL'];
  const offsets = [
    -8 + p * 18,
    18 - p * 14,
    -5 + p * 11,
  ];
  scene.text(offsets[0], 8.5, words[0], colors.red, 2.5);
  scene.text(offsets[1], 18.0, words[1], colors.cream, 1.55);
  scene.text(offsets[2], 27.5, words[2], colors.blue, 2.0);
  for (let index = 0; index < 24; index += 1) {
    const x = 2 + ((index * 5 + Math.floor(frame / 2)) % 20);
    const y = 6 + ((index * 7 + phase * 3) % 28);
    scene.cell(x, y, index % 4 === 0 ? '*' : '.', index % 4 === 0 ? colors.spark : colors.dim, 0.62);
  }
  scene.panel(2.5, 35.0, 19.0, 3.0, colors.rail);
  scene.mono(3.2, 35.85, ['TYPE HAS VELOCITY AND WEIGHT.'], colors.cream, 0.66);
}

function drawAtom(scene, frame, theme) {
  const colors = theme.colors;
  const flicker = frame % 18 < 12 ? '*' : 'O';
  scene.mono(8.4, 10.0, ['-- ATOM --'], colors.amber, 0.78);
  scene.mono(3.4, 14.0, [
    '        .       .',
    '    .     \\   /     .',
    ' .         \\ /         .',
    '      -----(@)-----',
    ' .         / \\         .',
    '    .     /   \\     .',
    '        .       .',
  ], (ch) => asciiColor(ch, { core: colors.red, wire: colors.blue }), 0.72);
  scene.cell(10, 20, flicker, colors.spark, 0.9);
  scene.cell(15, 20, flicker, colors.spark, 0.9);
  scene.mono(3.8, 31.0, [theme.atomCaption], colors.cream, 0.68);
}

function drawBond(scene, frame, theme) {
  const colors = theme.colors;
  const phase = Math.round(Math.sin(frame * 0.12));
  scene.mono(8.6, 10.0, ['-- BOND --'], colors.amber, 0.78);
  scene.mono(4.3, 14.0 + phase * 0.15, [
    '          (O)',
    '           |',
    '    (O)---+---(O)',
    '       \\  |  /',
    '        \\ | /',
    '          O',
    '          |',
    '         (O)',
  ], (ch) => asciiColor(ch, { core: colors.green, wire: colors.blue }), 0.72);
  scene.cell(18, 21 + phase, '*', colors.spark, 0.9);
  scene.mono(3.85, 31.0, [theme.bondCaption], colors.cream, 0.68);
}

function drawOrbit(scene, frame, theme) {
  const colors = theme.colors;
  const pos = orbitStar(frame);
  scene.mono(8.0, 10.0, ['-- ORBIT --'], colors.amber, 0.78);
  scene.mono(3.3, 14.0, [
    '      .-----------.',
    '   .-/             \\-.',
    '  /       ( O )       \\',
    '  \\                   /',
    '   `-.             .-`',
    '      `----...----`',
  ], (ch) => asciiColor(ch, { core: colors.blue, wire: colors.dot }), 0.72);
  scene.cell(pos[0], pos[1], '*', colors.spark, 0.95);
  scene.mono(4.0, 31.0, [theme.orbitCaption], colors.cream, 0.68);
}

function drawCodeRail(scene, frame, theme) {
  const colors = theme.colors;
  scene.panel(3.0, 7.5, 18.0, 4.5, colors.rail);
  const cursor = frame % 24 < 12 ? '_' : ' ';
  scene.mono(4.0, 8.15, [
    '> SCALE.RUN();',
    `STATE = [${theme.sequence.join(', ')}];`,
    `RETURN MOTION${cursor}`,
  ], (ch) => {
    if ('>[]();=,'.includes(ch)) return colors.dim;
    if (ch === '_') return colors.spark;
    return colors.dot;
  }, 0.56);
}

class AsciiScene {
  constructor(pixels, width, height, colors = COLORS) {
    this.pixels = pixels;
    this.width = width;
    this.height = height;
    this.colors = colors;
    this.cellW = width / COLS;
    this.cellH = height / ROWS;
  }

  background() {
    for (let y = 0; y < this.height; y += 1) {
      const shade = Math.floor((18 * y) / this.height);
      const base = this.colors.bg;
      fillRect(this.pixels, this.width, 0, y, this.width, 1, base.map((channel) => Math.min(255, channel + Math.floor(shade / 4))));
    }
    fillRect(this.pixels, this.width, 34, 44, this.width - 68, this.height - 88, this.colors.panel, false);
  }

  panel(x, y, w, h, color) {
    fillRect(
      this.pixels,
      this.width,
      Math.round(x * this.cellW),
      Math.round(y * this.cellH),
      Math.round(w * this.cellW),
      Math.round(h * this.cellH),
      color,
    );
  }

  box(x0, y0, x1, y1, phase) {
    for (let x = x0; x <= x1; x += 1) {
      if ((x + phase) % 2 === 0) {
        this.cell(x, y0, '.', this.colors.dot, 0.7);
        this.cell(x, y1, '.', this.colors.dot, 0.7);
      }
    }
    for (let y = y0; y <= y1; y += 1) {
      if ((y + phase) % 2 === 0) {
        this.cell(x0, y, '.', this.colors.dot, 0.7);
        this.cell(x1, y, '.', this.colors.dot, 0.7);
      }
    }
  }

  text(x, y, value, color, scale = 1) {
    const chars = sanitizeText(value);
    let cursor = x;
    for (const ch of chars) {
      this.char(cursor, y, ch, color, scale);
      cursor += Math.max(0.72, scale * 0.74);
    }
  }

  mono(x, y, lines, color, scale = 0.65) {
    lines.forEach((line, row) => {
      const chars = sanitizeText(line);
      for (let col = 0; col < chars.length; col += 1) {
        const ch = chars[col];
        const chosen = typeof color === 'function' ? color(ch, col, row) : color;
        this.char(x + col * 0.58, y + row * 0.92, ch, chosen, scale);
      }
    });
  }

  cell(x, y, ch, color, scale = 1) {
    this.char(x, y, ch, color, scale);
  }

  line(a, b, ch, color) {
    const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      this.cell(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), ch, color, 0.65);
    }
  }

  char(cellX, cellY, ch, color, scale) {
    const glyph = FONT[ch] ?? FONT[' '];
    const px = Math.round(cellX * this.cellW + 7);
    const py = Math.round(cellY * this.cellH + 3);
    const dot = Math.max(3, Math.round(5 * scale));
    const gap = Math.max(1, Math.round(2 * scale));
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] === '1') {
          fillRect(this.pixels, this.width, px + col * (dot + gap), py + row * (dot + gap), dot, dot, color);
        }
      }
    }
  }
}

export function buildAsciiTheme(brief) {
  const words = tokenize(`${brief.title} ${brief.hook} ${brief.body}`);
  const science = words.some((word) => ['atom', 'molecule', 'orbit', 'space', 'scale', 'science'].includes(word));
  const palette = ASCII_PALETTES[brief.renderOptions?.palette] ?? ASCII_PALETTES.amber;
  return {
    sceneStyle: ['scale', 'tunnel', 'terrain', 'kinetic-type'].includes(brief.renderOptions?.sceneStyle)
      ? brief.renderOptions.sceneStyle
      : 'scale',
    title: science ? 'ASCII SCALE' : 'ASCII SIGNAL',
    subtitle: science ? 'TINY RULES / HUGE WORLDS' : 'SMALL SIGNAL / BIG STORY',
    sequence: science ? ['ATOM', 'BOND', 'ORBIT'] : ['SIGNAL', 'LINK', 'STORY'],
    atomCaption: science ? 'MASS APPEARS AS PATTERN' : 'SIGNAL APPEARS AS PATTERN',
    bondCaption: science ? 'PATTERNS START TO BIND' : 'PATTERNS START TO LINK',
    orbitCaption: science ? 'SCALE BECOMES MOTION' : 'THE STORY STARTS MOVING',
    palette: { id: brief.renderOptions?.palette in ASCII_PALETTES ? brief.renderOptions.palette : 'amber', ...palette },
    colors: Object.fromEntries(Object.entries(palette).map(([key, value]) => [key === 'ink' ? 'rail' : key, hexToRgb(value)])),
  };
}

function hexToRgb(value) {
  const match = String(value).match(/^#([0-9a-f]{6})$/i);
  if (!match) return [0, 0, 0];
  return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16));
}

function sparkPosition(progress) {
  const pathPoints = [[5, 25], [19, 25], [12, 33]];
  if (progress < 0.55) {
    const t = ease(progress / 0.55);
    return [
      Math.round(pathPoints[0][0] + (pathPoints[1][0] - pathPoints[0][0]) * t),
      Math.round(pathPoints[0][1] + (pathPoints[1][1] - pathPoints[0][1]) * t),
    ];
  }
  const t = ease((progress - 0.55) / 0.45);
  return [
    Math.round(pathPoints[1][0] + (pathPoints[2][0] - pathPoints[1][0]) * t),
    Math.round(pathPoints[1][1] + (pathPoints[2][1] - pathPoints[1][1]) * t),
  ];
}

function orbitStar(frame) {
  const points = [
    [6, 16],
    [15, 15],
    [20, 18],
    [19, 23],
    [10, 24],
    [5, 21],
  ];
  const index = Math.floor((frame / 144) * points.length * 2) % points.length;
  return points[index];
}

function asciiColor(ch, palette) {
  if (ch === '@') return palette.core ?? COLORS.red;
  if (ch === 'O') return palette.core ?? COLORS.cream;
  if ('/\\-|+.`'.includes(ch)) return palette.wire ?? COLORS.blue;
  if (ch === '.') return COLORS.dim;
  if (ch === '*') return COLORS.spark;
  return COLORS.cream;
}

function makeCanvas(width, height) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = COLORS.bg[0];
    pixels[i + 1] = COLORS.bg[1];
    pixels[i + 2] = COLORS.bg[2];
  }
  return pixels;
}

function fillRect(pixels, width, x, y, w, h, color, filled = true) {
  if (!filled) {
    fillRect(pixels, width, x, y, w, 8, color);
    fillRect(pixels, width, x, y + h - 8, w, 8, color);
    fillRect(pixels, width, x, y, 8, h, color);
    fillRect(pixels, width, x + w - 8, y, 8, h, color);
    return;
  }
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(width, Math.ceil(x + w));
  const y1 = Math.min(pixels.length / 3 / width, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) {
      const i = (yy * width + xx) * 3;
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
    }
  }
}

function ppmBuffer(width, height, pixels) {
  return Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), pixels]);
}

async function defaultCommandRunner(command, args, options = {}) {
  const { stdout, stderr } = await execFileAsync(command, args, { maxBuffer: 1024 * 1024 * 16, ...options });
  return { stdout: String(stdout), stderr: String(stderr) };
}

function asciiAudioFilter(durationSeconds) {
  const duration = Math.max(1, Number(durationSeconds) || DEFAULT_DURATION);
  return `sine=frequency=196:duration=${duration}[s0];sine=frequency=392:duration=${duration}[s1];sine=frequency=784:duration=${duration}[s2];[s0][s1][s2]amix=inputs=3:duration=first,volume=0.04`;
}

function clampDuration(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_DURATION;
  return Math.max(5, Math.min(12, number));
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function stableSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'video';
}

function sanitizeText(value) {
  return String(value).toUpperCase().replace(/[^A-Z0-9 ./\\:_+\-=;,"'*()@[\]{}|<>`]/g, ' ');
}

function tokenize(value) {
  return String(value).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function ease(x) {
  const clamped = Math.max(0, Math.min(1, x));
  return clamped * clamped * (3 - 2 * clamped);
}
