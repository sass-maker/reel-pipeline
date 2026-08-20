import { generateIdeas, exploreNiche, suggestChannelNames } from './ideas.js';
import { generateTitles, generateDescription, generateTags, organizeTags } from './metadata.js';
import { generateScript } from './script.js';
import { deriveVoiceProfile } from './brand-voice.js';
import { researchKeywords } from './keywords.js';
import { fetchTranscript } from './transcript.js';
import { generateThumbnailConcepts } from './thumbnails.js';
import { IdeaStore } from './idea-store.js';
import { runFacelessWorkflow } from './workflow.js';
import { renderLyricVideo } from '../lyric-video/compositor.js';
import { probeBlenderVideo } from '../adapters/blender.js';
import { probeHtmlComposition } from '../adapters/html-composition.js';
import { probeKokoroComposeReadiness } from '../adapters/kokoro-compose.js';
import { createPlatformAudioPreview } from '../platform-audio.js';
import { planIdeas, produceNext, factoryStatus } from './factory.js';
import { loadAutomationPolicies } from './automation-policy.js';
import { runStudioAutopilot, studioAutopilotStatus } from './autopilot.js';
import { buildStudioArsenal } from './arsenal.js';
import {
  MarketingBriefStore,
  generateMarketingBriefDraft,
  refineMarketingBriefDraft,
} from './briefs.js';
import { continuationForBrief, evaluateStudioCapability, listStudioCapabilities } from './capabilities.js';
import {
  getProductionRecipe,
  listProductionProjects,
  listProductionRecipes,
  normalizeRecipeOptions,
  productionActions,
} from './production-catalog.js';
import {
  buildStudioDistributionBundle,
  createStudioPostizDraft,
  studioPostizReadiness,
  submitStudioPostiz,
} from './distribution.js';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  listExploreGallery,
  listRepresentativeExploreGallery,
  openExploreGalleryMedia,
  openRepresentativeExploreGalleryMedia,
  openRepresentativeExploreGalleryPoster,
} from './explore-gallery.js';
import { executeVideoVariant } from './video-execution.js';
import {
  CharacterDirectoryStore,
  compileCastPrompt,
  validateMatureCast,
  validateMatureConcept,
} from './character-directory.js';
import { probeVoiceTranscription, saveVoiceRecording, transcribeVoiceRecording } from './voice-intake.js';
import { soundtrackReadiness } from './soundtrack.js';
import { GENERATIVE_MEDIA_POLICY, generativeMediaBlocker } from './generation-policy.js';
import { runRegisteredWorkflowStage } from './workflow-runner.js';
import { getExecutionAdapter, missingExecutionInputs, VIDEO_EXECUTION_SCHEMA } from './execution-registry.js';
import { executeVideoMix } from './video-mix.js';
import { listModelProfiles, listThemePacks, resolveModelProfile, resolveThemePack } from './model-options.js';
import { summarizeLocalVideoWorkflowRecipes } from '../local-video-workflow-recipes.js';
import { buildStudioHistory, inspectStudioVideo, summarizeRecipeLibrary } from './studio-libraries.js';
import {
  freezeWorkflowProposal,
  inspectWorkflowProposal,
  listWorkflowArchetypes,
  proposeStudioWorkflow,
  reviseStudioWorkflowProposal,
  workflowProposalBriefPatch,
} from './workflow-proposals.js';
import { interruptComfyLocal } from '../adapters/comfy-local.js';
import {
  assembleLocalEpisode,
  createEpisodeDraft,
  listLocalEpisodes,
  loadLocalEpisode,
  saveLocalEpisode,
  setEpisodeShotReview,
} from '../local-video-episode.js';

const FACELESS_ENGINES = new Set(['mock', 'kokoro']);

export function toolHandlers(options = {}) {
  const llm = options.llm;
  const store = () => options.ideaStore ?? new IdeaStore(options.ideaStoreOptions);
  return {
    ideas: (body) => generateIdeas({ niche: body.niche, count: body.count, llm }),
    niche: (body) => exploreNiche({ niche: body.niche, llm }),
    channel: (body) => suggestChannelNames({ niche: body.niche, count: body.count, llm }),
    titles: (body) => generateTitles({ topic: body.topic, count: body.count, llm }),
    description: (body) => generateDescription({ topic: body.topic, hook: body.hook, cta: body.cta, llm }),
    tags: (body) => generateTags({ topic: body.topic, niche: body.niche, llm }),
    organize: (body) => organizeTags(Array.isArray(body.tags) ? body.tags : String(body.tags ?? '').split(',')),
    script: (body) => generateScript({
      topic: body.topic,
      durationSeconds: body.durationSeconds ?? body.duration,
      niche: body.niche,
      article: body.article,
      inspiration: body.inspiration,
      voiceProfile: body.voiceProfile,
      llm,
    }),
    voice: (body) => deriveVoiceProfile({
      transcripts: Array.isArray(body.samples) ? body.samples : [body.samples],
      llm,
    }),
    keywords: (body) => researchKeywords({ seed: body.seed, fetchImpl: options.fetchImpl ?? fetch }),
    transcript: (body) => fetchTranscript({ url: body.url, fetchImpl: options.fetchImpl ?? fetch }),
    thumbnails: (body) => generateThumbnailConcepts({ topic: body.topic, count: body.count, llm }),
    plan: (body) => planIdeas({ niche: body.niche, count: body.count, store: options.ideaStore, llm }),
    produce: (body) => produceNext({
      count: body.count,
      engine: FACELESS_ENGINES.has(body.engine) ? body.engine : 'kokoro',
      durationSeconds: body.durationSeconds ?? body.duration,
      store: options.ideaStore,
      outputDir: options.facelessOutputDir,
      rendererOptions: options.rendererOptions ?? {},
      llm,
      logger: options.logger ?? console,
    }),
    save: (body) => store().saveIdea(body),
    status: (body) => store().updateIdeaStatus(body.id, body.to ?? body.status),
    faceless: (body) => runFacelessWorkflow({
      topic: body.topic,
      niche: body.niche,
      durationSeconds: body.durationSeconds ?? body.duration,
      engine: FACELESS_ENGINES.has(body.engine) ? body.engine : 'mock',
      voice: body.voice,
      voiceRotation: Boolean(body.voiceRotation),
      voiceProfile: body.voiceProfile,
      outputDir: options.facelessOutputDir,
      ideaStore: options.ideaStore,
      rendererOptions: options.rendererOptions ?? {},
      llm,
      logger: options.logger ?? console,
    }),
  };
}

function artifactRoots(options) {
  const roots = options.artifactRoots ?? [
    path.resolve('tmp/studio'),
    path.resolve('artifacts'),
    path.resolve('fixtures/video-gallery/videos'),
  ];
  return roots.map((root) => path.resolve(root));
}

