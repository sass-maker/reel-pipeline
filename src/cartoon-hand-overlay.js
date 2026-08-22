import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  HAND_POSES,
  normalizeHandStyle,
  renderCartoonHandFrameSvg,
  verifyHandStylePoseDigests,
} from './cartoon-hand-pointer.js';

const execFileAsync = promisify(execFile);

// macOS ImageIO rasterizer. It is already the repository's SVG-to-PNG path for
// the gallery fixtures, keeps alpha, and costs nothing.
export const DEFAULT_SVG_RASTERIZER = '/usr/bin/sips';

export function handStylePath(styleRef) {
  const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)@([1-9]\d*)$/.exec(String(styleRef));
  if (!match) throw new Error(`hand style reference must look like fleet-mitt@1, received ${styleRef}`);
  return `assets/cartoon-hand/${match[1]}-v${match[2]}.json`;
}

// Loads a hand style with its pose assets and verifies every checksum before
// the style can reach a render.
export async function loadHandStyle(styleRef, options = {}) {
  const root = options.root ?? process.cwd();
  const manifestPath = path.join(root, handStylePath(styleRef));
  const style = normalizeHandStyle(JSON.parse(await readFile(manifestPath, 'utf8')));
  if (style.ref !== styleRef) {
    throw new Error(`hand style manifest ${manifestPath} declares ${style.ref}, expected ${styleRef}`);
  }
  const poseSources = {};
  for (const pose of HAND_POSES) {
    poseSources[pose] = await readFile(path.join(root, style.poses[pose].path), 'utf8');
  }
  const checksumFailures = verifyHandStylePoseDigests(style, poseSources);
  if (checksumFailures.length) {
    throw new Error(`hand style ${styleRef} failed checksum verification: ${checksumFailures.join('; ')}`);
  }
  return { style, poseSources, manifestPath, checksumFailures };
}

// Rasterizes one transparent overlay plate per planned frame. The frame files
// are the exact bytes the compositor consumes, so review measurements taken on
// them describe the encoded output.
export async function rasterizeCartoonHandOverlay(input) {
  const plan = input.plan;
  if (plan?.treatment !== 'cartoon-hand') {
    throw new Error('only a cartoon-hand plan produces overlay plates');
  }
  const dir = path.resolve(requiredString(input.dir, 'dir'));
  const rasterizer = input.rasterizer ?? DEFAULT_SVG_RASTERIZER;
  const scale = Number(input.scale ?? 1);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('overlay scale must be positive');
  const run = input.run ?? ((command, args) => execFileAsync(command, args));
  await mkdir(dir, { recursive: true });
  let drawn = 0;
  for (const frame of plan.frames) {
    const svg = renderCartoonHandFrameSvg(plan, frame, input.poseSources, { scale });
    const name = `overlay-${String(frame.index).padStart(5, '0')}`;
    const svgPath = path.join(dir, `${name}.svg`);
    const pngPath = path.join(dir, `${name}.png`);
    await writeFile(svgPath, svg);
    await run(rasterizer, ['-s', 'format', 'png', svgPath, '--out', pngPath]);
    if (frame.visible) drawn += 1;
  }
  return {
    dir,
    framePattern: path.join(dir, 'overlay-%05d.png'),
    fps: plan.composition.fps,
    frames: plan.frames.length,
    drawn,
    rasterizer,
    scale,
    width: Math.round(plan.composition.width * scale),
    height: Math.round(plan.composition.height * scale),
  };
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value.trim();
}
