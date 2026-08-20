import arsenalConfig from '../../config/studio-arsenal.json' with { type: 'json' };
import { POST_READY_VOICE_CATALOG } from '../post-ready/voices.js';
import brandConfig from '../../config/brand-channels.json' with { type: 'json' };
import { resolveModelProfile, resolveThemePack } from './model-options.js';
import { soundtrackDistributionBlockers } from './soundtrack.js';

const CHANNELS = [...arsenalConfig.channels];
const QUALITY_TIERS = [...arsenalConfig.qualityTiers];
const SPEND = Object.fromEntries(Object.entries(arsenalConfig.spendClasses).map(([id, value]) => [id, { id, ...value }]));
const RECIPE_DEFINITIONS = arsenalConfig.recipes.map((entry) => recipe(entry));
const MAX_RECIPE_VARIANTS = 256;
const DELIVERY_LABELS = {
  'final-video': 'Final MP4',
  preview: 'Preview artifact',
  continuation: 'Continue in another tool',
};

export function listProductionProjects() {
  return Object.entries(brandConfig.brands ?? {}).map(([slug, brand]) => ({
    slug,
    name: brand.name,
    domain: brand.domain,
    channels: [...brand.channels],
    palette: { ...brand.palette },
  }));
}

export function listProductionRecipes(context = {}) {
  return RECIPE_DEFINITIONS.map((definition) => decorateRecipe(definition, context));
}

export function listRecipeVariants(context = {}) {
  return listProductionRecipes(context).flatMap((recipe) => recipe.variants);
}

export function getProductionRecipe(id, context = {}) {
  const definition = RECIPE_DEFINITIONS.find((entry) => entry.id === id);
  if (!definition) throw new Error(`unknown video recipe: ${id}`);
  return decorateRecipe(definition, context);
}

export function normalizeRecipeOptions(recipeId, input = {}) {
  const recipe = getProductionRecipe(recipeId);
  const variants = recipe.variants;
  const variantById = input.variantId ? variants.find((variant) => variant.id === input.variantId) : null;
  if (input.variantId && !variantById) throw new Error(`unsupported variant for ${recipeId}: ${input.variantId}`);
  const requestedValues = Object.fromEntries(recipe.options.map((option) => [
    option.id,
    normalizeOption(option, input.values?.[option.id] ?? input[option.id] ?? variantById?.values?.[option.id]),
  ]));
  const selectedVariant = variantById
    ?? variants.find((variant) => finiteValuesMatch(recipe.options, variant.values, requestedValues));
  if (!selectedVariant) throw new Error(`unsupported variant for ${recipeId}: ${input.variantId ?? JSON.stringify(requestedValues)}`);
  for (const option of recipe.options.filter((entry) => entry.type !== 'text')) {
    if (requestedValues[option.id] !== selectedVariant.values[option.id]) {
      throw new Error(`${option.id} does not match variant ${selectedVariant.id}`);
    }
  }
  const channel = input.channel ?? recipe.defaults.channel;
  if (!recipe.channels.includes(channel)) throw new Error(`unsupported channel for ${recipeId}: ${channel}`);
  const durationSeconds = boundedInteger(input.durationSeconds ?? recipe.defaults.durationSeconds, 5, 90, 'durationSeconds');
  const qualityTier = input.qualityTier ?? recipe.defaults.qualityTier;
  if (!QUALITY_TIERS.includes(qualityTier)) throw new Error(`qualityTier must be one of ${QUALITY_TIERS.join(', ')}`);
  const variantCount = boundedInteger(input.variantCount ?? recipe.defaults.variantCount, 1, 6, 'variantCount');
  return {
    variantId: selectedVariant.id,
    channel,
    durationSeconds,
    qualityTier,
    variantCount,
    values: { ...selectedVariant.values, ...requestedValues },
  };
}

