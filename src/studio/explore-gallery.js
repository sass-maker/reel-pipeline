import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import galleryConfig from '../../config/explore-gallery.json' with { type: 'json' };
import representativeConfig from '../../config/explore-gallery-representatives.json' with { type: 'json' };
import { listProductionRecipes, listRecipeVariants } from './production-catalog.js';

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const POSTURES = new Set([
  'fixture',
  'local-render',
  'specialist-proof',
  'local-model-proof',
  'baseline-local',
  'baseline-import',
  'external-continuation',
]);
const QUALITY_TIERS = new Set(['showcase', 'experiment', 'baseline']);
const EXECUTION_MODES = new Set(['fixture', 'real']);

export async function listExploreGallery(options = {}) {
  const registry = validateExploreGallery(options.galleryConfig ?? galleryConfig, options);
  const items = await Promise.all(registry.items.map(async (item) => {
    const info = await stat(item.resolvedSource).catch(() => null);
    const playable = Boolean(info?.isFile() && info.size > 0);
    return {
      id: item.id,
      title: item.title,
      family: item.family,
      description: item.description,
      engine: item.engine,
      renderer: item.renderer,
      intendedRuntime: item.intendedRuntime,
      sourcePosture: item.sourcePosture,
      executionMode: item.executionMode,
      qualityTier: item.qualityTier,
      spend: item.spend,
      variantId: item.variantId,
      prompt: item.prompt,
      evidence: item.evidence,
      playable,
      bytes: playable ? info.size : null,
      mediaUrl: playable ? `/studio/explore-gallery/${encodeURIComponent(item.id)}/media` : null,
    };
  }));
  const families = [...new Set(items.map((item) => item.family))];
  return {
    schema: registry.schema,
    version: registry.version,
    count: items.length,
    playableCount: items.filter((item) => item.playable).length,
    families,
    items,
  };
}

export async function openExploreGalleryMedia(id, options = {}) {
  const registry = validateExploreGallery(options.galleryConfig ?? galleryConfig, options);
  const item = registry.items.find((entry) => entry.id === id);
  if (!item) return null;
  const info = await stat(item.resolvedSource).catch(() => null);
  if (!info?.isFile() || info.size < 1) return null;
  return {
    path: item.resolvedSource,
    size: info.size,
    filename: `${item.id}.mp4`,
    contentType: 'video/mp4',
    variantId: item.variantId,
    sha256: item.sha256,
    renderer: item.renderer,
    evidencePath: item.resolvedEvidence,
  };
}

export async function openExploreGalleryMediaByVariant(variantId, options = {}) {
  const registry = validateExploreGallery(options.galleryConfig ?? galleryConfig, options);
  const item = registry.items.find((entry) => entry.variantId === variantId);
  if (!item) return null;
  return openExploreGalleryMedia(item.id, options);
}

export async function listRepresentativeExploreGallery(options = {}) {
  const registry = validateRepresentativeExploreGallery(options.representativeConfig ?? representativeConfig, options);
  const items = await Promise.all(registry.items.map(async (item) => {
    const info = await stat(item.resolvedSource).catch(() => null);
    const playable = Boolean(info?.isFile() && info.size > 0);
    return {
      id: item.id,
      recipeId: item.recipeId,
      proofRole: item.proofRole,
      rangeLabel: item.rangeLabel,
      motionTags: item.motionTags,
      title: item.title,
      family: item.family,
      description: item.description,
      engine: item.engine,
      renderer: item.renderer,
      intendedRuntime: item.intendedRuntime,
      sourcePosture: item.sourcePosture,
      executionMode: item.executionMode,
      qualityTier: item.qualityTier,
      spend: item.spend,
      variantId: item.variantId,
      prompt: item.prompt,
      durationSeconds: item.durationSeconds,
      evidence: item.evidence,
      playable,
      bytes: playable ? info.size : null,
      mediaUrl: playable ? `/studio/explore-gallery/representatives/${encodeURIComponent(item.id)}/media` : null,
      posterUrl: item.resolvedPoster ? `/studio/explore-gallery/representatives/${encodeURIComponent(item.id)}/poster` : null,
    };
  }));
  return {
    schema: registry.schema,
    version: registry.version,
    count: items.length,
    playableCount: items.filter((item) => item.playable).length,
    exactOptionCount: registry.coverage.exactOptionCount,
    totalCapabilityCount: registry.coverage.totalCapabilityCount,
    provenCapabilityCount: registry.coverage.provenCapabilityCount,
    proofCount: registry.coverage.proofCount,
    unproven: structuredClone(registry.coverage.unproven),
    families: [...new Set(items.map((item) => item.family))],
    items,
  };
}

