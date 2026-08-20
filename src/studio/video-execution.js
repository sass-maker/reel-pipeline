import path from 'node:path';

import { openExploreGalleryMediaByVariant } from './explore-gallery.js';
import { VIDEO_EXECUTION_SCHEMA, getExecutionAdapter, missingExecutionInputs } from './execution-registry.js';
import { normalizeRecipeOptions } from './production-catalog.js';

const MODES = new Set(['fixture', 'real']);

export async function executeVideoVariant(brief, options = {}) {
  if (!brief?.id || !brief.recipeId) throw new Error('saved video brief with recipeId is required');
  const mode = options.mode ?? 'real';
  if (!MODES.has(mode)) throw new Error('video execution mode must be fixture or real');
  const normalized = normalizeRecipeOptions(brief.recipeId, brief.recipeOptions ?? {});
  const adapter = getExecutionAdapter(brief.recipeId);

  if (mode === 'fixture') {
    const media = await openExploreGalleryMediaByVariant(normalized.variantId, options.galleryOptions);
    if (!media) throw new Error(`fixture preview is unavailable for ${normalized.variantId}`);
    return completedEnvelope({
      brief, normalized, adapter, mode, media,
      ownerManifestPath: media.evidencePath,
      provenance: {
        posture: 'fixture', renderer: media.renderer,
        source: 'repository-owned rights-safe fixture', sha256: media.sha256,
      },
    });
  }

  const realInputs = options.inputs ?? {};
  const missing = missingExecutionInputs(brief.recipeId, realInputs);
  if (missing.length) throw new Error(`Add ${missing.join(', ')} before real execution.`);
  const executor = options.realExecutors?.[brief.recipeId];
  if (typeof executor !== 'function') {
    const selected = brief.modelProfileId && brief.modelProfileId !== 'auto'
      ? `${brief.modelProfileId} is selected, but`
      : `${brief.recipeId} is selected, but`;
    throw new Error(`${selected} no registered ${adapter.id} executor can run this request locally.`);
  }
  const result = await executor({ brief, variant: normalized, inputs: realInputs, adapter });
  if (!result?.videoPath) throw new Error(`${adapter.id} returned no playable video`);
  return completedEnvelope({
    brief, normalized, adapter, mode,
    media: {
      path: path.resolve(result.videoPath), size: result.bytes ?? null,
      sha256: result.sha256 ?? null, renderer: result.renderer ?? adapter.id,
      evidencePath: result.ownerManifestPath ?? null,
    },
    ownerManifestPath: result.ownerManifestPath ?? null,
    provenance: result.provenance ?? { posture: 'real', renderer: result.renderer ?? adapter.id },
    quality: result.quality,
  });
}

function completedEnvelope({ brief, normalized, adapter, mode, media, ownerManifestPath, provenance, quality }) {
  return {
    schema: VIDEO_EXECUTION_SCHEMA,
    status: 'completed',
    mode,
    briefId: brief.id,
    recipeId: brief.recipeId,
    variantId: normalized.variantId,
    adapter: adapter.id,
    owner: adapter.owner,
    modelProfileId: brief.modelProfileId ?? null,
    artifact: {
      videoPath: media.path,
      bytes: media.size ?? null,
      sha256: media.sha256 ?? null,
      contentType: 'video/mp4',
    },
    provenance,
    quality: quality ?? { verdict: 'pass', basis: mode === 'fixture' ? 'validated gallery fixture' : 'owner runtime evidence' },
    evidence: { ownerManifestPath: ownerManifestPath ?? null },
    blockers: [],
  };
}
