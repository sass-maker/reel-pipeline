import { stat } from 'node:fs/promises';
import { probeVideo } from './quality.js';

export async function buildStudioHistory(briefs, options = {}) {
  const fileStat = options.fileStat ?? stat;
  const videoProber = options.probeVideo ?? probeVideo;
  const entries = await Promise.all((briefs ?? []).map(async (brief) => {
    const videoPath = brief.media?.videoPath ?? null;
    const evidence = videoPath ? await inspectStudioVideo(videoPath, { fileStat, videoProber }) : { video: null, reason: null };
    const proposal = brief.workflowProposal;
    const executedWorkflow = brief.media?.execution?.workflow;
    return {
      id: brief.id,
      title: brief.title,
      prompt: brief.request,
      createdAt: brief.createdAt,
      updatedAt: brief.updatedAt,
      lifecycle: brief.lifecycle,
      projectSlug: brief.projectSlug,
      sampleId: brief.id.startsWith('sample_') ? brief.id.slice('sample_'.length) : null,
      workflow: executedWorkflow ? structuredClone(executedWorkflow) : proposal ? {
        id: proposal.id,
        version: proposal.version,
        state: proposal.state,
        archetypeId: proposal.archetypeId,
        archetypeVersion: proposal.archetypeVersion,
        name: proposal.name,
        lane: proposal.lane,
        compiledPrompt: proposal.compiledPrompt,
        recipeId: proposal.binding.workflowRecipeId,
        recipeVersion: proposal.binding.recipeVersion,
        modelProfileId: proposal.binding.modelProfileId,
        runtime: proposal.binding.engine,
        seed: proposal.inputs.seed,
        aspectRatio: proposal.inputs.aspectRatio,
        durationSeconds: proposal.inputs.durationSeconds,
        phases: proposal.phases.map((phase) => ({
          id: phase.id,
          name: phase.name,
          owner: phase.owner,
          detail: phase.detail,
          status: phase.status,
        })),
      } : null,
      video: evidence.video,
      videoUnavailableReason: evidence.reason,
      receiptPath: brief.media?.execution?.evidence?.ownerManifestPath
        ?? brief.media?.manifestPath
        ?? null,
      quality: brief.media?.quality ?? null,
      reviewDecision: brief.approval?.reviewDecision ?? 'pending',
      lastError: brief.lastError ?? null,
    };
  }));
  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function summarizeRecipeLibrary(recipes, workflowRecipes = []) {
  return {
    recipes: recipes.map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      description: recipe.description,
      kind: recipe.kind,
      owner: recipe.owner,
      runtime: recipe.runtime,
      delivery: recipe.delivery,
      spend: recipe.spend,
      readiness: recipe.readiness,
      channels: [...recipe.channels],
      defaults: structuredClone(recipe.defaults),
      controls: recipe.options.map((option) => ({
        id: option.id,
        label: option.label,
        type: option.type,
        choices: option.choices ? [...option.choices] : null,
      })),
      variantCount: recipe.variants.length,
    })),
    workflowRecipes: workflowRecipes.map((recipe) => structuredClone(recipe)),
  };
}

export async function inspectStudioVideo(videoPath, options = {}) {
  const fileStat = options.fileStat ?? stat;
  const videoProber = options.videoProber ?? options.probeVideo ?? probeVideo;
  try {
    const details = await fileStat(videoPath);
    if (!details.isFile() || details.size < 1) return { video: null, reason: 'The saved video artifact is missing or empty.' };
    const probe = await videoProber(videoPath);
    if (!probe?.ok) return { video: null, reason: 'The saved artifact is not a decodable video.' };
    return {
      video: {
        path: videoPath,
        bytes: details.size,
        contentType: 'video/mp4',
        durationSeconds: probe.durationSeconds,
        width: probe.width,
        height: probe.height,
        hasAudio: probe.hasAudio,
      },
      reason: null,
    };
  } catch {
    return { video: null, reason: 'The saved video artifact is unavailable.' };
  }
}