export async function openRepresentativeExploreGalleryMedia(id, options = {}) {
  const registry = validateRepresentativeExploreGallery(options.representativeConfig ?? representativeConfig, options);
  const item = registry.items.find((entry) => entry.id === id);
  if (!item) return null;
  const info = await stat(item.resolvedSource).catch(() => null);
  if (!info?.isFile() || info.size < 1) return null;
  return {
    path: item.resolvedSource,
    size: info.size,
    filename: `${item.id}.mp4`,
    contentType: 'video/mp4',
    variantId: item.variantId,
    sha256: item.sha256,
    renderer: item.renderer,
    evidencePath: item.resolvedEvidence,
  };
}

export async function openRepresentativeExploreGalleryPoster(id, options = {}) {
  const registry = validateRepresentativeExploreGallery(options.representativeConfig ?? representativeConfig, options);
  const item = registry.items.find((entry) => entry.id === id);
  if (!item?.resolvedPoster) return null;
  const info = await stat(item.resolvedPoster).catch(() => null);
  if (!info?.isFile() || info.size < 1) return null;
  return {
    path: item.resolvedPoster,
    size: info.size,
    filename: `${item.id}.jpg`,
    contentType: 'image/jpeg',
  };
}

export function validateRepresentativeExploreGallery(input, options = {}) {
  if (!input || input.schema !== 'fleet.video-explore-gallery-representatives.v1' || input.version !== 1 || !Array.isArray(input.items)) {
    throw new Error('representative gallery must use fleet.video-explore-gallery-representatives.v1');
  }
  const variants = options.variants ?? listRecipeVariants();
  const recipes = options.recipes ?? listProductionRecipes();
  const base = validateExploreGallery(
    { schema: 'fleet.video-explore-gallery.v1', version: 1, items: input.items },
    { ...options, galleryRoot: options.representativeRoot ?? DEFAULT_ROOT, variants },
  );
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]));
  const knownRecipes = new Set(recipes.map((recipe) => recipe.id));
  const seenRecipes = new Set();
  const primaryRecipes = new Set();
  const items = base.items.map((item, index) => {
    const source = input.items[index];
    const recipeId = required(source.recipeId, `${item.id} recipeId`);
    if (!knownRecipes.has(recipeId)) throw new Error(`${item.id}: unknown recipe ${recipeId}`);
    seenRecipes.add(recipeId);
    const proofRole = required(source.proofRole, `${item.id} proofRole`);
    if (!['primary', 'range'].includes(proofRole)) throw new Error(`${item.id}: proofRole must be primary or range`);
    if (proofRole === 'primary') {
      if (primaryRecipes.has(recipeId)) throw new Error(`${recipeId}: duplicate primary proof`);
      primaryRecipes.add(recipeId);
    }
    const rangeLabel = required(source.rangeLabel, `${item.id} rangeLabel`);
    const motionTags = Array.isArray(source.motionTags)
      ? source.motionTags.map((tag) => required(tag, `${item.id} motion tag`))
      : [];
    if (!motionTags.length) throw new Error(`${item.id}: motionTags are required`);
    if (variantsById.get(item.variantId)?.recipeId !== recipeId) throw new Error(`${item.id}: variant is incompatible with ${recipeId}`);
    if (item.sourcePosture === 'fixture' || item.executionMode !== 'real' || item.renderer === 'ffmpeg-svg-fixture@1') {
      throw new Error(`${item.id}: placeholder proof cannot be representative`);
    }
    if (!item.evidence) throw new Error(`${item.id}: evidence is required`);
    const poster = source.poster == null ? null : required(source.poster, `${item.id} poster`);
    const root = path.resolve(options.representativeRoot ?? DEFAULT_ROOT);
    const resolvedPoster = poster ? path.resolve(root, poster) : null;
    if (resolvedPoster && resolvedPoster !== root && !resolvedPoster.startsWith(`${root}${path.sep}`)) throw new Error(`${item.id}: poster escapes the gallery root`);
    const durationSeconds = Number(source.durationSeconds);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 6 || durationSeconds > 15) throw new Error(`${item.id}: duration must be 6–15 seconds`);
    return { ...item, recipeId, proofRole, rangeLabel, motionTags, durationSeconds, poster, resolvedPoster };
  });
  const coverage = input.coverage;
  if (!coverage || coverage.exactOptionCount !== variants.length) throw new Error(`representative gallery exact option count must be ${variants.length}`);
  if (coverage.totalCapabilityCount !== recipes.length) throw new Error(`representative gallery capability count must be ${recipes.length}`);
  if (coverage.provenCapabilityCount !== seenRecipes.size) throw new Error('representative gallery proven capability count drifted');
  if (coverage.proofCount !== items.length) throw new Error('representative gallery proof count drifted');
  for (const recipeId of seenRecipes) {
    if (!primaryRecipes.has(recipeId)) throw new Error(`${recipeId}: primary proof is required`);
  }
  const unproven = Array.isArray(coverage.unproven) ? coverage.unproven.map((entry) => ({
    recipeId: required(entry?.recipeId, 'unproven recipeId'),
    reason: required(entry?.reason, 'unproven reason'),
  })) : [];
  const expectedUnproven = [...knownRecipes].filter((recipeId) => !seenRecipes.has(recipeId));
  const actualUnproven = unproven.map((entry) => entry.recipeId);
  if (new Set(actualUnproven).size !== actualUnproven.length || expectedUnproven.some((recipeId) => !actualUnproven.includes(recipeId)) || actualUnproven.some((recipeId) => !expectedUnproven.includes(recipeId))) {
    throw new Error(`representative gallery unproven coverage must be exactly: ${expectedUnproven.join(', ') || 'none'}`);
  }
  return { schema: input.schema, version: input.version, coverage: { ...coverage, unproven }, items };
}