function isInsideArtifactRoots(filePath, options) {
  const resolved = path.resolve(String(filePath ?? ''));
  return artifactRoots(options).some((root) => resolved === root || resolved.startsWith(root + path.sep));
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export async function listRenders(options) {
  const store = options.ideaStore ?? new IdeaStore(options.ideaStoreOptions);
  const ideas = await store.listIdeas();
  const renders = [];
  for (const idea of ideas) {
    if (idea.status !== 'rendered' && idea.status !== 'posted') continue;
    const artifactDir = idea.notes?.match(/artifacts: (.+)$/)?.[1];
    if (!artifactDir) continue;
    const render = await readJsonIfPresent(path.join(artifactDir, 'render.json'));
    const quality = await readJsonIfPresent(path.join(artifactDir, 'quality.json'));
    renders.push({
      ideaId: idea.id,
      title: idea.title,
      status: idea.status,
      updatedAt: idea.updatedAt,
      video: render?.videos?.[0] ?? null,
      provider: render?.provider ?? null,
      quality: quality ? { overall: quality.overall, verdict: quality.verdict, videoEvidence: quality.videoEvidence } : null,
      artifactDir,
    });
  }
  renders.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return renders;
}

const FILE_TYPES = {
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

async function serveRenderFile(rawPath, options) {
  const resolved = path.resolve(String(rawPath ?? ''));
  const roots = artifactRoots(options);
  if (!roots.some((root) => resolved === root || resolved.startsWith(root + path.sep))) {
    return { status: 403, body: { error: 'path outside artifact roots' } };
  }
  const type = FILE_TYPES[path.extname(resolved).toLowerCase()];
  if (!type) return { status: 403, body: { error: 'unsupported file type' } };
  try {
    const info = await stat(resolved);
    if (!info.isFile() || info.size < 1) throw new Error('not a file');
    return { status: 200, raw: { path: resolved, size: info.size, filename: path.basename(resolved), contentType: type } };
  } catch {
    return { status: 404, body: { error: 'file not found' } };
  }
}

export async function handleStudioRequest(method, pathname, readBody, options = {}, query = {}) {
  if (!pathname.startsWith('/studio/')) return null;
  const tool = pathname.slice('/studio/'.length);
  if (method === 'GET' && tool === 'explore-gallery') {
    return { status: 200, body: { data: await listExploreGallery(options) } };
  }
  if (method === 'GET' && tool === 'explore-gallery/representatives') {
    return { status: 200, body: { data: await listRepresentativeExploreGallery(options) } };
  }
  const representativeMediaMatch = tool.match(/^explore-gallery\/representatives\/([^/]+)\/media$/);
  if (method === 'GET' && representativeMediaMatch) {
    const raw = await openRepresentativeExploreGalleryMedia(decodeURIComponent(representativeMediaMatch[1]), options);
    return raw ? { status: 200, raw } : { status: 404, body: { error: 'representative gallery sample not found' } };
  }
  const representativePosterMatch = tool.match(/^explore-gallery\/representatives\/([^/]+)\/poster$/);
  if (method === 'GET' && representativePosterMatch) {
    const raw = await openRepresentativeExploreGalleryPoster(decodeURIComponent(representativePosterMatch[1]), options);
    return raw ? { status: 200, raw } : { status: 404, body: { error: 'representative gallery poster not found' } };
  }
  if (method === 'GET' && tool === 'model-options') {
    return {
      status: 200,
      body: { data: {
        themePacks: listThemePacks(),
        modelProfiles: listModelProfiles(options.modelOptions),
        workflowRecipes: projectedWorkflowRecipes(options),
        generationPolicy: GENERATIVE_MEDIA_POLICY,
      } },
    };
  }
  if (method === 'GET' && tool === 'workflow-library') {
    return { status: 200, body: { data: listWorkflowArchetypes(workflowProposalOptions(options)) } };
  }
  const galleryMediaMatch = tool.match(/^explore-gallery\/([^/]+)\/media$/);
  if (method === 'GET' && galleryMediaMatch) {
    const raw = await openExploreGalleryMedia(decodeURIComponent(galleryMediaMatch[1]), options);
    return raw ? { status: 200, raw } : { status: 404, body: { error: 'gallery sample not found' } };
  }
  const briefStore = () => options.briefStore ?? new MarketingBriefStore({
    ...options.briefStoreOptions,
    workflowProposalOptions: workflowProposalOptions(options),
  });
  const characterStore = () => options.characterStore ?? new CharacterDirectoryStore(options.characterStoreOptions);
  await ensureProductionReadiness(options);

  if (method === 'GET' && tool === 'history') {
    return { status: 200, body: { data: await buildStudioHistory(await briefStore().list(), options.historyOptions) } };
  }
  if (method === 'GET' && tool === 'recipe-library') {
    return {
      status: 200,
      body: {
        data: summarizeRecipeLibrary(
          listProductionRecipes(productionContext(options)),
          projectedWorkflowRecipes(options),
        ),
      },
    };
  }

  if (method === 'GET' && tool === 'episodes') {
    return { status: 200, body: { data: await listLocalEpisodes(options.episodeStoreOptions) } };
  }
  if (method === 'POST' && tool === 'episodes') {
    const body = await readBody();
    const episode = createEpisodeDraft({
      ...body,
      soundtrack: body?.soundtrack ?? { lane: 'procedural-draft', bpm: 116 },
    });
    return { status: 201, body: { data: await saveLocalEpisode(episode, options.episodeStoreOptions) } };
  }
  if (method === 'POST' && tool === 'local-video/interrupt') {
    const body = await readBody();
    if (body?.confirm !== true) throw new Error('explicit local interrupt confirmation is required');
    return { status: 200, body: { data: await interruptComfyLocal(options.localVideoExecutionOptions?.comfy) } };
  }
  const episodeMatch = tool.match(/^episodes\/([^/]+)$/);
  if (episodeMatch && method === 'GET') {
    const episode = await loadLocalEpisode(decodeURIComponent(episodeMatch[1]), options.episodeStoreOptions);
    return episode ? { status: 200, body: { data: episode } } : { status: 404, body: { error: 'episode not found' } };
  }
  if (episodeMatch && method === 'PATCH') {
    const current = await loadLocalEpisode(decodeURIComponent(episodeMatch[1]), options.episodeStoreOptions);
    if (!current) return { status: 404, body: { error: 'episode not found' } };
    const body = await readBody();
    return { status: 200, body: { data: await saveLocalEpisode({ ...current, ...body, id: current.id }, options.episodeStoreOptions) } };
  }
  const episodeRenderMatch = tool.match(/^episodes\/([^/]+)\/render$/);
  if (episodeRenderMatch && method === 'POST') {
    const body = await readBody();
    if (body?.confirm !== true) throw new Error('explicit local episode render confirmation is required');
    throw new Error(generativeMediaBlocker('Local episode'));
  }
  const episodeReviewMatch = tool.match(/^episodes\/([^/]+)\/shots\/([^/]+)\/review$/);
  if (episodeReviewMatch && method === 'POST') {
    const body = await readBody();
    const episode = await loadLocalEpisode(decodeURIComponent(episodeReviewMatch[1]), options.episodeStoreOptions);
    if (!episode?.run) return { status: 404, body: { error: 'episode run not found' } };
    const receiptPath = path.join(episode.episodeDir, 'episode-run.json');
    const run = await setEpisodeShotReview(episode.run, decodeURIComponent(episodeReviewMatch[2]), body?.reviewState, { receiptPath });
    return { status: 200, body: { data: run } };
  }
  const episodeAssemblyMatch = tool.match(/^episodes\/([^/]+)\/assemble$/);
  if (episodeAssemblyMatch && method === 'POST') {
    const body = await readBody();
    if (body?.confirm !== true) throw new Error('explicit local episode assembly confirmation is required');
    const episode = await loadLocalEpisode(decodeURIComponent(episodeAssemblyMatch[1]), options.episodeStoreOptions);
    if (!episode?.run) return { status: 404, body: { error: 'episode run not found' } };
    const result = await assembleLocalEpisode(episode.run, {
      outputDir: episode.episodeDir,
      ...(options.episodeAssemblyOptions ?? {}),
    });
    return { status: 200, body: { data: result } };
  }

  if (method === 'GET' && tool === 'voice-readiness') {
    return { status: 200, body: { data: await probeVoiceTranscription(options.voiceIntakeOptions) } };
  }
  if (method === 'POST' && tool === 'voice-intake') {
    const body = await readBody();
    const voiceOptions = options.voiceIntakeOptions ?? {};
    const recording = await saveVoiceRecording(body, voiceOptions);
    const readiness = await probeVoiceTranscription(voiceOptions);
    if (!readiness.ready) {
      return { status: 409, body: { error: readiness.blocker, data: { recording, readiness } } };
    }
    const transcription = await transcribeVoiceRecording(recording, { ...voiceOptions, readiness });
    return { status: 201, body: { data: transcription } };
  }
  if (method === 'GET' && tool === 'characters') {
    return { status: 200, body: { data: await characterStore().list() } };
  }
  if (method === 'POST' && tool === 'characters') {
    const body = await readBody();
    return { status: 201, body: { data: await characterStore().create(body ?? {}) } };
  }
  const characterMatch = tool.match(/^characters\/([^/]+)$/);
  if (characterMatch && method === 'PATCH') {
    const body = await readBody();
    return { status: 200, body: { data: await characterStore().update(decodeURIComponent(characterMatch[1]), body ?? {}) } };
  }

  if (method === 'GET' && tool === 'arsenal') {
    const brief = query.briefId ? await briefStore().get(query.briefId) : null;
    if (query.briefId && !brief) return { status: 404, body: { error: 'marketing brief not found' } };
    const blenderCapability = options.blenderCapability ?? await probeBlenderVideo(options.blender ?? {});
    options.blenderCapability = blenderCapability;
    const recipeContext = { ...productionContext(options), brief };
    const data = await buildStudioArsenal({
      brief,
      filters: query,
      supportedToolIds: Object.keys(toolHandlers(options)),
      automationRegistry: options.automationRegistry,
      automationPolicyOptions: options.automationPolicyOptions,
      recipeContext,
      capabilityOptions: capabilityOptions(options),
      modelOptions: options.modelOptions,
    });
    return { status: 200, body: { data } };
  }
  if (method === 'GET' && tool === 'capabilities') {
    const brief = query.briefId ? await briefStore().get(query.briefId) : null;
    if (query.briefId && !brief) return { status: 404, body: { error: 'marketing brief not found' } };
    return {
      status: 200,
      body: { data: listStudioCapabilities(brief, capabilityOptions(options)) },
    };
  }
  if (method === 'GET' && tool === 'blender-readiness') {
    const capability = options.blenderCapability ?? await probeBlenderVideo(options.blender ?? {});
    options.blenderCapability = capability;
    return { status: 200, body: { data: capability } };
  }
  if (method === 'GET' && tool === 'production-planner') {
    const store = options.ideaStore ?? new IdeaStore(options.ideaStoreOptions);
    const blenderCapability = options.blenderCapability ?? await probeBlenderVideo(options.blender ?? {});
    options.blenderCapability = blenderCapability;
    const context = productionContext(options);
    return {
      status: 200,
      body: {
        data: {
          projects: listProductionProjects(),
          ideas: query.projectSlug ? await store.listIdeas({ projectSlug: query.projectSlug, lane: 'operator-request' }) : [],
          recipes: listProductionRecipes(context),
          themePacks: listThemePacks(),
          modelProfiles: listModelProfiles(options.modelOptions),
          workflowRecipes: projectedWorkflowRecipes(options),
        },
      },
    };
  }
  if (method === 'GET' && tool === 'autopilot/policies') {
    const registry = options.automationRegistry ?? await loadAutomationPolicies(options.automationPolicyOptions);
    return { status: 200, body: { data: registry } };
  }
  if (method === 'GET' && ['autopilot/status', 'autopilot/runs', 'autopilot/exceptions'].includes(tool)) {
    const status = await studioAutopilotStatus({
      ideaStore: options.ideaStore,
      ideaStoreOptions: options.ideaStoreOptions,
    });
    if (tool === 'autopilot/runs') return { status: 200, body: { data: status.runs } };
    if (tool === 'autopilot/exceptions') return { status: 200, body: { data: status.exceptions } };
    return { status: 200, body: { data: status } };
  }
  if (method === 'POST' && tool === 'autopilot/run') {
    const body = await readBody();
    if (body?.confirm !== true) throw new Error('explicit local autopilot invocation confirmation is required');
    if (Boolean(body.policy) === Boolean(body.all)) throw new Error('select exactly one automation policy or all policies');
    const runner = options.autopilotRunner ?? runStudioAutopilot;
    const data = await runner({
      policy: body.policy,
      all: body.all === true,
      execute: body.execute === true,
      count: body.count,
      registry: options.automationRegistry,
      policyOptions: options.automationPolicyOptions,
      ideaStore: options.ideaStore,
      briefStore: options.briefStore,
      fleetRoot: options.fleetRoot,
      outputDir: options.autopilotOutputDir ?? options.facelessOutputDir,
      rendererOptions: options.rendererOptions,
      artifactOptions: options.artifactOptions,
      postizClient: options.postizClient,
      now: options.now,
      logger: options.logger,
    });
    return { status: 200, body: { data } };
  }
  if (method === 'POST' && tool === 'project-ideas') {
    const body = await readBody();
    const idea = await (options.ideaStore ?? new IdeaStore(options.ideaStoreOptions)).saveIdea({
      projectSlug: body?.projectSlug,
      title: body?.title,
      angle: body?.angle,
      hook: body?.hook,
      format: body?.format,
      notes: body?.notes,
    });
    return { status: 201, body: { data: idea } };
  }
  if (method === 'POST' && tool === 'production-plans') {
    const body = await readBody();
    const ideaStore = options.ideaStore ?? new IdeaStore(options.ideaStoreOptions);
    const idea = (await ideaStore.listIdeas({ projectSlug: body?.projectSlug }))
      .find((entry) => entry.id === body?.ideaId);
    if (!idea) throw new Error('select an idea that belongs to the selected Fleet project');
    const recipe = getProductionRecipe(body?.recipeId, productionContext(options));
    const recipeOptions = normalizeRecipeOptions(recipe.id, body?.options ?? {});
    const evidence = body?.evidence ?? {};
    const brief = await briefStore().create({
      request: `Create ${recipe.name} for ${idea.title}.`,
      generation: { source: 'template', provider: null },
      messages: [],
      projectSlug: body.projectSlug,
      ideaId: idea.id,
      recipeId: recipe.id,
      recipeOptions,
      themePackId: body?.themePackId ?? 'auto',
      modelProfileId: body?.modelProfileId ?? 'auto',
      modelPriorities: body?.modelPriorities,
      contentScope: body?.contentScope,
      themeRightsEvidence: body?.themeRightsEvidence,
      kind: recipe.kind,
      engine: recipe.engine,
      channel: recipeOptions.channel,
      durationSeconds: recipeOptions.durationSeconds,
      title: idea.title,
      hook: idea.hook ?? idea.angle ?? idea.title,
      summary: idea.notes ?? idea.angle ?? idea.title,
      creativeDirection: productionDirection(recipe, recipeOptions),
      sourceEvidence: {
        canonicalUrl: evidence.canonicalUrl ?? null,
        claim: evidence.claim ?? null,
        destinationUrl: evidence.destinationUrl ?? null,
        rightsStatus: evidence.rightsStatus ?? 'unknown',
      },
    });
    return { status: 201, body: { data: decorateBrief(brief, options) } };
  }
  if (method === 'GET' && tool === 'briefs') {
    const briefs = await briefStore().list();
    return { status: 200, body: { data: briefs.map((brief) => decorateBrief(brief, options)) } };
  }
  if (method === 'POST' && tool === 'briefs') {
    const body = await readBody();
    const draft = body?.request
      ? await generateMarketingBriefDraft(body.request, { llm: options.llm, now: options.now })
      : body;
    const fields = { ...(body?.fields ?? {}) };
    if (body?.source || body?.mode) {
      fields.workflow = { ...(fields.workflow ?? {}), ...(body?.source ? { source: body.source } : {}), mode: body?.mode ?? fields.workflow?.mode };
    }
    const proposal = proposeStudioWorkflow({
      request: draft.request,
      lane: fields.modelProfileId === 'ltx-2b-comfy-preview' ? 'preview' : undefined,
      referenceImage: fields.executionInputs?.referenceImage,
      aspectRatio: fields.executionInputs?.aspectRatio,
      durationSeconds: fields.executionInputs?.durationSeconds,
      seed: fields.executionInputs?.seed,
    }, workflowProposalOptions(options));
    const brief = await briefStore().create({ ...draft, ...fields, workflowProposal: proposal });
    return { status: 201, body: { data: decorateBrief(brief, options) } };
  }
  const briefMatch = tool.match(/^briefs\/([^/]+)$/);
  if (briefMatch && method === 'GET') {
    const brief = await briefStore().get(decodeURIComponent(briefMatch[1]));
    if (!brief) return { status: 404, body: { error: 'marketing brief not found' } };
    return { status: 200, body: { data: decorateBrief(brief, options) } };
  }
  if (briefMatch && method === 'PATCH') {
    const body = await readBody();
    const brief = await briefStore().update(decodeURIComponent(briefMatch[1]), body ?? {});
    return { status: 200, body: { data: decorateBrief(brief, options) } };
  }
  const proposalMatch = tool.match(/^briefs\/([^/]+)\/workflow-proposal$/);
  if (proposalMatch && method === 'GET') {
    const brief = await briefStore().get(decodeURIComponent(proposalMatch[1]));
    if (!brief) return { status: 404, body: { error: 'marketing brief not found' } };
    if (!brief.workflowProposal) return { status: 404, body: { error: 'workflow proposal not found' } };
    return { status: 200, body: { data: inspectWorkflowProposal(brief.workflowProposal, workflowProposalOptions(options)) } };
  }
  const proposalGraphMatch = tool.match(/^briefs\/([^/]+)\/workflow-proposal\/graph$/);
  if (proposalGraphMatch && method === 'GET') {
    const brief = await briefStore().get(decodeURIComponent(proposalGraphMatch[1]));
    if (!brief) return { status: 404, body: { error: 'marketing brief not found' } };
    if (!brief.workflowProposal) return { status: 404, body: { error: 'workflow proposal not found' } };
    const inspection = inspectWorkflowProposal(brief.workflowProposal, workflowProposalOptions(options));
    return { status: 200, body: { data: { proposal: inspection.proposal, recipe: inspection.recipe, comfy: inspection.comfy } } };
  }
  const proposalReviseMatch = tool.match(/^briefs\/([^/]+)\/workflow-proposal\/revise$/);
  if (proposalReviseMatch && method === 'POST') {
    const id = decodeURIComponent(proposalReviseMatch[1]);
    const store = briefStore();
    const current = await store.get(id);
    if (!current) return { status: 404, body: { error: 'marketing brief not found' } };
    if (!current.workflowProposal) throw new Error('workflow proposal not found');
    const body = await readBody();
    const proposal = reviseStudioWorkflowProposal(current.workflowProposal, body?.instruction, workflowProposalOptions(options));
    const brief = await store.update(id, { workflowProposal: proposal });
    return { status: 200, body: { data: decorateBrief(brief, options) } };
  }
  const proposalPlayMatch = tool.match(/^briefs\/([^/]+)\/workflow-proposal\/play$/);
  if (proposalPlayMatch && method === 'POST') {
    const id = decodeURIComponent(proposalPlayMatch[1]);
    const store = briefStore();
    const current = await store.get(id);
    if (!current) return { status: 404, body: { error: 'marketing brief not found' } };
    if (!current.workflowProposal) throw new Error('workflow proposal not found');
    const body = await readBody();
    if (body?.confirm !== true) throw new Error('explicit execution confirmation is required');
    const frozen = freezeWorkflowProposal(current.workflowProposal, body?.version, workflowProposalOptions(options));
    const prepared = await store.update(id, workflowProposalBriefPatch(frozen, workflowProposalOptions(options)));
    try {
      const result = await executeMarketingBrief(id, { confirm: true, mode: 'real' }, options, store);
      const played = await store.update(id, { workflowProposal: { ...frozen, state: result.executed ? 'played' : 'proposed' } });
      return { status: 200, body: { data: { ...result, brief: decorateBrief(played, options) } } };
    } catch (error) {
      await store.update(id, { workflowProposal: { ...frozen, state: 'proposed' }, lastError: error.message });
      throw error;
    }
  }
  const reviewMatch = tool.match(/^briefs\/([^/]+)\/review$/);
  if (reviewMatch && method === 'POST') {
    const body = await readBody();
    const decision = body?.decision;
    if (!['accepted', 'revisions-requested', 'rejected'].includes(decision)) throw new Error('review decision must be accepted, revisions-requested, or rejected');
    const id = decodeURIComponent(reviewMatch[1]);
    const current = await briefStore().get(id);
    if (!current) return { status: 404, body: { error: 'marketing brief not found' } };
    const artifactPath = current.media?.videoPath || current.media?.previewPath;
    if (!artifactPath) throw new Error('a reviewable artifact is required before recording an editorial decision');
    const at = (options.now?.() ?? new Date()).toISOString();
    const event = {
      decision,
      at,
      briefRevision: current.revision,
      artifactPath,
      artifactSha256: await hashLocalFile(artifactPath),
      operator: 'local-operator',
    };
    const qualityAccepted = decision === 'accepted';
    const brief = await briefStore().update(id, {
      lifecycle: qualityAccepted ? 'ready-for-distribution' : 'needs-review',
      approval: {
        qualityAccepted,
        reviewDecision: decision,
        reviewedAt: at,
        reviewHistory: [...(current.approval?.reviewHistory ?? []), event],
      },
    });
    return { status: 200, body: { data: decorateBrief(brief, options) } };
  }
  const workflowMatch = tool.match(/^briefs\/([^/]+)\/workflow$/);
  if (workflowMatch && method === 'PATCH') {
    const body = await readBody();
    const brief = await briefStore().setWorkflowMode(
      decodeURIComponent(workflowMatch[1]),
      body?.mode,
      { paused: body?.paused },
    );
    return { status: 200, body: { data: decorateBrief(brief, options) } };
  }
  const workflowStageMatch = tool.match(/^briefs\/([^/]+)\/workflow\/([^/]+)$/);
  if (workflowStageMatch && method === 'POST') {
    const body = await readBody();
    if (typeof body?.actionId !== 'string' || !body.actionId.trim()) throw new Error('registered workflow actionId is required');
    if (!['run', 'retry'].includes(body?.operation)) throw new Error('workflow operation must be run or retry');
    const id = decodeURIComponent(workflowStageMatch[1]);
    const stageId = decodeURIComponent(workflowStageMatch[2]);
    const store = briefStore();
    const current = await store.get(id);
    if (!current) return { status: 404, body: { error: 'marketing brief not found' } };
    const result = await runRegisteredWorkflowStage({
      store,
      briefId: id,
      stageId,
      actionId: body.actionId,
      actions: workflowStageActions(options, store),
      retry: body.operation === 'retry',
      quick: current.workflow.mode === 'quick',
      context: {
        now: options.now,
        confirmGeneration: body.confirmGeneration === true,
        executionMode: body.executionMode,
        inputs: body.inputs,
      },
    });
    return {
      status: 200,
      body: {
        data: {
          ...decorateBrief(result.brief, options),
          workflowRun: {
            executed: result.executed,
            paused: result.paused,
            blocker: result.blocker ?? null,
            error: result.error ?? null,
          },
        },
      },
    };
  }
  const refineMatch = tool.match(/^briefs\/([^/]+)\/refine$/);
  if (refineMatch && method === 'POST') {
    const id = decodeURIComponent(refineMatch[1]);
    const store = briefStore();
    const current = await store.get(id);
    if (!current) return { status: 404, body: { error: 'marketing brief not found' } };
    const body = await readBody();
    const patch = await refineMarketingBriefDraft(current, body?.instruction, {
      llm: options.llm,
      now: options.now,
    });
    const brief = await store.update(id, patch);
    return { status: 200, body: { data: decorateBrief(brief, options) } };
  }
  const executeMatch = tool.match(/^briefs\/([^/]+)\/execute$/);
  if (executeMatch && method === 'POST') {
    const body = await readBody();
    const data = await executeMarketingBrief(decodeURIComponent(executeMatch[1]), body ?? {}, options, briefStore());
    return { status: 200, body: { data } };
  }
  if (method === 'POST' && tool === 'lyric-video') {
    const body = await readBody();
    if (!body?.briefId) throw new Error('briefId is required');
    const data = await executeMarketingBrief(body.briefId, body, options, briefStore());
    return { status: 200, body: { data } };
  }
  if (method === 'POST' && tool === 'platform-audio-preview') {
    const body = await readBody();
    if (body?.confirm !== true) throw new Error('explicit platform-audio preview confirmation is required');
    if (!body?.briefId) throw new Error('briefId is required');
    const store = briefStore();
    const brief = await store.get(body.briefId);
    if (!brief) return { status: 404, body: { error: 'marketing brief not found' } };
    if (!brief.media?.videoPath) throw new Error('production video is required before platform-audio preview');
    if (!isInsideArtifactRoots(brief.media.videoPath, options)) throw new Error('production video is outside artifact roots');
    const artifactDir = brief.media.artifactDir && isInsideArtifactRoots(brief.media.artifactDir, options)
      ? brief.media.artifactDir
      : path.dirname(brief.media.videoPath);
    const preview = await createPlatformAudioPreview({
      reference: body.reference,
      videoPath: brief.media.videoPath,
      artifactDir,
    }, {
      commandRunner: options.platformAudioCommandRunner,
      ffmpegPath: options.ffmpegPath,
      ffprobePath: options.ffprobePath,
      probeMedia: options.platformAudioProbe,
      now: options.now,
    });
    const updated = await store.update(brief.id, {
      media: { platformAudio: preview },
    });
    return {
      status: 200,
      body: {
        data: {
          brief: decorateBrief(updated, options),
          preview,
          downloadedAudio: false,
          boundary: preview.boundary,
        },
      },
    };
  }
  const prepareMatch = tool.match(/^briefs\/([^/]+)\/prepare-distribution$/);
  if (prepareMatch && method === 'POST') {
    const id = decodeURIComponent(prepareMatch[1]);
    const store = briefStore();
    const brief = await store.get(id);
    if (!brief) return { status: 404, body: { error: 'marketing brief not found' } };
    const bundle = buildStudioDistributionBundle(brief, { now: options.now });
    const updated = await store.update(id, {
      lifecycle: 'ready-for-distribution',
      distribution: {
        preparedAt: (options.now?.() ?? new Date()).toISOString(),
        request: bundle.request,
        receipt: null,
      },
    });
    return {
      status: 200,
      body: {
        data: {
          brief: decorateBrief(updated, options),
          bundle,
          posted: false,
          boundary: 'Prepared only. No Postiz network call, schedule, or publication occurred.',
        },
      },
    };
  }
  const scheduleMatch = tool.match(/^briefs\/([^/]+)\/schedule-postiz$/);
  if (scheduleMatch && method === 'POST') {
    const id = decodeURIComponent(scheduleMatch[1]);
    const body = await readBody();
    if (!body?.scheduledFor) throw new Error('scheduledFor is required');
    const store = briefStore();
    const brief = await store.get(id);
    if (!brief) return { status: 404, body: { error: 'marketing brief not found' } };
    const scheduled = await submitStudioPostiz(brief, {
      ...options,
      approvedBy: body.approvedBy,
      scheduledFor: body.scheduledFor,
      publishNow: body.publishNow,
    });
    const updated = await store.update(id, {
      lifecycle: 'scheduled',
      distribution: {
        preparedAt: scheduled.request.createdAt,
        request: scheduled.request,
        receipt: scheduled.receipt,
      },
    });
    return {
      status: 200,
      body: {
        data: {
          brief: decorateBrief(updated, options),
          receipt: scheduled.receipt,
          boundary: `Scheduled in Postiz for ${scheduled.request.scheduledFor}. Provider publication has not happened yet.`,
        },
      },
    };
  }
  const draftMatch = tool.match(/^briefs\/([^/]+)\/create-postiz-draft$/);
  if (draftMatch && method === 'POST') {
    const id = decodeURIComponent(draftMatch[1]);
    const body = await readBody();
    const store = briefStore();
    const brief = await store.get(id);
    if (!brief) return { status: 404, body: { error: 'marketing brief not found' } };
    const draft = await createStudioPostizDraft(brief, {
      ...options,
      approvedBy: body?.approvedBy,
      publishNow: body?.publishNow,
    });
    const updated = await store.update(id, {
      lifecycle: 'distributed',
      distribution: {
        preparedAt: draft.request.createdAt,
        request: draft.request,
        receipt: draft.receipt,
      },
    });
    return {
      status: 200,
      body: {
        data: {
          brief: decorateBrief(updated, options),
          receipt: draft.receipt,
          boundary: 'Unscheduled Postiz draft created. It is not scheduled or published.',
        },
      },
    };
  }
  if (method === 'GET' && tool === 'productions') {
    const ideaStore = options.ideaStore ?? new IdeaStore(options.ideaStoreOptions);
    const [briefs, renders, ideas, episodes] = await Promise.all([
      briefStore().list(),
      listRenders(options),
      ideaStore.listIdeas(),
      listLocalEpisodes(options.episodeStoreOptions),
    ]);
    const ideasById = new Map(ideas.map((idea) => [idea.id, idea]));
    const history = await buildStudioHistory(briefs, options.historyOptions);
    const historyById = new Map(history.map((entry) => [entry.id, entry]));
    const briefVideoPaths = new Set(
      briefs
        .map((brief) => brief.media?.videoPath)
        .filter(Boolean)
        .map((videoPath) => path.resolve(videoPath)),
    );
    const legacyRenders = await Promise.all(renders.filter(
      (render) => !render.video || !briefVideoPaths.has(path.resolve(render.video)),
    ).map(async (render) => {
      if (!render.video) return render;
      const evidence = await inspectStudioVideo(render.video, options.historyOptions);
      return {
        ...render,
        video: evidence.video?.path ?? null,
        videoUnavailableReason: evidence.reason,
      };
    }));
    const viewableEpisodes = await Promise.all(episodes.map(async (episode) => {
      const videoPath = episode.assembly?.output?.videoPath;
      if (!videoPath) return episode;
      const evidence = await inspectStudioVideo(videoPath, options.historyOptions);
      return {
        ...episode,
        assembly: {
          ...episode.assembly,
          output: { ...episode.assembly.output, videoPath: evidence.video?.path ?? null },
          videoUnavailableReason: evidence.reason,
        },
      };
    }));
    return {
      status: 200,
      body: {
        data: {
          briefs: briefs.map((brief) => ({
            ...decorateBriefForPlayback(brief, historyById.get(brief.id), options),
            automation: brief.ideaId ? ideasById.get(brief.ideaId)?.automation ?? null : null,
          })),
          legacyRenders,
          episodes: viewableEpisodes,
        },
      },
    };
  }
  if (method === 'GET' && tool === 'postiz-readiness') {
    return { status: 200, body: { data: studioPostizReadiness(options) } };
  }

  if (method === 'GET' && tool === 'ideas-list') {
    const store = options.ideaStore ?? new IdeaStore(options.ideaStoreOptions);
    return { status: 200, body: { data: await store.listIdeas({ projectSlug: query.projectSlug }) } };
  }
  if (method === 'GET' && tool === 'renders-list') {
    return { status: 200, body: { data: await listRenders(options) } };
  }
  if (method === 'GET' && tool === 'render-file') {
    return serveRenderFile(query.path, options);
  }
  if (method === 'GET' && tool === 'factory-status') {
    const store = options.ideaStore ?? new IdeaStore(options.ideaStoreOptions);
    return { status: 200, body: { data: await factoryStatus({ store }) } };
  }
  if (method !== 'POST') return { status: 404, body: { error: 'not found' } };

  const handlers = toolHandlers(options);
  const handler = handlers[tool];
  if (!handler) return { status: 404, body: { error: `unknown studio tool: ${tool}` } };

  const body = await readBody();
  const data = await handler(body ?? {});
  return { status: 200, body: { data } };
}

async function ensureProductionReadiness(options) {
  if (options.blenderCapability == null) {
    options.blenderCapability = await probeBlenderVideo(options.blender ?? {});
  }
  if (options.htmlCapability == null) {
    options.htmlCapability = await probeHtmlComposition(options.rendererOptions?.htmlComposition ?? {});
  }
  if (options.kokoroCapability == null) {
    options.kokoroCapability = probeKokoroComposeReadiness({
      kokoroDir: options.kokoroDir,
      kokoroReady: options.kokoroReady,
      pexelsReady: options.pexelsReady,
      pexelsApiKey: options.rendererOptions?.kokoroCompose?.pexelsApiKey,
      ffmpegPath: options.ffmpegPath,
      ffmpegReady: options.ffmpegReady,
    });
  }
}

async function executeMarketingBrief(id, body, options, store) {
  if (body.confirm !== true) throw new Error('explicit execution confirmation is required');
  const brief = await store.get(id);
  if (!brief) throw new Error('marketing brief not found');
  if (body.mode === 'fixture' && body.mixVariantIds != null) {
    const execution = await executeVideoMix(brief, {
      variantIds: body.mixVariantIds,
      galleryOptions: { galleryConfig: options.galleryConfig, galleryRoot: options.galleryRoot },
      outputDir: options.mixArtifactDir,
      commandRunner: options.mixCommandRunner,
      ffmpegPath: options.ffmpegPath,
      ffprobePath: options.ffprobePath,
    });
    const updated = await store.update(id, {
      lifecycle: 'needs-review',
      lastError: null,
      media: {
        artifactDir: path.dirname(execution.artifact.videoPath),
        videoPath: execution.artifact.videoPath,
        publicUrl: null,
        provider: execution.adapter,
        quality: execution.quality,
        reviewedAt: null,
        execution,
      },
    });
    return { brief: decorateBrief(updated, options), production: execution, executed: true };
  }
  if (body.mode === 'fixture') {
    const execution = await executeVideoVariant(brief, {
      mode: 'fixture',
      galleryOptions: { galleryConfig: options.galleryConfig, galleryRoot: options.galleryRoot },
    });
    const updated = await store.update(id, {
      lifecycle: 'needs-review',
      lastError: null,
      media: {
        artifactDir: path.dirname(execution.artifact.videoPath),
        videoPath: execution.artifact.videoPath,
        publicUrl: null,
        provider: execution.adapter,
        quality: execution.quality,
        reviewedAt: null,
        execution,
      },
    });
    return { brief: decorateBrief(updated, options), production: execution, executed: true };
  }
  if (brief.recipeId) {
    const actions = productionActions(brief, productionContext(options));
    if (!actions.build.enabled) throw new Error(actions.build.blocker ?? 'video recipe is not ready');
    const directRecipeExecution = body.mode !== 'fixture'
      && (actions.build.kind === 'continue'
        ? body.mode === 'real'
        : !['faceless', 'lyric-video'].includes(brief.kind));
    if (directRecipeExecution) {
        const execution = await executeVideoVariant(brief, {
          mode: 'real',
          inputs: body.inputs ?? brief.executionInputs ?? {},
          realExecutors: options.videoRealExecutors ?? {},
        });
        const updated = await store.update(id, {
          lifecycle: 'needs-review',
          lastError: null,
          media: {
            artifactDir: path.dirname(execution.artifact.videoPath),
            videoPath: execution.artifact.videoPath,
            publicUrl: null,
            provider: execution.adapter,
            quality: execution.quality,
            reviewedAt: null,
            execution,
          },
        });
        return { brief: decorateBrief(updated, options), production: execution, executed: true };
    }
    if (actions.build.kind === 'continue') {
      return { brief: decorateBrief(brief, options), continuation: actions.build, executed: false };
    }
  }
  const capability = evaluateStudioCapability(brief.kind, brief, capabilityOptions(options));
  if (!['faceless', 'lyric-video'].includes(brief.kind)) {
    return {
      brief: decorateBrief(brief, options),
      continuation: continuationForBrief(brief, capabilityOptions(options)),
      executed: false,
    };
  }
  if (capability.state !== 'ready') throw new Error(capability.blocker ?? 'video workflow is not ready');
  await store.update(id, { lifecycle: 'producing', lastError: null });
  try {
    if (brief.kind === 'lyric-video') {
      const render = await renderLyricVideo(brief, {
        confirm: true,
        artifactDir: options.lyricArtifactDir,
        audioRoots: options.lyricAudioRoots,
        blenderAdapter: options.blenderAdapter,
        blender: options.blender,
        frameRenderer: options.lyricFrameRenderer,
        commandRunner: options.lyricCommandRunner,
        ffmpegPath: options.ffmpegPath,
        ffprobePath: options.ffprobePath,
        now: options.now,
      });
      if (render.status !== 'completed') throw new Error('lyric video quality evidence did not pass');
      const execution = await localExecutionEnvelope(brief, {
        videoPath: render.raw.videoPath,
        renderer: render.provider,
        quality: render.raw.quality,
        ownerManifestPath: render.raw.manifestPath,
      });
      const updated = await store.update(id, {
        lifecycle: 'needs-review',
        lastError: null,
        media: {
          artifactDir: render.raw.artifactDir,
          videoPath: render.raw.videoPath,
          publicUrl: null,
          ideaId: null,
          provider: render.provider,
          quality: render.raw.quality,
          reviewedAt: null,
          captionsPath: render.raw.captionsPath,
          scenePlanPath: render.raw.scenePlanPath,
          rightsPath: render.raw.rightsPath,
          manifestPath: render.raw.manifestPath,
          blender: render.raw.blender,
          execution,
        },
      });
      return { brief: decorateBrief(updated, options), production: execution ?? render, executed: true };
    }
    const realInputs = { ...(brief.executionInputs ?? {}), ...(body.inputs ?? {}) };
    if (brief.recipeId) {
      const missing = missingExecutionInputs(brief.recipeId, realInputs);
      if (missing.length) throw new Error(`Add ${missing.join(', ')} before real execution.`);
    }
    let matureAssertions = null;
    if (brief.contentScope === 'mature-enabled') {
      validateMatureConcept([brief.request, brief.summary, brief.creativeDirection].filter(Boolean).join('\n'));
      matureAssertions = validateMatureCast(brief.cast ?? []).assertions;
    }
    const summary = await runFacelessWorkflow({
      topic: brief.title,
      niche: brief.summary,
      durationSeconds: brief.durationSeconds,
      engine: brief.engine,
      projectSlug: brief.projectSlug ?? 'studio',
      channel: brief.channel,
      briefId: brief.id,
      hook: brief.hook,
      cta: brief.cta,
      creativeDirection: brief.creativeDirection,
      voice: brief.recipeOptions?.values?.voice,
      renderOptions: {
        ...(brief.recipeOptions?.values ?? {}),
        ...realInputs,
        themePackId: brief.themePackId,
        modelProfileId: brief.modelProfileId,
        contentScope: brief.contentScope,
        ...((brief.themeRightsEvidence ?? realInputs.rightsEvidence)
          ? { rightsEvidence: brief.themeRightsEvidence ?? realInputs.rightsEvidence }
          : {}),
      },
      cast: brief.cast,
      soundtrack: brief.soundtrack,
      matureAssertions,
      ideaId: brief.ideaId ?? undefined,
      recordingUrl: brief.recipeOptions?.values?.approvedAssetPath || undefined,
      literalScenes: brief.engine === 'blender' ? [{
        id: 'scene-1',
        lyric: brief.hook,
        objects: [brief.hook],
        camera: brief.recipeOptions?.values?.camera,
        palette: brief.recipeOptions?.values?.palette,
        visualStyle: brief.recipeOptions?.values?.visualStyle,
      }] : undefined,
      outputDir: options.facelessOutputDir,
      ideaStore: options.ideaStore,
      rendererOptions: options.rendererOptions ?? {},
      llm: options.llm,
      logger: options.logger ?? console,
    });
    const execution = await localExecutionEnvelope(brief, {
      videoPath: summary.video,
      renderer: summary.engine,
      quality: summary.quality,
      ownerManifestPath: summary.manifestPath ?? null,
    });
    const updated = await store.update(id, {
      lifecycle: 'needs-review',
      lastError: null,
      media: {
        artifactDir: summary.artifactDir,
        videoPath: summary.video,
        previewPath: summary.previewPath,
        previewType: summary.previewType,
        publicUrl: null,
        ideaId: summary.ideaId,
        provider: summary.engine,
        quality: summary.quality,
        reviewedAt: null,
        execution,
      },
    });
    return { brief: decorateBrief(updated, options), production: execution ?? summary, executed: true };
  } catch (error) {
    await store.update(id, { lifecycle: 'failed', lastError: error.message });
    throw error;
  }
}

function workflowStageActions(options, store) {
  const owner = (brief) => brief.recipeId
    ? getProductionRecipe(brief.recipeId, { ...productionContext(options), brief }).owner
    : evaluateStudioCapability(brief.kind, brief, capabilityOptions(options)).owner;
  const defaults = {
    'studio.cast.confirm': {
      readiness: ({ brief }) => readinessResult(() => {
        if (brief.contentScope === 'mature-enabled') validateMatureCast(brief.cast);
      }),
      run: async ({ brief, stage }) => ({
        output: {
          cast: brief.cast,
          compiled: await compileCastPrompt(brief.cast),
        },
        evidence: stageEvidence(stage, owner(brief), { castRevisions: brief.cast.map((entry) => ({
          characterId: entry.characterId,
          revision: entry.characterRevision,
        })) }),
      }),
    },
    'studio.scenes.plan': {
      run: async ({ brief, stage }) => ({
        output: {
          summary: brief.summary,
          creativeDirection: brief.creativeDirection,
          cast: await compileCastPrompt(brief.cast),
        },
        evidence: stageEvidence(stage, owner(brief), { briefRevision: brief.revision }),
      }),
    },
    'studio.video.generate': {
      readiness: ({ brief, context }) => {
        if (context.confirmGeneration !== true) {
          return { ready: false, blockers: ['Confirm the selected local generation action before it runs.'] };
        }
        if (brief.recipeId) {
          const action = productionActions(brief, productionContext(options)).build;
          return action.enabled
            ? { ready: true, blockers: [] }
            : { ready: false, blockers: [action.blocker ?? 'The selected recipe is not ready.'] };
        }
        const capability = evaluateStudioCapability(brief.kind, brief, capabilityOptions(options));
        return capability.state === 'ready'
          ? { ready: true, blockers: [] }
          : { ready: false, blockers: [capability.blocker ?? 'The selected workflow is not locally executable.'] };
      },
      run: async ({ brief, stage, context }) => {
        const result = await executeMarketingBrief(brief.id, {
          confirm: true,
          mode: context.executionMode === 'fixture' ? 'fixture' : 'real',
          inputs: context.inputs,
        }, options, store);
        if (result.executed !== true || !result.brief?.media) {
          throw new Error(result.continuation?.blocker ?? 'The selected runtime did not produce a reviewable artifact.');
        }
        return {
          output: { media: result.brief.media },
          evidence: stageEvidence(stage, owner(result.brief), {
            modelProfileId: result.brief.modelProfileId,
            execution: result.production,
          }),
        };
      },
    },
    'studio.edit.confirm': {
      readiness: ({ brief }) => brief.media?.videoPath
        ? { ready: true, blockers: [] }
        : { ready: false, blockers: ['Generate a reviewable video before confirming the edit.'] },
      run: async ({ brief, stage }) => ({
        output: { videoPath: brief.media.videoPath, quality: brief.media.quality },
        evidence: stageEvidence(stage, owner(brief), { briefRevision: brief.revision }),
      }),
    },
    'studio.sound.confirm': {
      readiness: ({ brief }) => {
        const result = soundtrackReadiness(brief.soundtrack, {
          generatedRuntime: options.generatedMusicRuntime,
        });
        return result.ready
          ? { ready: true, blockers: [] }
          : { ready: false, blockers: [result.blocker] };
      },
      run: async ({ brief, stage }) => ({
        output: { soundtrack: brief.soundtrack },
        evidence: stageEvidence(stage, owner(brief), {
          lane: brief.soundtrack.lane,
          mix: brief.soundtrack.mix,
        }),
      }),
    },
    'studio.video.export': {
      readiness: ({ brief }) => brief.media?.videoPath
        ? { ready: true, blockers: [] }
        : { ready: false, blockers: ['A generated video is required before export.'] },
      run: async ({ brief, stage }) => ({
        output: { videoPath: brief.media.videoPath, publicUrl: brief.media.publicUrl },
        evidence: stageEvidence(stage, owner(brief), { quality: brief.media.quality }),
      }),
    },
    'studio.review.confirm': {
      readiness: ({ brief }) => brief.approval?.reviewDecision === 'accepted'
        ? { ready: true, blockers: [] }
        : { ready: false, blockers: ['Accept the generated artifact in Productions before completing review.'] },
      run: async ({ brief, stage }) => ({
        output: { decision: brief.approval.reviewDecision, reviewedAt: brief.approval.reviewedAt },
        evidence: stageEvidence(stage, 'local-operator', { quality: brief.media?.quality }),
      }),
    },
  };
  return { ...defaults, ...(options.workflowStageActions ?? {}) };
}

function readinessResult(check) {
  try {
    check();
    return { ready: true, blockers: [] };
  } catch (error) {
    return { ready: false, blockers: [error.message] };
  }
}

function stageEvidence(stage, owner, extra = {}) {
  return {
    actionId: stage.actionId,
    owner: owner ?? 'Marketing Studio',
    localOnly: true,
    ...structuredClone(extra),
  };
}

async function localExecutionEnvelope(brief, result) {
  if (!brief.recipeId || !result.videoPath) return null;
  const adapter = getExecutionAdapter(brief.recipeId);
  const normalized = normalizeRecipeOptions(brief.recipeId, brief.recipeOptions ?? {});
  const info = await stat(result.videoPath).catch(() => null);
  return {
    schema: VIDEO_EXECUTION_SCHEMA,
    status: 'completed',
    mode: 'real',
    briefId: brief.id,
    recipeId: brief.recipeId,
    variantId: normalized.variantId,
    adapter: adapter.id,
    owner: adapter.owner,
    artifact: {
      videoPath: path.resolve(result.videoPath),
      bytes: info?.size ?? null,
      sha256: null,
      contentType: 'video/mp4',
    },
    provenance: { posture: 'real', renderer: result.renderer ?? adapter.id },
    quality: result.quality ?? { verdict: 'pass', basis: 'local renderer evidence' },
    evidence: { ownerManifestPath: result.ownerManifestPath ?? null },
    blockers: [],
  };
}

function decorateBriefForPlayback(brief, historyEntry, options) {
  const decorated = decorateBrief(brief, options);
  if (!brief.media?.videoPath) return decorated;
  return {
    ...decorated,
    media: {
      ...decorated.media,
      videoPath: historyEntry?.video?.path ?? null,
      videoUnavailableReason: historyEntry
        ? historyEntry.videoUnavailableReason
        : 'The saved video artifact is unavailable.',
    },
  };
}

function decorateBrief(brief, options) {
  const capability = evaluateStudioCapability(brief.kind, brief, capabilityOptions(options));
  const actions = productionActions(brief, productionContext(options));
  const continuation = brief.recipeId ? continuationFromAction(actions.build) : continuationForBrief(brief, capabilityOptions(options));
  const theme = brief.recipeId ? resolveThemePack(brief.themePackId, brief.request) : null;
  let modelSelection = null;
  if (brief.recipeId === 'night-out-carousel') {
    try {
      const resolved = resolveModelProfile(brief.modelProfileId, { ...(options.modelOptions ?? {}), generationMode: 'image-to-reel' });
      modelSelection = {
        requestedProfileId: brief.modelProfileId,
        profile: resolved.profile,
        selectionMode: resolved.selectionMode,
        reason: resolved.reason,
      };
    } catch (error) {
      const requested = listModelProfiles(options.modelOptions).find((entry) => entry.id === brief.modelProfileId);
      modelSelection = { requestedProfileId: brief.modelProfileId, profile: requested ?? null, selectionMode: brief.modelProfileId === 'auto' ? 'auto' : 'explicit', reason: null, blocker: error.message };
    }
  }
  return {
    ...brief,
    theme,
    modelSelection,
    soundtrackState: soundtrackReadiness(brief.soundtrack, {
      generatedRuntime: options.generatedMusicRuntime,
    }),
    capability,
    recipe: brief.recipeId ? getProductionRecipe(brief.recipeId, { ...productionContext(options), brief }) : null,
    actions,
    continuation,
  };
}

function workflowProposalOptions(options = {}) {
  return {
    recipeOptions: options.workflowRecipeOptions ?? options.localVideoExecutionOptions,
    recipes: options.workflowRecipes,
    now: options.now,
  };
}

function projectedWorkflowRecipes(options = {}) {
  const recipes = options.workflowRecipes ?? summarizeLocalVideoWorkflowRecipes(options.workflowRecipeOptions);
  return recipes.map(({ graph: _graph, ...recipe }) => ({ ...structuredClone(recipe), graph: undefined }));
}

async function hashLocalFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function continuationFromAction(action) {
  return {
    owner: null,
    state: action.enabled ? (action.kind === 'continue' ? 'external-step' : 'ready') : 'needs-input',
    label: action.label,
    href: action.href,
    method: action.kind === 'execute' ? 'POST' : 'GET',
    endpoint: action.endpoint,
    blocker: action.blocker,
  };
}

function productionContext(options) {
  const kokoroCapability = options.kokoroCapability ?? probeKokoroComposeReadiness({
    kokoroDir: options.kokoroDir,
    kokoroReady: options.kokoroReady,
    pexelsReady: options.pexelsReady,
    pexelsApiKey: options.rendererOptions?.kokoroCompose?.pexelsApiKey,
    ffmpegPath: options.ffmpegPath,
    ffmpegReady: options.ffmpegReady,
  });
  return {
    blenderCapability: options.blenderCapability ?? (options.blenderReady !== undefined
      ? { ready: options.blenderReady, blocker: options.blenderBlocker ?? null }
      : null),
    htmlCapability: options.htmlCapability ?? null,
    kokoroReady: kokoroCapability.ready,
    kokoroBlocker: kokoroCapability.blocker,
    modelOptions: options.modelOptions,
  };
}

function productionDirection(recipe, options) {
  const selected = Object.entries(options.values)
    .filter(([, value]) => value !== '' && value !== false)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
  return `${recipe.outputStyle}. ${recipe.description}${selected ? ` Selected options: ${selected}.` : ''}`;
}

function capabilityOptions(options) {
  return {
    forgeUrl: options.forgeUrl ?? process.env.REEL_FORGE_URL,
    editorialUrl: options.editorialUrl ?? process.env.REEL_EDITORIAL_URL,
    blenderReady: options.blenderCapability?.ready ?? options.blenderReady,
    blenderBlocker: options.blenderCapability?.blocker ?? options.blenderBlocker,
  };
}
