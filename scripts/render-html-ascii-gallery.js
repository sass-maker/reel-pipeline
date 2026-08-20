#!/usr/bin/env node

import { AsciiAnimationAdapter } from '../src/adapters/ascii-animation.js';
import { HtmlCompositionAdapter } from '../src/adapters/html-composition.js';
import { normalizeVideoBrief } from '../src/video-brief.js';

const htmlStyles = [
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
];
const asciiPalettes = ['amber', 'mono', 'terminal', 'cobalt', 'magenta', 'paper'];
const now = () => new Date('2026-08-01T00:00:00.000Z');
const body = [
  'Script: reveal the idea, show one visible proof, then land the conclusion.',
  'Shot list: opening statement, proof detail, payoff.',
  'Captions: "see the difference" and "choose the visual language".',
  'Asset prompts: graphic vertical composition with clear editorial hierarchy.',
].join('\n');

const html = new HtmlCompositionAdapter({
  artifactDir: './artifacts/capability-showcase/html-variety',
  now,
});
const ascii = new AsciiAnimationAdapter({
  artifactDir: './artifacts/capability-showcase/ascii-variety',
  renderer: 'raster',
  now,
});

for (const visualStyle of htmlStyles) {
  const brief = normalizeVideoBrief({
    id: `gallery-html-${visualStyle}`,
    projectSlug: 'gallery',
    channel: 'instagram_reels',
    title: visualStyle.replaceAll('-', ' '),
    hook: 'The same idea can carry a completely different visual rhythm.',
    body,
    renderMode: 'html-composition',
    durationSeconds: 6,
    renderOptions: { visualStyle },
  });
  const render = await html.createVideo(brief);
  process.stdout.write(`${visualStyle}: ${render.videos[0]}\n`);
}

for (const palette of asciiPalettes) {
  const brief = normalizeVideoBrief({
    id: `gallery-ascii-${palette}`,
    projectSlug: 'gallery',
    channel: 'instagram_reels',
    title: `${palette} terminal`,
    hook: 'A terminal story can shift tone without losing its authored motion.',
    body,
    renderMode: 'ascii-animation',
    durationSeconds: 6,
    renderOptions: { palette },
  });
  const render = await ascii.createVideo(brief);
  process.stdout.write(`${palette}: ${render.videos[0]}\n`);
}
