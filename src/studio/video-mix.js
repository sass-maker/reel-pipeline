import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createFfmpegRunner } from '../composer/ffmpeg.js';
import { openExploreGalleryMediaByVariant } from './explore-gallery.js';
import { listRecipeVariants } from './production-catalog.js';
import { VIDEO_EXECUTION_SCHEMA } from './execution-registry.js';

export const VIDEO_MIX_SCHEMA = 'fleet.marketing-video-mix.v1';

export async function executeVideoMix(brief, options = {}) {
  if (!brief?.id) throw new Error('saved video brief is required');
  const variantIds = validateMixVariantIds(options.variantIds);
  const components = [];
  for (const variantId of variantIds) {
    const media = await openExploreGalleryMediaByVariant(variantId, options.galleryOptions);
    if (!media) throw new Error(`mix preview is unavailable for ${variantId}`);
    components.push({ variantId, ...media });
  }

  const fingerprint = createHash('sha256')
    .update(components.map((component) => `${component.variantId}:${component.sha256}`).join('|'))
    .digest('hex');
  const outputDir = path.resolve(options.outputDir ?? 'tmp/studio/mixes');
  const videoPath = path.join(outputDir, `${fingerprint.slice(0, 20)}.mp4`);
  const receiptPath = path.join(outputDir, `${fingerprint.slice(0, 20)}.json`);
  await mkdir(outputDir, { recursive: true });

  const existing = await stat(videoPath).catch(() => null);
  if (!existing?.isFile() || existing.size < 1) {
    const runner = options.commandRunner
      ? { runFfmpeg: (args) => options.commandRunner(options.ffmpegPath ?? 'ffmpeg', args) }
      : createFfmpegRunner({ ffmpegPath: options.ffmpegPath, ffprobePath: options.ffprobePath });
    const filters = [];
    let current = '0:v';
    for (let index = 1; index < components.length; index += 1) {
      const output = `mix${index}`;
      filters.push(`[${current}][${index}:v]blend=all_mode=screen:all_opacity=${index === 1 ? '0.32' : '0.2'}[${output}]`);
      current = output;
    }
    const args = ['-y'];
    for (const component of components) args.push('-i', component.path);
    args.push(
      '-filter_complex', filters.join(';'),
      '-map', `[${current}]`, '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24',
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-shortest',
      videoPath,
    );
    await runner.runFfmpeg(args);
  }

  const bytes = (await stat(videoPath)).size;
  const sha256 = createHash('sha256').update(await readFile(videoPath)).digest('hex');
  const receipt = {
    schema: VIDEO_MIX_SCHEMA,
    mixId: fingerprint,
    posture: 'mix',
    renderer: 'ffmpeg-blend-mix@1',
    components: components.map((component, index) => ({
      variantId: component.variantId,
      role: index === 0 ? 'base' : 'influence',
      sha256: component.sha256,
      renderer: component.renderer,
    })),
    artifact: { videoPath, bytes, sha256 },
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  return {
    schema: VIDEO_EXECUTION_SCHEMA,
    status: 'completed',
    mode: 'fixture',
    posture: 'mix',
    briefId: brief.id,
    recipeId: brief.recipeId,
    variantId: variantIds[0],
    componentVariantIds: variantIds,
    adapter: 'ffmpeg-blend-mix',
    owner: 'Marketing Studio',
    artifact: { videoPath, bytes, sha256, contentType: 'video/mp4' },
    provenance: {
      posture: 'mix',
      renderer: receipt.renderer,
      components: receipt.components,
    },
    quality: { verdict: 'pass', basis: 'validated rights-safe component fixtures' },
    evidence: { ownerManifestPath: receiptPath },
    blockers: [],
  };
}

export function validateMixVariantIds(input, options = {}) {
  if (!Array.isArray(input) || input.length < 2 || input.length > 3) {
    throw new Error('style mix requires two or three variant ids');
  }
  const variantIds = input.map((value) => String(value ?? '').trim());
  if (variantIds.some((value) => !value)) throw new Error('style mix contains an empty variant id');
  if (new Set(variantIds).size !== variantIds.length) throw new Error('style mix cannot contain duplicate variants');
  const known = new Set((options.variants ?? listRecipeVariants()).map((variant) => variant.id));
  const unknown = variantIds.find((variantId) => !known.has(variantId));
  if (unknown) throw new Error(`style mix contains unknown variant ${unknown}`);
  return variantIds;
}