export function productionActions(brief, context = {}) {
  const recipe = brief?.recipeId ? getProductionRecipe(brief.recipeId, { ...context, brief }) : null;
  const previewPath = brief?.media?.videoPath ?? brief?.media?.previewPath ?? null;
  const build = recipe
    ? buildAction(recipe, brief)
    : { enabled: false, kind: 'blocked', label: 'Choose a video recipe', href: null, endpoint: null, blocker: 'Choose and save a video recipe first.' };
  const distributionBlockers = distributionBlockersFor(brief);
  return {
    edit: { enabled: Boolean(brief), label: 'Edit plan', target: 'advanced-brief' },
    build,
    preview: {
      enabled: Boolean(previewPath), label: 'Preview', target: 'productions', path: previewPath,
      blocker: previewPath ? null : 'Build or continue the production before previewing it.',
    },
    post: {
      enabled: distributionBlockers.length === 0,
      label: 'Prepare in Postiz', target: 'distribute',
      blocker: distributionBlockers.length ? `Add ${distributionBlockers.join(', ')} before preparing Postiz.` : null,
    },
  };
}

function decorateRecipe(definition, context) {
  const readiness = readinessFor(definition, context);
  const decorated = structuredClone({
    ...definition,
    spend: SPEND[definition.spend],
    readiness,
    delivery: deliveryMetadata(definition.delivery),
  });
  decorated.variants = expandRecipeVariants(decorated);
  return decorated;
}

function expandRecipeVariants(recipe) {
  const boundedOptions = recipe.options.filter((option) => option.type !== 'text');
  const unboundedOptions = recipe.options
    .filter((option) => option.type === 'text')
    .map((option) => ({ id: option.id, label: option.label, type: option.type, placeholder: option.placeholder ?? null }));
  const dimensions = boundedOptions.map((option) => ({
    option,
    values: option.type === 'boolean' ? [false, true] : option.choices,
  }));
  const combinations = dimensions.reduce(
    (rows, dimension) => rows.flatMap((row) => dimension.values.map((value) => ({ ...row, [dimension.option.id]: value }))),
    [{}],
  );
  if (combinations.length > MAX_RECIPE_VARIANTS) {
    throw new Error(`${recipe.id}: variant expansion exceeds ${MAX_RECIPE_VARIANTS}`);
  }
  return combinations.map((finiteValues) => {
    const values = { ...finiteValues };
    for (const option of recipe.options.filter((entry) => entry.type === 'text')) values[option.id] = option.default;
    const optionLabels = boundedOptions.map((option) => `${option.label}: ${displayOptionValue(values[option.id])}`);
    const idParts = boundedOptions.map((option) => `${stableSegment(option.id)}-${stableSegment(values[option.id])}`);
    if (unboundedOptions.length) idParts.push('custom-input');
    return {
      id: `${recipe.id}--${idParts.join('--') || 'default'}`,
      recipeId: recipe.id,
      group: recipe.group,
      name: recipe.name,
      label: optionLabels.length ? `${recipe.name} — ${optionLabels.join(', ')}` : recipe.name,
      values,
      unboundedOptions: structuredClone(unboundedOptions),
      delivery: structuredClone(recipe.delivery),
      spend: structuredClone(recipe.spend),
      runtime: recipe.runtime,
      owner: recipe.owner,
      outputStyle: recipe.outputStyle,
      action: structuredClone(recipe.action),
      readiness: structuredClone(recipe.readiness),
      selectable: true,
      executionReady: recipe.delivery.kind === 'final-video' && recipe.action.kind === 'execute' && recipe.readiness.state === 'ready',
      autoEligible: recipe.delivery.kind === 'final-video' && recipe.action.kind === 'execute' && recipe.readiness.state === 'ready',
    };
  });
}

function deliveryMetadata(kind) {
  if (!DELIVERY_LABELS[kind]) throw new Error(`unsupported delivery kind: ${kind}`);
  return { kind, label: DELIVERY_LABELS[kind] };
}

