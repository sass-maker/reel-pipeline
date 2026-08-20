import arsenalConfig from '../../config/studio-arsenal.json' with { type: 'json' };
import renderModesConfig from '../../config/render-modes.json' with { type: 'json' };

import { loadAutomationPolicies } from './automation-policy.js';
import { listStudioCapabilities } from './capabilities.js';
import { describeVariantExecution } from './execution-registry.js';
import { listProductionProjects, listProductionRecipes, PRODUCTION_SPEND_CLASSES } from './production-catalog.js';
import { listModelProfiles, listThemePacks } from './model-options.js';

export const STUDIO_ARSENAL_SCHEMA = 'fleet.studio-arsenal.v1';
export const STUDIO_ARSENAL_SNAPSHOT_SCHEMA = 'fleet.studio-arsenal-snapshot.v1';

const ACTION_KINDS = new Set(['execute', 'continue']);
const OPTION_TYPES = new Set(['select', 'text', 'boolean']);
const SIDE_EFFECTS = new Set(['none', 'network-read', 'local-write', 'local-render', 'network-write']);

export async function buildStudioArsenal(options = {}) {
  const manifest = validateStudioArsenalManifest(options.manifest ?? arsenalConfig, {
    renderModes: options.renderModes ?? renderModesConfig,
    supportedToolIds: options.supportedToolIds,
  });
  const automation = options.automationRegistry ?? await loadAutomationPolicies(options.automationPolicyOptions);
  const filters = normalizeArsenalFilters(options.filters, manifest);
  const workflows = listStudioCapabilities(options.brief ?? null, options.capabilityOptions ?? {});
  const allRecipes = listProductionRecipes(options.recipeContext ?? {});
  const recipes = allRecipes.filter((recipe) => recipeMatches(recipe, filters, manifest));
  const variants = recipes.flatMap((recipe) => recipe.variants).map(describeVariantExecution);
  const selectedRecipeIds = new Set(recipes.map((recipe) => recipe.id));
  const automations = automation.policies.map((policy) => ({
    ...structuredClone(policy),
    selectedRecipes: policy.recipes.filter((id) => selectedRecipeIds.has(id)),
  }));

  validateAutomationRecipeReferences(automation.policies, manifest.recipes);

  return {
    schema: STUDIO_ARSENAL_SNAPSHOT_SCHEMA,
    version: manifest.version,
    readOnly: true,
    sources: {
      arsenal: { schema: manifest.schema, version: manifest.version, path: 'config/studio-arsenal.json' },
      renderModes: { schema: renderModesConfig.$schema, path: 'config/render-modes.json' },
      automation: { schema: automation.schema, version: automation.version, path: 'config/studio-automation.json' },
      brands: { schema: 'fleet.brand-channels.v1', path: 'config/brand-channels.json' },
    },
    filters,
    guardrails: structuredClone(manifest.guardrails),
    workflow: structuredClone(manifest.agentWorkflow),
    projects: listProductionProjects(),
    tools: structuredClone(manifest.tools),
    capabilities: workflows,
    recipes,
    variants,
    themePacks: listThemePacks(),
    modelProfiles: listModelProfiles(options.modelOptions),
    engines: describeEngines(manifest, allRecipes, options.recipeContext ?? {}),
    automations,
    summary: {
      projects: listProductionProjects().length,
      tools: manifest.tools.length,
      capabilities: workflows.length,
      recipes: recipes.length,
      totalRecipes: manifest.recipes.length,
      variants: variants.length,
      themePacks: listThemePacks().length,
      modelProfiles: listModelProfiles(options.modelOptions).length,
      engines: renderModesConfig.modes.length + manifest.specializedRuntimes.length,
      automations: automations.length,
    },
  };
}

