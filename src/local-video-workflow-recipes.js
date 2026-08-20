import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import recipeConfig from '../config/local-video-workflow-recipes.json' with { type: 'json' };

const execFileAsync = promisify(execFile);
export const WORKFLOW_RECIPE_SCHEMA = 'fleet.local-video-workflow-recipes.v1';
export const WORKFLOW_RUN_SCHEMA = 'fleet.local-video-workflow-run.v1';
const ENGINES = new Set(['comfy-local', 'local-video-forge']);
const QUALITY_LANES = new Set(['preview', 'final', 'specialist']);

export function listLocalVideoWorkflowRecipes(options = {}) {
  const registry = validateWorkflowRecipeRegistry(options.registry ?? recipeConfig);
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  return registry.recipes.map((recipe) => ({
    ...structuredClone(recipe),
    graphSha256: recipe.graph ? deterministicHash(recipe.graph) : null,
    readiness: recipeReadiness(recipe, rootDir),
  }));
}

export function summarizeLocalVideoWorkflowRecipes(options = {}) {
  return listLocalVideoWorkflowRecipes(options).map(({ graph, ...recipe }) => ({
    ...recipe,
    graph: undefined,
    adjustableInputs: Object.entries(recipe.inputs).map(([id, definition]) => ({
      id,
      type: definition.type,
      required: definition.required === true,
      default: definition.default ?? null,
      min: definition.min ?? null,
      max: definition.max ?? null,
      values: definition.values ?? null,
    })),
  }));
}

export function validateWorkflowRecipeRegistry(input) {
  if (input?.$schema !== WORKFLOW_RECIPE_SCHEMA || !Number.isInteger(input.version)) {
    throw new Error(`workflow recipe registry must use ${WORKFLOW_RECIPE_SCHEMA}`);
  }
  if (!Array.isArray(input.allowedComfyNodes) || input.allowedComfyNodes.length === 0) {
    throw new Error('allowedComfyNodes must contain at least one node type');
  }
  if (!Array.isArray(input.recipes) || input.recipes.length === 0) throw new Error('recipes are required');
  const ids = new Set();
  const allowlist = new Set(input.allowedComfyNodes);
  for (const recipe of input.recipes) {
    requiredString(recipe.id, 'recipe.id');
    if (ids.has(recipe.id)) throw new Error(`duplicate workflow recipe id: ${recipe.id}`);
    ids.add(recipe.id);
    if (!Number.isInteger(recipe.version) || recipe.version < 1) throw new Error(`${recipe.id}: version must be a positive integer`);
    if (!ENGINES.has(recipe.engine)) throw new Error(`${recipe.id}: unsupported engine ${recipe.engine}`);
    if (!QUALITY_LANES.has(recipe.qualityLane)) throw new Error(`${recipe.id}: unsupported quality lane`);
    if (typeof recipe.autoEligible !== 'boolean') throw new Error(`${recipe.id}: autoEligible must be boolean`);
    requiredString(recipe.source?.url, `${recipe.id}.source.url`);
    requiredString(recipe.source?.revision, `${recipe.id}.source.revision`);
    requiredString(recipe.runtime?.path, `${recipe.id}.runtime.path`);
    requiredString(recipe.runtime?.revision, `${recipe.id}.runtime.revision`);
    if (!Array.isArray(recipe.models) || recipe.models.length === 0) throw new Error(`${recipe.id}: models are required`);
    for (const model of recipe.models) {
      requiredString(model.id, `${recipe.id}.model.id`);
      requiredString(model.path, `${recipe.id}.${model.id}.path`);
      requiredString(model.revision, `${recipe.id}.${model.id}.revision`);
      requiredString(model.license, `${recipe.id}.${model.id}.license`);
      if (model.sha256 != null && !/^[a-f0-9]{64}$/i.test(model.sha256)) throw new Error(`${recipe.id}.${model.id}.sha256 is invalid`);
    }
    if (!recipe.inputs || typeof recipe.inputs !== 'object') throw new Error(`${recipe.id}: inputs are required`);
    for (const [name, definition] of Object.entries(recipe.inputs)) validateInputDefinition(recipe, name, definition);
    if (recipe.engine === 'comfy-local' && recipe.graph) validateComfyGraph(recipe.graph, allowlist);
    if (recipe.autoEligible && recipe.blocker) {
      throw new Error(`${recipe.id}: blocked recipe cannot be auto eligible`);
    }
    if (recipe.resourceEnvelope?.maxDiskPercent !== 85 || recipe.resourceEnvelope?.maxRamPercent !== 90 || recipe.resourceEnvelope?.serial !== true) {
      throw new Error(`${recipe.id}: resource envelope must enforce 85 percent disk, 90 percent RAM, and serial execution`);
    }
  }
  return input;
}