export async function validateRepresentativeExploreGalleryMedia(options = {}) {
  const registry = validateRepresentativeExploreGallery(options.representativeConfig ?? representativeConfig, options);
  const failures = [];
  let totalBytes = 0;
  for (const item of registry.items) {
    const [info, evidenceInfo, posterInfo] = await Promise.all([
      stat(item.resolvedSource).catch(() => null),
      stat(item.resolvedEvidence).catch(() => null),
      item.resolvedPoster ? stat(item.resolvedPoster).catch(() => null) : null,
    ]);
    if (!info?.isFile() || info.size < 1) failures.push(`${item.recipeId}: missing media`);
    else {
      totalBytes += info.size;
      const digest = createHash('sha256').update(await readFile(item.resolvedSource)).digest('hex');
      if (digest !== item.sha256) failures.push(`${item.recipeId}: sha256 mismatch`);
    }
    if (!evidenceInfo?.isFile() || evidenceInfo.size < 1) failures.push(`${item.recipeId}: missing evidence`);
    if (!posterInfo?.isFile() || posterInfo.size < 1) failures.push(`${item.recipeId}: missing poster`);
  }
  if (failures.length) throw new Error(`representative gallery media validation failed: ${failures.join('; ')}`);
  return { capabilities: new Set(registry.items.map((item) => item.recipeId)).size, proofs: registry.items.length, totalBytes };
}