export function validateStudioArsenalManifest(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Studio arsenal manifest must be an object');
  const secretPath = findSecretField(input);
  if (secretPath) throw new Error(`Studio arsenal manifest must be secret-free: ${secretPath}`);
  if (input.$schema !== STUDIO_ARSENAL_SCHEMA) throw new Error(`unsupported Studio arsenal schema: ${input.$schema ?? 'missing'}`);
  if (!Number.isInteger(input.version) || input.version < 1) throw new Error('Studio arsenal version must be a positive integer');

  const owners = uniqueStrings(input.owners, 'owners');
  const channels = uniqueStrings(input.channels, 'channels');
  const qualityTiers = uniqueStrings(input.qualityTiers, 'qualityTiers');
  if (!input.spendClasses || typeof input.spendClasses !== 'object' || Array.isArray(input.spendClasses)) throw new Error('spendClasses must be an object');
  const spendClasses = Object.entries(input.spendClasses);
  if (!spendClasses.length) throw new Error('spendClasses must not be empty');
  for (const [id, value] of spendClasses) {
    requiredString(id, 'spend class id');
    requiredString(value?.label, `spendClasses.${id}.label`);
    requiredString(value?.note, `spendClasses.${id}.note`);
  }

  const renderModes = options.renderModes ?? renderModesConfig;
  const renderModeIds = new Set((renderModes.modes ?? []).map((mode) => mode.id));
  const specializedRuntimes = normalizeSpecializedRuntimes(input.specializedRuntimes, owners);
  const engineIds = new Set([...renderModeIds, ...specializedRuntimes.map((entry) => entry.id)]);
  const capabilities = normalizeCapabilities(input.capabilities, owners);
  const recipes = normalizeRecipes(input.recipes, { owners, channels, qualityTiers, spendClassIds: spendClasses.map(([id]) => id), engineIds });
  const tools = normalizeTools(input.tools);
  const supportedToolIds = options.supportedToolIds ? new Set(options.supportedToolIds) : null;
  if (supportedToolIds) {
    for (const tool of tools) if (!supportedToolIds.has(tool.id)) throw new Error(`Studio tool has no stable handler: ${tool.id}`);
    for (const id of supportedToolIds) if (!tools.some((tool) => tool.id === id)) throw new Error(`Studio handler is absent from arsenal: ${id}`);
  }
  const guardrails = uniqueStrings(input.guardrails, 'guardrails');
  const agentWorkflow = normalizeWorkflow(input.agentWorkflow);

  return {
    schema: input.$schema,
    version: input.version,
    owners,
    channels,
    qualityTiers,
    spendClasses: Object.fromEntries(spendClasses.map(([id, value]) => [id, structuredClone(value)])),
    specializedRuntimes,
    guardrails,
    agentWorkflow,
    capabilities,
    recipes,
    tools,
  };
}

export function normalizeArsenalFilters(input = {}, manifest = validateStudioArsenalManifest(arsenalConfig)) {
  const raw = input ?? {};
  const recipeIds = arrayFilter(raw.recipeIds ?? raw.recipeId ?? raw.recipe);
  const knownRecipes = new Set(manifest.recipes.map((recipe) => recipe.id));
  for (const id of recipeIds) if (!knownRecipes.has(id)) throw new Error(`unknown arsenal recipe filter: ${id}`);
  const channel = optionalString(raw.channel);
  if (channel && !manifest.channels.includes(channel)) throw new Error(`unsupported arsenal channel filter: ${channel}`);
  const owner = optionalString(raw.owner);
  if (owner && !manifest.owners.includes(owner)) throw new Error(`unsupported arsenal owner filter: ${owner}`);
  const spendCeiling = optionalString(raw.spendCeiling ?? raw['spend-ceiling']);
  if (spendCeiling && !PRODUCTION_SPEND_CLASSES.includes(spendCeiling)) throw new Error(`unsupported arsenal spend ceiling: ${spendCeiling}`);
  const readiness = optionalString(raw.readiness) ?? 'all';
  if (!['all', 'ready', 'blocked'].includes(readiness)) throw new Error('arsenal readiness filter must be all, ready, or blocked');
  return { recipeIds, channel, owner, spendCeiling, readiness };
}

function recipeMatches(recipe, filters, manifest) {
  if (filters.recipeIds.length && !filters.recipeIds.includes(recipe.id)) return false;
  if (filters.channel && !recipe.channels.includes(filters.channel)) return false;
  if (filters.owner && recipe.owner !== filters.owner) return false;
  if (filters.spendCeiling) {
    const order = Object.keys(manifest.spendClasses);
    if (order.indexOf(recipe.spend.id) > order.indexOf(filters.spendCeiling)) return false;
  }
  if (filters.readiness === 'ready' && !recipe.readiness.ready) return false;
  if (filters.readiness === 'blocked' && recipe.readiness.ready) return false;
  return true;
}

