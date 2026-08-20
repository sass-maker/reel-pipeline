import { listRecipeVariants } from './production-catalog.js';

export const VIDEO_EXECUTION_SCHEMA = 'fleet.marketing-video-execution.v1';

const TEXT = 'text';
const TEXTAREA = 'textarea';

const ADAPTERS = {
  'image-slideshow': adapter('studio-html', 'Marketing Studio'),
  'web-motion': adapter('studio-html', 'Marketing Studio'),
  'ascii-story': adapter('studio-ascii', 'Marketing Studio'),
  'night-out-carousel': adapter('studio-night-out', 'Marketing Studio', [
    field('assetManifestPath', 'Approved image manifest path', TEXT, 'Optional fleet.night-out-assets.v1 JSON beneath an approved local artifact root.', false),
    field('rightsEvidence', 'Source rights evidence', TEXTAREA, 'Required for provided assets; generated named-IP concepts remain private until commercial rights evidence is supplied.', false),
  ]),
  'product-proof': adapter('brand-reel', 'Brand Reel', [
    field('canonicalUrl', 'Product URL', TEXT, 'Public HTTPS page used as product evidence.'),
  ]),
  'local-voice-film': adapter('studio-kokoro', 'Marketing Studio'),
  'grok-asset-film': adapter('studio-grok-import', 'Marketing Studio', [
    field('approvedAssetPath', 'Approved local MP4 path', TEXT, 'Absolute path beneath an approved artifact root.'),
  ]),
  'blender-film': adapter('studio-blender', 'Marketing Studio'),
  'threejs-scene': adapter('forge-threejs', 'Forge'),
  'guided-app-demo': adapter('forge-guided-demo', 'Forge', [
    field('canonicalUrl', 'Application URL', TEXT, 'Public HTTPS application being demonstrated.'),
    field('capturePath', 'Approved capture path', TEXT, 'Local screen recording beneath an approved artifact root.'),
    field('rightsEvidence', 'Capture rights evidence', TEXTAREA, 'Operator-supplied evidence for the capture and presenter.'),
  ]),
  'coherent-local-film': adapter('studio-local-video', 'Marketing Studio', [
    field('prompt', 'Shot prompt', TEXTAREA, 'What happens, how the subject moves, and how the camera moves.'),
    field('referenceImage', 'Character reference image', TEXT, 'Approved local image path used to preserve the subject across the shot.'),
    field('workflowRecipeId', 'Workflow recipe', TEXT, 'Optional exact vetted recipe id; the selected model chooses the lane when omitted.', false),
    field('qualityLane', 'Quality lane', TEXT, 'preview uses LTX 2B; final uses LTX 2.3.', false),
    field('seed', 'Seed', TEXT, 'Optional fixed integer seed.', false),
    field('aspectRatio', 'Aspect ratio', TEXT, '9:16 or 16:9 for LTX 2.3.', false),
    field('durationSeconds', 'Shot duration', TEXT, 'One to eight seconds.', false),
    field('quality', 'Final quality', TEXT, 'final or hero for LTX 2.3.', false),
    field('width', 'Preview width', TEXT, 'Optional LTX 2B width in multiples of 32.', false),
    field('height', 'Preview height', TEXT, 'Optional LTX 2B height in multiples of 32.', false),
    field('frames', 'Preview frames', TEXT, 'Optional LTX 2B frame count.', false),
    field('motionStrength', 'Motion strength', TEXT, 'Optional LTX 2B reference strength from 0.1 to 0.6.', false),
  ]),
  'podcast-short': adapter('external-mashup-media', 'External source', [
    field('receiptPath', 'Mashup media receipt', TEXT, 'fleet.mashup-media-receipt.v1 JSON beside a completed local artifact.'),
    field('rightsEvidence', 'Source rights evidence', TEXTAREA, 'Evidence covering the supplied finished recording and excerpt.'),
  ]),
  'literal-lyric-video': adapter('studio-lyric', 'Marketing Studio', [
    field('audioPath', 'Cleared local audio path', TEXT, 'Local recording beneath an approved artifact root.'),
    field('timedLyrics', 'Timed lyrics', TEXTAREA, 'Operator-supplied LRC, SRT, or structured timed cues.'),
    field('attribution', 'Attribution', TEXT, 'Composition, recording, and performer attribution.'),
    field('compositionRightsEvidence', 'Composition and lyrics rights', TEXTAREA, 'Owned or licensed evidence; attribution alone is insufficient.'),
    field('masterRightsEvidence', 'Master recording rights', TEXTAREA, 'Owned or licensed evidence for this recording.'),
  ]),
};

export function listExecutionAdapters() {
  return Object.entries(ADAPTERS).map(([recipeId, definition]) => ({ recipeId, ...structuredClone(definition) }));
}

export function getExecutionAdapter(recipeId) {
  const definition = ADAPTERS[recipeId];
  if (!definition) throw new Error(`no video execution adapter registered for ${recipeId}`);
  return { recipeId, ...structuredClone(definition) };
}

export function describeVariantExecution(variant) {
  const adapterDefinition = getExecutionAdapter(variant.recipeId);
  const requiredInputs = adapterDefinition.inputs.filter((input) => input.required);
  const realReady = variant.executionReady === true && requiredInputs.length === 0;
  return {
    ...variant,
    execution: {
      schema: VIDEO_EXECUTION_SCHEMA,
      adapter: adapterDefinition.id,
      owner: adapterDefinition.owner,
      fixture: { ready: true, label: 'Make fixture demo', blocker: null },
      real: {
        ready: realReady,
        label: 'Make real video',
        blocker: realReady
          ? null
          : requiredInputs.length
            ? `Add ${requiredInputs.map((input) => input.label).join(', ')} before real execution.`
            : variant.readiness.blocker ?? `${variant.runtime} requires real production inputs.`,
      },
      inputs: adapterDefinition.inputs,
      ownerReviewHref: variant.action?.href ?? null,
    },
  };
}

export function validateExecutionRegistry(options = {}) {
  const variants = options.variants ?? listRecipeVariants();
  const recipeIds = new Set(variants.map((variant) => variant.recipeId));
  const adapterIds = new Set(Object.keys(ADAPTERS));
  const missingAdapters = [...recipeIds].filter((id) => !adapterIds.has(id));
  const staleAdapters = [...adapterIds].filter((id) => !recipeIds.has(id));
  if (missingAdapters.length) throw new Error(`missing video execution adapters: ${missingAdapters.join(', ')}`);
  if (staleAdapters.length) throw new Error(`stale video execution adapters: ${staleAdapters.join(', ')}`);
  for (const [recipeId, definition] of Object.entries(ADAPTERS)) {
    const ids = new Set();
    for (const input of definition.inputs) {
      if (ids.has(input.id)) throw new Error(`${recipeId}: duplicate execution input ${input.id}`);
      ids.add(input.id);
    }
  }
  return { recipes: recipeIds.size, variants: variants.length, adapters: adapterIds.size };
}

export function missingExecutionInputs(recipeId, input = {}) {
  const missing = getExecutionAdapter(recipeId).inputs
    .filter((definition) => definition.required && !String(input[definition.id] ?? '').trim())
    .map((definition) => definition.label);
  if (recipeId === 'night-out-carousel' && String(input.assetManifestPath ?? '').trim() && !String(input.rightsEvidence ?? '').trim()) {
    missing.push('Source rights evidence');
  }
  return missing;
}

function adapter(id, owner, inputs = []) {
  return { id, owner, inputs };
}

function field(id, label, type, help, required = true) {
  return { id, label, type, help, required };
}