function finiteValuesMatch(options, expected, actual) {
  return options.filter((option) => option.type !== 'text').every((option) => expected[option.id] === actual[option.id]);
}

function displayOptionValue(value) {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  const voice = POST_READY_VOICE_CATALOG.find((entry) => entry.id === value);
  if (voice) return `${voice.label} · ${voice.character}`;
  return String(value).split(/[-_]/).map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ');
}

function stableSegment(value) {
  const segment = String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return segment || 'default';
}

function readinessFor(definition, context) {
  const brief = context.brief ?? null;
  const missing = missingBriefRequirements(definition, brief);
  if (missing.length) return { state: 'needs-input', ready: false, blocker: `Add ${missing.join(', ')} before continuing.` };
  if (definition.supports?.modelProfiles) {
    const suppliedAssetManifest = brief?.executionInputs?.assetManifestPath;
    if (suppliedAssetManifest && !brief.executionInputs?.rightsEvidence) {
      return { state: 'needs-input', ready: false, blocker: 'Add source rights evidence for the approved image manifest.' };
    }
    if (!suppliedAssetManifest) try {
      const resolved = resolveModelProfile(brief?.modelProfileId ?? 'auto', {
        ...(context.modelOptions ?? {}),
        generationMode: definition.supports.generationMode,
      });
      if (!resolved.profile.readiness.ready) {
        return { state: 'needs-runtime', ready: false, blocker: resolved.profile.readiness.blocker };
      }
    } catch (error) {
      const alternative = definition.id === 'night-out-carousel'
        ? ' Install the verified WAI checkpoint for prompt-first generation or supply an approved image manifest with rights evidence.'
        : '';
      return { state: 'needs-runtime', ready: false, blocker: `${error.message}${alternative}` };
    }
  }
  if (definition.engine === 'html-composition') {
    const capability = context.htmlCapability;
    if (!capability?.ready) return {
      state: 'needs-runtime',
      ready: false,
      blocker: capability?.blocker ?? 'Chrome and FFmpeg must be ready before this recipe can produce a final MP4.',
    };
  }
  if (definition.readiness === 'blender') {
    const capability = context.blenderCapability;
    if (!capability?.ready) return { state: 'needs-runtime', ready: false, blocker: capability?.blocker ?? 'Check Blender 5.2 readiness on this machine.' };
  }
  if (definition.readiness === 'kokoro' && context.kokoroReady !== true) {
    return {
      state: 'needs-runtime',
      ready: false,
      blocker: context.kokoroBlocker ?? 'Install the local Kokoro model and configure the b-roll source.',
    };
  }
  if (definition.readiness === 'grok-asset') {
    const asset = brief?.recipeOptions?.values?.approvedAssetPath;
    if (!asset) return { state: 'needs-input', ready: false, blocker: 'Add an operator-approved local Grok MP4 path.' };
  }
  if (definition.readiness === 'lyric') {
    if (!brief?.lyric?.audioPath || !brief?.lyric?.timedLyrics) {
      return { state: 'needs-input', ready: false, blocker: 'Add local audio and operator-supplied timed lyrics in the detailed editor.' };
    }
    const rights = brief.lyric.rights ?? {};
    if (!['owned', 'licensed'].includes(rights.composition) || !['owned', 'licensed'].includes(rights.master) || !brief.lyric.attribution) {
      return { state: 'needs-input', ready: false, blocker: 'Add composition rights, master rights, and attribution. Attribution is not permission.' };
    }
  }
  if (definition.action.kind === 'continue') {
    return { state: 'external-step', ready: true, blocker: `${definition.owner} owns execution and review for this recipe.` };
  }
  return { state: 'ready', ready: true, blocker: null };
}

