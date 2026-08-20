import galleryConfig from '../../config/explore-gallery.json' with { type: 'json' };

import { validateExecutionRegistry } from './execution-registry.js';
import { validateExploreGallery } from './explore-gallery.js';
import { listRecipeVariants, normalizeRecipeOptions } from './production-catalog.js';

export function validateVideoArsenalCompleteness(options = {}) {
  const variants = options.variants ?? listRecipeVariants();
  const ids = new Set();
  for (const variant of variants) {
    if (!variant || typeof variant.id !== 'string' || !variant.id.trim()) {
      throw new Error('video arsenal contains a null or empty variant id');
    }
    if (ids.has(variant.id)) throw new Error(`duplicate video arsenal variant: ${variant.id}`);
    ids.add(variant.id);
    const normalized = normalizeRecipeOptions(variant.recipeId, {
      variantId: variant.id,
      values: variant.values,
    });
    if (normalized.variantId !== variant.id) throw new Error(`${variant.id}: preset does not normalize to its own variant`);
  }

  const execution = validateExecutionRegistry({ variants });
  const gallery = validateExploreGallery(options.galleryConfig ?? galleryConfig, {
    ...options,
    variants,
  });
  if (gallery.items.length !== variants.length) {
    throw new Error(`video arsenal gallery count ${gallery.items.length} does not match catalog count ${variants.length}`);
  }
  return {
    variants: variants.length,
    recipes: execution.recipes,
    adapters: execution.adapters,
    galleryItems: gallery.items.length,
  };
}
