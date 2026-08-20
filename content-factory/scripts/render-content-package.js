#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { normalizeContentPackage } from '../../reel-pipeline/src/content-package.js';
import { renderBrandContentPackage } from '../../reel-pipeline/src/adapters/brand-video.js';
import { emitArtifactManifest, hashCanonicalJson } from '../src/manifest.js';

const flags = parseFlags(process.argv.slice(2));
if (!flags.file) throw new Error('--file is required');
const input = JSON.parse(await readFile(path.resolve(flags.file), 'utf8'));
const contentPackage = normalizeContentPackage(input);
const result = await renderBrandContentPackage(input, {
  variantId: flags.variant,
  artifactDir: flags.out ? path.resolve(flags.out) : undefined,
  voice: flags.voice,
});
const variant = contentPackage.variants.find(
  (entry) => entry.id === (flags.variant ?? contentPackage.variants[0].id)
);
const channelIntent = ['instagram_reels', 'youtube_shorts'].includes(variant.channel)
  ? [variant.channel]
  : ['instagram_reels', 'youtube_shorts'];
const { manifest, manifestPath } = await emitArtifactManifest({
  context: {
    brief: { id: contentPackage.id, version: contentPackage.revision },
    projectId: contentPackage.brand.slug,
    campaignId: `content-package:${contentPackage.id}`,
    experimentId: null,
    inputHash: hashCanonicalJson(contentPackage),
    channelIntent,
    provenance: [
      {
        kind: contentPackage.source.adapter,
        id: contentPackage.source.sourceId,
        revision: String(contentPackage.revision),
      },
    ],
  },
  render: {
    provider: result.receipt.provider,
    externalTaskId: `${contentPackage.id}-r${contentPackage.revision}-${variant.id}`,
    status: 'completed',
    videos: [result.outputPath],
  },
  variantId: variant.id,
});
console.log(
  JSON.stringify(
    {
      outputPath: result.outputPath,
      reviewPath: result.reviewPath,
      receipt: result.receipt,
      artifactManifest: manifest,
      artifactManifestPath: manifestPath,
    },
    null,
    2
  )
);

function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) flags[key] = true;
    else {
      flags[key] = next;
      index += 1;
    }
  }
  return flags;
}