function describeEngines(manifest, recipes, recipeContext) {
  const byEngine = new Map();
  for (const recipe of recipes) {
    if (!byEngine.has(recipe.engine)) byEngine.set(recipe.engine, []);
    byEngine.get(recipe.engine).push(recipe);
  }
  const declared = renderModesConfig.modes.map((mode) => ({
    id: mode.id,
    provider: mode.provider,
    category: mode.category,
    surface: mode.surface,
    description: mode.description,
    requires: structuredClone(mode.requires ?? []),
    execution: mode.category === 'production' || mode.category === 'service' ? 'gated' : 'local',
    readiness: engineReadiness(mode.id, recipeContext),
    recipes: (byEngine.get(mode.id) ?? []).map((recipe) => recipe.id),
  }));
  const specialized = manifest.specializedRuntimes.map((runtime) => ({
    ...structuredClone(runtime),
    provider: runtime.id,
    category: 'specialized',
    surface: runtime.owner,
    description: `${runtime.owner} owns this specialized runtime.`,
    requires: [],
    readiness: specializedReadiness(byEngine.get(runtime.id) ?? []),
    recipes: (byEngine.get(runtime.id) ?? []).map((recipe) => recipe.id),
  }));
  return [...declared, ...specialized];
}

function engineReadiness(id, context) {
  if (id === 'blender') return readinessValue(context.blenderCapability?.ready, context.blenderCapability?.blocker ?? null);
  if (id === 'html-composition') return readinessValue(context.htmlCapability?.ready, context.htmlCapability?.blocker ?? null);
  if (id === 'kokoro') return readinessValue(
    context.kokoroReady,
    context.kokoroReady ? null : context.kokoroBlocker ?? 'Kokoro is not ready on this host.',
  );
  return { state: 'not-probed', ready: null, blocker: 'Run the engine-specific smoke or canary before execution.' };
}

function specializedReadiness(recipes) {
  if (!recipes.length) return { state: 'not-referenced', ready: null, blocker: null };
  if (recipes.every((recipe) => recipe.readiness.ready)) return { state: 'ready-or-external', ready: true, blocker: recipes[0].readiness.blocker };
  return { state: 'blocked', ready: false, blocker: recipes.find((recipe) => !recipe.readiness.ready)?.readiness.blocker ?? null };
}

function readinessValue(value, blocker) {
  if (value === true) return { state: 'ready', ready: true, blocker: null };
  if (value === false) return { state: 'blocked', ready: false, blocker };
  return { state: 'not-probed', ready: null, blocker: blocker ?? 'Readiness has not been probed.' };
}

function normalizeSpecializedRuntimes(input, owners) {
  const entries = objectArray(input, 'specializedRuntimes');
  assertUniqueIds(entries, 'specialized runtime');
  return entries.map((entry, index) => {
    const id = requiredString(entry.id, `specializedRuntimes[${index}].id`);
    const owner = requiredString(entry.owner, `${id}.owner`);
    if (!owners.includes(owner)) throw new Error(`${id}: unsupported owner ${owner}`);
    if (!['local', 'external-step'].includes(entry.execution)) throw new Error(`${id}: unsupported execution posture`);
    return { id, owner, execution: entry.execution };
  });
}

function normalizeCapabilities(input, owners) {
  const entries = objectArray(input, 'capabilities');
  assertUniqueIds(entries, 'capability');
  return entries.map((entry, index) => {
    const id = requiredString(entry.id, `capabilities[${index}].id`);
    const owner = requiredString(entry.owner, `${id}.owner`);
    if (!owners.includes(owner)) throw new Error(`${id}: unsupported owner ${owner}`);
    const action = normalizeAction(entry.action, `${id}.action`);
    return { ...structuredClone(entry), id, owner, action, required: uniqueStrings(entry.required ?? [], `${id}.required`) };
  });
}

function normalizeRecipes(input, context) {
  const entries = objectArray(input, 'recipes');
  assertUniqueIds(entries, 'recipe');
  return entries.map((entry, index) => {
    const id = requiredString(entry.id, `recipes[${index}].id`);
    const owner = requiredString(entry.owner, `${id}.owner`);
    if (!context.owners.includes(owner)) throw new Error(`${id}: unsupported owner ${owner}`);
    const engine = requiredString(entry.engine, `${id}.engine`);
    if (!context.engineIds.has(engine)) throw new Error(`${id}: unknown render engine ${engine}`);
    const spend = requiredString(entry.spend, `${id}.spend`);
    if (!context.spendClassIds.includes(spend)) throw new Error(`${id}: unsupported spend class ${spend}`);
    const delivery = requiredString(entry.delivery, `${id}.delivery`);
    if (!['final-video', 'preview', 'continuation'].includes(delivery)) throw new Error(`${id}: unsupported delivery ${delivery}`);
    const action = normalizeAction(entry.action ?? { kind: 'execute', label: 'Build preview' }, `${id}.action`);
    if (delivery === 'continuation' && action.kind !== 'continue') throw new Error(`${id}: continuation delivery requires a continue action`);
    if (delivery !== 'continuation' && action.kind !== 'execute') throw new Error(`${id}: ${delivery} delivery requires an execute action`);
    const defaults = entry.defaults ?? {};
    if (!Number.isInteger(defaults.durationSeconds) || defaults.durationSeconds < 5 || defaults.durationSeconds > 90) throw new Error(`${id}: invalid default duration`);
    if (!context.qualityTiers.includes(defaults.qualityTier)) throw new Error(`${id}: invalid default quality tier`);
    if (!Number.isInteger(defaults.variantCount) || defaults.variantCount < 1 || defaults.variantCount > 6) throw new Error(`${id}: invalid default variant count`);
    const options = objectArray(entry.options ?? [], `${id}.options`).map((option, optionIndex) => normalizeOptionDefinition(option, `${id}.options[${optionIndex}]`));
    assertUniqueIds(options, `${id} option`);
    return { ...structuredClone(entry), id, owner, engine, spend, delivery, action, options, requirements: uniqueStrings(entry.requirements ?? [], `${id}.requirements`) };
  });
}

