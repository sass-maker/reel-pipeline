#!/usr/bin/env node

import { BlenderAdapter } from '../src/adapters/blender.js';

const styles = [
  ['cosmic-shrine', 'A signal becomes a celestial shrine.', ['star', 'diamond']],
  ['brutalist-monument', 'Proof rises as a brutalist monument.', ['subject']],
  ['glass-studio', 'The idea is suspended inside a glass studio.', ['diamond']],
  ['low-poly-valley', 'A path opens through a low-poly valley.', ['road', 'traveller']],
  ['organic-bloom', 'A small signal grows into an organic bloom.', ['subject']],
  ['kinetic-sculpture', 'Momentum becomes a kinetic sculpture.', ['subject']],
  ['neon-tunnel', 'The story accelerates through a neon tunnel.', ['light']],
  ['paper-diorama', 'The final thought unfolds as a paper diorama.', ['world']],
];

const adapter = new BlenderAdapter({
  artifactDir: './artifacts/capability-showcase/blender-variety',
  blenderPath: '/Applications/Blender.app/Contents/MacOS/Blender',
  now: () => new Date('2026-08-01T00:00:00.000Z'),
  timeoutMs: 10 * 60_000,
});

const results = [];
for (const [visualStyle, lyric, objects] of styles) {
  const id = `blender-gallery-${visualStyle}`;
  const render = await adapter.renderScenes({
    id,
    width: 540,
    height: 960,
    samples: 8,
    durationSeconds: 6,
    scenes: [{ id: visualStyle, lyric, objects, visualStyle }],
  });
  results.push({ visualStyle, video: render.videos[0], plate: render.artifacts[0] });
  process.stdout.write(`${visualStyle}: ${render.videos[0]}\n`);
}

process.stdout.write(`${JSON.stringify({ rendered: results.length, results }, null, 2)}\n`);