export function validateComfyGraph(graph, allowedNodes) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) throw new Error('Comfy graph must be an object');
  const allowlist = allowedNodes instanceof Set ? allowedNodes : new Set(allowedNodes);
  for (const [nodeId, node] of Object.entries(graph)) {
    const classType = requiredString(node?.class_type, `graph.${nodeId}.class_type`);
    if (!allowlist.has(classType)) throw new Error(`unsupported Comfy node: ${classType}`);
    if (!node.inputs || typeof node.inputs !== 'object' || Array.isArray(node.inputs)) throw new Error(`graph.${nodeId}.inputs must be an object`);
  }
  return graph;
}

export function resolveLocalVideoWorkflowRun(recipeId, rawInputs = {}, options = {}) {
  const registry = validateWorkflowRecipeRegistry(options.registry ?? recipeConfig);
  const recipe = registry.recipes.find((entry) => entry.id === recipeId);
  if (!recipe) throw new Error(`unknown workflow recipe: ${recipeId}`);
  if (recipe.blocker && !options.allowBlocked) throw new Error(`${recipe.name} is not runnable: ${recipe.blocker}`);
  const unknown = Object.keys(rawInputs).filter((name) => !(name in recipe.inputs));
  if (unknown.length) throw new Error(`unknown workflow inputs: ${unknown.join(', ')}`);
  const inputs = {};
  for (const [name, definition] of Object.entries(recipe.inputs)) {
    const value = rawInputs[name] ?? definition.default;
    inputs[name] = normalizeInput(name, value, definition);
  }
  const graph = recipe.graph ? patchGraph(recipe, inputs) : null;
  const graphSha256 = graph ? deterministicHash(graph) : null;
  const inputSignature = deterministicHash({
    recipeId: recipe.id,
    recipeVersion: recipe.version,
    engine: recipe.engine,
    qualityLane: recipe.qualityLane,
    runtimeRevision: recipe.runtime.revision,
    models: recipe.models.map(({ id, revision, sha256 }) => ({ id, revision, sha256 })),
    inputs,
    graphSha256,
  });
  return {
    schema: WORKFLOW_RUN_SCHEMA,
    recipeId: recipe.id,
    recipeVersion: recipe.version,
    engine: recipe.engine,
    modelProfileId: recipe.modelProfileId,
    qualityLane: recipe.qualityLane,
    inputs,
    graph,
    graphSha256,
    inputSignature,
    provenance: {
      source: structuredClone(recipe.source),
      runtime: structuredClone(recipe.runtime),
      models: structuredClone(recipe.models),
    },
    resourceEnvelope: structuredClone(recipe.resourceEnvelope),
  };
}

export async function verifyWorkflowRecipeFiles(recipe, options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const hashFile = options.hashFile ?? sha256File;
  const failures = [];
  for (const model of recipe.models ?? []) {
    const absolutePath = path.resolve(rootDir, model.path);
    try {
      await access(absolutePath);
    } catch {
      failures.push(`missing model: ${model.path}`);
      continue;
    }
    if (!model.sha256) {
      failures.push(`model hash not captured: ${model.path}`);
      continue;
    }
    const actual = await hashFile(absolutePath);
    if (actual !== model.sha256) failures.push(`stale model hash: ${model.path}`);
  }
  return { ready: failures.length === 0 && !recipe.blocker, failures: recipe.blocker ? [...failures, recipe.blocker] : failures };
}

