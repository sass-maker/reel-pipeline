import { stat } from 'node:fs/promises';
import path from 'node:path';

import { executeComfyWorkflowRun } from '../adapters/comfy-local.js';
import { executeLtxMlxFinal } from '../adapters/ltx-mlx-final.js';
import {
  listLocalVideoWorkflowRecipes,
  resolveLocalVideoWorkflowRun,
  verifyWorkflowRecipeFiles,
} from '../local-video-workflow-recipes.js';

let localVideoTail = Promise.resolve();
const verificationCache = new Map();

export function createLocalVideoExecutors(options = {}) {
  return {
    'coherent-local-film': (request) => withLocalVideoSerial(() => executeCoherentLocalFilm(request, options)),
  };
}

export async function executeCoherentLocalFilm({ brief, inputs }, options = {}) {
  const recipeId = selectWorkflowRecipe(brief, inputs);
  const recipes = listLocalVideoWorkflowRecipes(options.recipeOptions);
  const recipe = recipes.find((entry) => entry.id === recipeId);
  if (!recipe) throw new Error(`unknown local workflow recipe: ${recipeId}`);
  if (!recipe.readiness.ready) {
    throw new Error(`${recipe.name} is not ready: ${recipe.readiness.blocker}`);
  }
  const verified = options.verifyRecipeFiles
    ? await options.verifyRecipeFiles(recipe, options.recipeOptions)
    : await verifyRecipeWithCache(recipe, options.recipeOptions);
  if (!verified.ready) throw new Error(`${recipe.name} model verification failed: ${verified.failures.join('; ')}`);
  const run = resolveLocalVideoWorkflowRun(recipeId, normalizeExecutorInputs(inputs, recipeId), options.recipeOptions);
  if (run.engine === 'comfy-local') return (options.executeComfy ?? executeComfyWorkflowRun)(run, options.comfy);
  return (options.executeLtxFinal ?? executeLtxMlxFinal)(run, options.ltx);
}

async function verifyRecipeWithCache(recipe, recipeOptions = {}) {
  const rootDir = path.resolve(recipeOptions.rootDir ?? process.cwd());
  const fingerprint = (await Promise.all(recipe.models.map(async (model) => {
    try {
      const details = await stat(path.resolve(rootDir, model.path));
      return `${model.path}:${details.size}:${details.mtimeMs}`;
    } catch {
      return `${model.path}:missing`;
    }
  }))).join('|');
  const cached = verificationCache.get(recipe.id);
  if (cached?.fingerprint === fingerprint) return cached.result;
  const result = await verifyWorkflowRecipeFiles(recipe, recipeOptions);
  verificationCache.set(recipe.id, { fingerprint, result });
  return result;
}

export function selectWorkflowRecipe(brief, inputs = {}) {
  if (inputs.workflowRecipeId) return String(inputs.workflowRecipeId);
  const modelProfileId = brief?.modelProfileId;
  if (modelProfileId === 'ltx-2b-comfy-preview') return 'ltx-2b-comfy-i2v-preview';
  if (modelProfileId && !['auto', 'ltx-2.3-mlx-q4'].includes(modelProfileId)) {
    throw new Error(`unsupported local video model profile: ${modelProfileId}`);
  }
  if (inputs.qualityLane === 'preview') return 'ltx-2b-comfy-i2v-preview';
  return 'ltx-2.3-mlx-q4-final';
}

function normalizeExecutorInputs(input, recipeId) {
  const shared = {
    prompt: input.prompt,
    referenceImage: input.referenceImage,
    seed: input.seed,
  };
  if (recipeId === 'ltx-2b-comfy-i2v-preview') {
    return {
      ...shared,
      width: input.width,
      height: input.height,
      frames: input.frames,
      motionStrength: input.motionStrength,
    };
  }
  return {
    ...shared,
    aspectRatio: input.aspectRatio,
    durationSeconds: input.durationSeconds,
    quality: input.quality,
  };
}

async function withLocalVideoSerial(task) {
  const previous = localVideoTail;
  let release;
  localVideoTail = new Promise((resolve) => { release = resolve; });
  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
  }
}