function buildAction(recipe, brief) {
  if (!recipe.readiness.ready) {
    return { enabled: false, kind: 'blocked', label: recipe.action.label, href: null, endpoint: null, blocker: recipe.readiness.blocker };
  }
  if (recipe.action.kind === 'continue') {
    return {
      enabled: true, kind: 'continue', label: recipe.action.label,
      href: continuationHref(recipe.action.href, brief, recipe), endpoint: null, blocker: recipe.readiness.blocker,
    };
  }
  return {
    enabled: true, kind: 'execute', label: recipe.action.label,
    href: null, endpoint: `/studio/briefs/${encodeURIComponent(brief.id)}/execute`, blocker: null,
  };
}

function continuationHref(base, brief, recipe) {
  const relative = String(base).startsWith('/');
  const url = new URL(base, 'http://studio.local');
  url.searchParams.set('studioBriefId', brief.id);
  url.searchParams.set('recipeId', recipe.id);
  if (brief.projectSlug) url.searchParams.set('projectName', brief.projectSlug);
  const source = publicHttpsUrl(brief.sourceEvidence?.canonicalUrl);
  if (source) url.searchParams.set('sourceUrl', source);
  return relative ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}

function missingBriefRequirements(definition, brief) {
  if (!brief) return [];
  const missing = [];
  if (definition.requirements.includes('canonical source URL') && !brief.sourceEvidence?.canonicalUrl) missing.push('a canonical source URL');
  if (definition.requirements.includes('approved source rights') && brief.sourceEvidence?.rightsStatus !== 'approved') missing.push('approved source rights');
  return missing;
}

function distributionBlockersFor(brief) {
  if (!brief) return ['a saved production'];
  const missing = [];
  if (!brief.projectSlug) missing.push('a Fleet brand');
  if (!brief.sourceEvidence?.canonicalUrl) missing.push('a canonical source URL');
  if (!brief.sourceEvidence?.claim) missing.push('a source-backed claim');
  if (!brief.sourceEvidence?.destinationUrl) missing.push('a destination URL');
  if (brief.sourceEvidence?.rightsStatus !== 'approved') missing.push('approved source rights');
  const theme = brief.recipeId ? resolveThemePack(brief.themePackId, brief.request) : null;
  if (theme?.commercialRightsRequired && !brief.themeRightsEvidence) missing.push(`commercial rights evidence for ${theme.name}`);
  missing.push(...soundtrackDistributionBlockers(brief.soundtrack));
  if (brief.approval?.creativeStatus !== 'approved') missing.push('creative approval');
  if (!(brief.media?.quality?.verdict === 'pass' || brief.approval?.qualityAccepted === true)) missing.push('accepted quality evidence');
  if (!brief.cta) missing.push('a call to action');
  if (!brief.media?.videoPath) missing.push('a rendered video');
  if (!publicHttpsUrl(brief.media?.publicUrl)) missing.push('a stable public media URL');
  return missing;
}

function recipe(input) {
  return {
    version: 1,
    channels: CHANNELS,
    requirements: [],
    readiness: null,
    action: { kind: 'execute', label: 'Build preview', href: null },
    delivery: 'preview',
    ...structuredClone(input),
    defaults: { channel: 'youtube_shorts', ...input.defaults },
  };
}

function normalizeOption(option, value) {
  const candidate = value ?? option.default;
  if (option.type === 'boolean') return candidate === true || candidate === 'true';
  if (option.type === 'select') {
    if (!option.choices.includes(candidate)) throw new Error(`${option.id} must be one of ${option.choices.join(', ')}`);
    return candidate;
  }
  if (typeof candidate !== 'string') throw new Error(`${option.id} must be a string`);
  return candidate.trim().slice(0, 500);
}

function boundedInteger(value, min, max, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${field} must be an integer between ${min} and ${max}`);
  return number;
}

function publicHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export const PRODUCTION_RECIPE_IDS = RECIPE_DEFINITIONS.map((entry) => entry.id);
export const PRODUCTION_SPEND_CLASSES = Object.keys(SPEND);