function normalizeOptionDefinition(option, field) {
  const id = requiredString(option.id, `${field}.id`);
  const type = requiredString(option.type, `${field}.type`);
  if (!OPTION_TYPES.has(type)) throw new Error(`${field}: unsupported option type ${type}`);
  if (type === 'select') {
    const choices = uniqueStrings(option.choices, `${field}.choices`);
    if (!choices.includes(option.default)) throw new Error(`${field}: default must be a listed choice`);
  }
  if (type === 'boolean' && typeof option.default !== 'boolean') throw new Error(`${field}: boolean default is required`);
  if (type === 'text' && typeof option.default !== 'string') throw new Error(`${field}: text default is required`);
  return structuredClone(option);
}

function normalizeTools(input) {
  const entries = objectArray(input, 'tools');
  assertUniqueIds(entries, 'tool');
  return entries.map((entry, index) => {
    const id = requiredString(entry.id, `tools[${index}].id`);
    if (!SIDE_EFFECTS.has(entry.sideEffect)) throw new Error(`${id}: unsupported side effect ${entry.sideEffect}`);
    if (typeof entry.confirmationRequired !== 'boolean') throw new Error(`${id}: confirmationRequired must be boolean`);
    return { ...structuredClone(entry), id, fields: objectArray(entry.fields ?? [], `${id}.fields`) };
  });
}

function normalizeWorkflow(input) {
  const entries = objectArray(input, 'agentWorkflow');
  assertUniqueIds(entries, 'agent workflow operation');
  return entries.map((entry, index) => {
    const id = requiredString(entry.id, `agentWorkflow[${index}].id`);
    if (!SIDE_EFFECTS.has(entry.sideEffect)) throw new Error(`${id}: unsupported side effect ${entry.sideEffect}`);
    if (typeof entry.confirmationRequired !== 'boolean') throw new Error(`${id}: confirmationRequired must be boolean`);
    return structuredClone(entry);
  });
}

function normalizeAction(input, field) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${field} must be an object`);
  if (!ACTION_KINDS.has(input.kind)) throw new Error(`${field}.kind must be execute or continue`);
  requiredString(input.label, `${field}.label`);
  if (input.kind === 'continue') requiredString(input.href, `${field}.href`);
  return structuredClone(input);
}

function validateAutomationRecipeReferences(policies, recipes) {
  const known = new Set(recipes.map((recipe) => recipe.id));
  for (const policy of policies) {
    for (const recipeId of policy.recipes) if (!known.has(recipeId)) throw new Error(`${policy.id}: unknown arsenal recipe ${recipeId}`);
  }
}

function objectArray(value, field) {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${field}[${index}] must be an object`);
  }
  return value;
}

function uniqueStrings(value, field) {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const result = value.map((entry, index) => requiredString(entry, `${field}[${index}]`));
  if (new Set(result).size !== result.length) throw new Error(`${field} must contain unique values`);
  return result;
}

function assertUniqueIds(entries, label) {
  const ids = entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} ids must be unique`);
}

function arrayFilter(value) {
  if (!value) return [];
  const entries = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(entries.map((entry) => String(entry).trim()).filter(Boolean))];
}

function findSecretField(value, prefix = '') {
  if (!value || typeof value !== 'object') return null;
  for (const [key, nested] of Object.entries(value)) {
    const field = prefix ? `${prefix}.${key}` : key;
    if (/(?:api.?key|credential|password|secret|token)/i.test(key)) return field;
    const found = findSecretField(nested, field);
    if (found) return found;
  }
  return null;
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredString(value, field) {
  const text = optionalString(value);
  if (!text) throw new Error(`${field} is required`);
  return text;
}