export function validateExploreGallery(input, options = {}) {
  if (!input || input.schema !== 'fleet.video-explore-gallery.v1' || ![1, 2].includes(input.version) || !Array.isArray(input.items)) {
    throw new Error('explore gallery must use fleet.video-explore-gallery.v1');
  }
  const root = path.resolve(options.galleryRoot ?? DEFAULT_ROOT);
  const knownVariants = new Set((options.variants ?? listRecipeVariants()).map((variant) => variant.id));
  const ids = new Set();
  const variantIds = new Set();
  const items = input.items.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`explore gallery item ${index + 1} must be an object`);
    const id = required(entry.id, `explore gallery item ${index + 1} id`);
    if (ids.has(id)) throw new Error(`duplicate explore gallery id: ${id}`);
    ids.add(id);
    if (!POSTURES.has(entry.sourcePosture)) throw new Error(`${id}: unsupported source posture`);
    if (!QUALITY_TIERS.has(entry.qualityTier)) throw new Error(`${id}: unsupported quality tier`);
    if (entry.variantId == null) throw new Error(`${id}: variantId is required`);
    if (!knownVariants.has(entry.variantId)) throw new Error(`${id}: unknown variant ${entry.variantId}`);
    if (variantIds.has(entry.variantId)) throw new Error(`duplicate explore gallery variant: ${entry.variantId}`);
    variantIds.add(entry.variantId);
    const source = required(entry.source, `${id} source`);
    if (path.isAbsolute(source)) throw new Error(`${id}: source must be relative to the gallery root`);
    const resolvedSource = path.resolve(root, source);
    if (resolvedSource !== root && !resolvedSource.startsWith(`${root}${path.sep}`)) throw new Error(`${id}: source escapes the gallery root`);
    const evidence = entry.evidence ? required(entry.evidence, `${id} evidence`) : null;
    const resolvedEvidence = evidence ? path.resolve(root, evidence) : null;
    if (resolvedEvidence && resolvedEvidence !== root && !resolvedEvidence.startsWith(`${root}${path.sep}`)) throw new Error(`${id}: evidence escapes the gallery root`);
    const executionMode = entry.executionMode ?? (entry.sourcePosture === 'fixture' ? 'fixture' : 'real');
    if (!EXECUTION_MODES.has(executionMode)) throw new Error(`${id}: unsupported execution mode`);
    const sha256 = entry.sha256 ?? null;
    if (sha256 != null && !/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`${id}: invalid sha256`);
    return {
      id,
      title: required(entry.title, `${id} title`),
      family: required(entry.family, `${id} family`),
      description: required(entry.description, `${id} description`),
      engine: required(entry.engine, `${id} engine`),
      renderer: required(entry.renderer ?? entry.engine, `${id} renderer`),
      intendedRuntime: required(entry.intendedRuntime ?? entry.engine, `${id} intendedRuntime`),
      sourcePosture: entry.sourcePosture,
      executionMode,
      qualityTier: entry.qualityTier,
      spend: required(entry.spend, `${id} spend`),
      variantId: entry.variantId,
      prompt: required(entry.prompt ?? `Create a ${entry.title} video.`, `${id} prompt`),
      evidence,
      resolvedEvidence,
      sha256,
      resolvedSource,
    };
  });
  if (input.version >= 2) {
    const missing = [...knownVariants].filter((id) => !variantIds.has(id));
    if (missing.length) throw new Error(`explore gallery missing variants: ${missing.join(', ')}`);
    if (items.length !== knownVariants.size) throw new Error(`explore gallery must contain exactly ${knownVariants.size} variants`);
  }
  return { schema: input.schema, version: input.version, items };
}

export async function validateExploreGalleryMedia(options = {}) {
  const registry = validateExploreGallery(options.galleryConfig ?? galleryConfig, options);
  const failures = [];
  let totalBytes = 0;
  for (const item of registry.items) {
    const info = await stat(item.resolvedSource).catch(() => null);
    if (!info?.isFile() || info.size < 1) {
      failures.push(`${item.variantId}: missing media`);
      continue;
    }
    totalBytes += info.size;
    if (item.sha256) {
      const digest = createHash('sha256').update(await readFile(item.resolvedSource)).digest('hex');
      if (digest !== item.sha256) failures.push(`${item.variantId}: sha256 mismatch`);
    }
  }
  if (failures.length) throw new Error(`gallery media validation failed: ${failures.join('; ')}`);
  return { variants: registry.items.length, totalBytes };
}

function required(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}