export async function extractComfyPromptFromMp4(filePath, options = {}) {
  const execute = options.execFile ?? execFileAsync;
  const { stdout } = await execute('ffprobe', [
    '-v', 'error', '-show_entries', 'format_tags=prompt', '-of', 'json', path.resolve(filePath),
  ], { maxBuffer: 32 * 1024 * 1024 });
  const output = JSON.parse(stdout);
  const encoded = output?.format?.tags?.prompt;
  if (!encoded) throw new Error('MP4 does not contain Comfy prompt metadata');
  const graph = JSON.parse(encoded);
  const registry = validateWorkflowRecipeRegistry(options.registry ?? recipeConfig);
  validateComfyGraph(graph, new Set(registry.allowedComfyNodes));
  return { graph, graphSha256: deterministicHash(graph), sourcePath: path.resolve(filePath) };
}

export function deterministicHash(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function patchGraph(recipe, inputs) {
  const graph = structuredClone(recipe.graph);
  for (const [name, definition] of Object.entries(recipe.inputs)) {
    if (!definition.target) continue;
    const node = graph[definition.target.node];
    if (!node) throw new Error(`${recipe.id}: input ${name} targets missing node ${definition.target.node}`);
    if (!(definition.target.field in node.inputs)) throw new Error(`${recipe.id}: input ${name} targets missing field ${definition.target.field}`);
    node.inputs[definition.target.field] = definition.target.basenameOnly ? path.basename(inputs[name]) : inputs[name];
    delete node.is_changed;
  }
  return graph;
}

function recipeReadiness(recipe, rootDir) {
  const missing = [recipe.runtime.path, ...recipe.models.map((model) => model.path)]
    .filter((candidate) => !existsSync(path.resolve(rootDir, candidate)));
  const unhashed = recipe.models.filter((model) => !model.sha256).map((model) => model.path);
  const blocker = recipe.blocker ?? (missing.length ? `Missing ${missing.join(', ')}.` : unhashed.length ? `Model hash not captured for ${unhashed.join(', ')}.` : null);
  return { ready: !blocker, state: blocker ? 'blocked' : 'ready', blocker, missing, unhashed };
}

function validateInputDefinition(recipe, name, definition) {
  if (!['string', 'path', 'number', 'integer', 'enum'].includes(definition?.type)) throw new Error(`${recipe.id}.${name}: invalid input type`);
  if (definition.type === 'enum' && (!Array.isArray(definition.values) || !definition.values.length)) throw new Error(`${recipe.id}.${name}: enum values are required`);
  if (definition.target && (!definition.target.node || !definition.target.field)) throw new Error(`${recipe.id}.${name}: target node and field are required`);
}

function normalizeInput(name, value, definition) {
  if (value == null || value === '') {
    if (definition.required) throw new Error(`${name} is required`);
    return null;
  }
  if (definition.type === 'string' || definition.type === 'path') {
    const text = String(value).trim();
    if (definition.minLength && text.length < definition.minLength) throw new Error(`${name} must contain at least ${definition.minLength} characters`);
    if (definition.maxLength && text.length > definition.maxLength) throw new Error(`${name} must contain at most ${definition.maxLength} characters`);
    return text;
  }
  if (definition.type === 'enum') {
    if (!definition.values.includes(value)) throw new Error(`${name} must be one of ${definition.values.join(', ')}`);
    return value;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || (definition.type === 'integer' && !Number.isInteger(number))) throw new Error(`${name} must be ${definition.type}`);
  if (definition.min != null && number < definition.min) throw new Error(`${name} must be at least ${definition.min}`);
  if (definition.max != null && number > definition.max) throw new Error(`${name} must be at most ${definition.max}`);
  if (definition.multipleOf && number % definition.multipleOf !== 0) throw new Error(`${name} must be a multiple of ${definition.multipleOf}`);
  if (definition.multipleOfOffset && (number - definition.multipleOfOffset.offset) % definition.multipleOfOffset.multiple !== 0) {
    throw new Error(`${name} must equal ${definition.multipleOfOffset.offset} plus a multiple of ${definition.multipleOfOffset.multiple}`);
  }
  return number;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}
