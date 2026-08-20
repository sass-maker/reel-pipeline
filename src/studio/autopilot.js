import { IdeaStore } from './idea-store.js';
import { MarketingBriefStore } from './briefs.js';
import { automationPolicyById, loadAutomationPolicies, spendAllowed } from './automation-policy.js';
import { automationIdempotencyKey, discoverAutomationSources } from './autopilot-sources.js';
import { listProductionRecipes, normalizeRecipeOptions } from './production-catalog.js';
import { createStudioPostizDraft, submitStudioPostiz } from './distribution.js';
import { runSourceBackedWorkflow } from './workflow.js';
import { publishRenderArtifacts } from '../artifact-publisher.js';

const TERMINAL_AUTOMATION_STATES = new Set(['drafted', 'scheduled', 'skipped']);

export async function runStudioAutopilot(options = {}) {
  const registry = options.registry ?? await loadAutomationPolicies(options.policyOptions);
  const policies = selectPolicies(registry, options);
  const ideaStore = options.ideaStore ?? new IdeaStore(options.ideaStoreOptions);
  const briefStore = options.briefStore ?? new MarketingBriefStore(options.briefStoreOptions);
  const now = options.now ?? (() => new Date());
  const runId = options.runId ?? `autopilot_${now().toISOString().replace(/\D/g, '').slice(0, 17)}`;
  const dryRun = options.execute !== true;
  const results = [];

  for (const policy of policies) {
    const discovered = await (options.discoverSources ?? discoverAutomationSources)(policy, {
      ...options.sourceOptions,
      fleetRoot: options.fleetRoot ?? options.sourceOptions?.fleetRoot,
      limit: boundedCount(options.count, policy.maxItemsPerRun),
      now,
    });
    const eligible = discovered.filter((source) => source.eligibility.eligible)
      .slice(0, boundedCount(options.count, policy.maxItemsPerRun));
    const excluded = discovered.filter((source) => !source.eligibility.eligible);
    const recipePlan = rankPolicyRecipes(policy, options.recipeContext);
    const policyResult = {
      policyId: policy.id,
      policyRevision: policy.revision,
      label: policy.label,
      dryRun,
      discovered: discovered.length,
      eligible: eligible.length,
      excludedTotal: excluded.length,
      exclusionCounts: countExclusions(excluded),
      excluded: excluded.slice(0, 20).map(sourceSummary),
      recipePlan,
      items: [],
    };

    for (const source of eligible) {
      for (const channel of policy.channels) {
        const key = automationIdempotencyKey(policy, source, channel);
        const existing = await ideaStore.findByIdempotencyKey(key);
        if (dryRun) {
          policyResult.items.push({
            ...sourceSummary(source), channel, idempotencyKey: key,
            action: existing ? resumeAction(existing) : recipePlan.selected ? 'create-and-produce' : 'blocked',
            existingIdeaId: existing?.id ?? null,
            nextAction: existing?.automation?.nextAction ?? recipePlan.blocker,
          });
          continue;
        }
        policyResult.items.push(await executeSourceChannel({
          policy, source, channel, key, existing, runId, recipePlan,
          ideaStore, briefStore, now, options,
        }));
      }
    }
    results.push(policyResult);
  }

  return {
    schema: 'fleet.studio-autopilot-run.v1',
    runId,
    mode: dryRun ? 'dry-run' : 'execute',
    startedAt: now().toISOString(),
    policies: results,
    totals: summarizeRun(results),
  };
}

export function rankPolicyRecipes(policy, context = {}) {
  const available = new Map(listProductionRecipes(context).map((recipe) => [recipe.id, recipe]));
  const candidates = policy.recipes.map((id, rank) => {
    const recipe = available.get(id);
    if (!recipe) return { id, rank, accepted: false, reason: 'recipe-not-found' };
    if (!spendAllowed(recipe.spend.id, policy.spendCeiling)) {
      return { id, rank, accepted: false, spend: recipe.spend, readiness: recipe.readiness, reason: 'spend-ceiling' };
    }
    if (!recipe.readiness.ready) {
      return { id, rank, accepted: false, spend: recipe.spend, readiness: recipe.readiness, reason: recipe.readiness.blocker };
    }
    if (recipe.action.kind !== 'execute') {
      return { id, rank, accepted: false, spend: recipe.spend, readiness: recipe.readiness, reason: 'external-execution-owner' };
    }
    return { id, rank, accepted: true, spend: recipe.spend, readiness: recipe.readiness, recipe };
  });
  const selected = candidates.find((candidate) => candidate.accepted) ?? null;
  return {
    spendCeiling: policy.spendCeiling,
    selected: selected ? compactRecipe(selected.recipe) : null,
    candidates: candidates.map(({ recipe, ...candidate }) => candidate),
    blocker: selected ? null : 'No policy-allowed recipe is ready within the spend ceiling.',
  };
}

export async function studioAutopilotStatus(options = {}) {
  const ideaStore = options.ideaStore ?? new IdeaStore(options.ideaStoreOptions);
  const ideas = await ideaStore.listIdeas();
  const laneCounts = { 'project-automation': 0, 'operator-request': 0, 'personal-automation': 0 };
  const policyCounts = {};
  const runMap = new Map();
  const exceptions = [];
  for (const idea of ideas) {
    laneCounts[idea.origin.lane] = (laneCounts[idea.origin.lane] ?? 0) + 1;
    const automation = idea.automation;
    if (!automation) continue;
    const policyId = automation.policyId ?? 'unknown';
    policyCounts[policyId] ??= {};
    policyCounts[policyId][automation.state] = (policyCounts[policyId][automation.state] ?? 0) + 1;
    if (automation.runId) {
      const run = runMap.get(automation.runId) ?? { runId: automation.runId, items: 0, states: {}, updatedAt: idea.updatedAt };
      run.items += 1;
      run.states[automation.state] = (run.states[automation.state] ?? 0) + 1;
      if (idea.updatedAt > run.updatedAt) run.updatedAt = idea.updatedAt;
      runMap.set(automation.runId, run);
    }
    if (['failed', 'review-required'].includes(automation.state)) {
      exceptions.push({
        ideaId: idea.id, title: idea.title, policyId, state: automation.state,
        error: automation.lastError, nextAction: automation.nextAction, updatedAt: idea.updatedAt,
      });
    }
  }
  return {
    lanes: laneCounts,
    policies: policyCounts,
    runs: [...runMap.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    exceptions: exceptions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

async function executeSourceChannel(context) {
  const { policy, source, channel, key, runId, recipePlan, ideaStore, briefStore, now, options } = context;
  let idea = context.existing;
  if (idea && !originMatchesPolicySource(idea.origin, policy, source)) {
    return {
      ideaId: idea.id, briefId: idea.automation?.briefId ?? null, channel,
      outcome: 'policy-mismatch', state: 'review-required', recipe: idea.automation?.selectedRecipe ?? null,
      distributionState: idea.automation?.distributionState ?? null,
      nextAction: 'Resolve the idempotency collision without changing the immutable source origin.',
      error: 'Existing idea origin does not match the selected automation policy and source revision.',
    };
  }
  if (idea && TERMINAL_AUTOMATION_STATES.has(idea.automation?.state)) {
    return resultFromIdea(idea, channel, 'unchanged');
  }
  if (!idea) {
    const origin = originFor(policy, source);
    idea = await ideaStore.saveIdea({
      projectSlug: source.projectSlug,
      origin,
      title: source.title,
      niche: source.audience,
      hook: source.hook,
      format: 'automated-source-video',
      idempotencyKey: key,
      contentSource: source,
      automation: {
        policyId: policy.id, policyRevision: policy.revision, runId,
        state: recipePlan.selected ? 'queued' : 'review-required',
        nextAction: recipePlan.blocker,
      },
    });
  } else {
    idea = await ideaStore.updateIdea(idea.id, { automation: { runId } });
  }

  if (!recipePlan.selected) return resultFromIdea(idea, channel, 'blocked');
  let brief = idea.automation?.briefId ? await briefStore.get(idea.automation.briefId) : null;
  if (!brief) {
    brief = await briefStore.create(briefInput(policy, source, channel, idea, recipePlan.selected));
    idea = await ideaStore.updateIdea(idea.id, {
      automation: { briefId: brief.id, selectedRecipe: recipePlan.selected, state: 'queued', nextAction: null, lastError: null },
    });
  }

  const attempts = [...(idea.automation?.attempts ?? [])];
  if (!qualityAccepted(brief.media?.quality, policy.qualityThreshold) && attempts.length < policy.maxAttempts) {
    const attempted = new Set(attempts.map((attempt) => attempt.recipeId));
    const candidates = recipePlan.candidates.filter((candidate) => candidate.accepted && !attempted.has(candidate.id));
    for (const candidate of candidates.slice(0, policy.maxAttempts - attempts.length)) {
      const recipe = listProductionRecipes(options.recipeContext).find((entry) => entry.id === candidate.id);
      const startedAt = now().toISOString();
      idea = await ideaStore.updateIdea(idea.id, {
        automation: { state: 'producing', selectedRecipe: compactRecipe(recipe), attempts, nextAction: null, lastError: null },
      });
      try {
        if (brief.recipeId !== recipe.id) {
          brief = await briefStore.update(brief.id, {
            recipeId: recipe.id,
            recipeOptions: normalizeRecipeOptions(recipe.id, { channel }),
          });
        }
        const summary = await (options.executeProduction ?? runSourceBackedWorkflow)({
          source, recipe, channel, briefId: brief.id, ideaId: idea.id, ideaStore,
          outputDir: options.outputDir, rendererOptions: options.rendererOptions,
          artifactOptions: options.artifactOptions, assessQuality: options.assessQuality,
          publishArtifacts: options.publishArtifacts,
          now, logger: options.logger,
        });
        const accepted = qualityAccepted(summary.quality, policy.qualityThreshold);
        attempts.push({
          recipeId: recipe.id, startedAt, finishedAt: now().toISOString(),
          outcome: accepted ? 'passed' : 'quality-rejected',
          quality: summary.quality ?? null,
          artifactDir: summary.artifactDir ?? null,
          videoPath: summary.localVideo ?? summary.video ?? null,
        });
        brief = await briefStore.update(brief.id, {
          lifecycle: accepted ? 'needs-review' : 'failed',
          media: {
            artifactDir: summary.artifactDir,
            videoPath: summary.localVideo ?? summary.video,
            previewPath: summary.previewPath,
            previewType: summary.previewType,
            publicUrl: summary.publicUrl,
            ideaId: idea.id,
            provider: summary.provider ?? recipe.engine,
            quality: summary.quality,
            reviewedAt: now().toISOString(),
            uploadEvidence: summary.uploadEvidence,
          },
          lastError: accepted ? null : `Quality verdict ${summary.quality?.verdict ?? 'missing'} did not satisfy ${policy.qualityThreshold}.`,
        });
        if (accepted) break;
      } catch (error) {
        attempts.push({
          recipeId: recipe.id, startedAt, finishedAt: now().toISOString(),
          outcome: 'failed', error: error.message,
        });
      }
    }
  }

  const qualityOk = qualityAccepted(brief.media?.quality, policy.qualityThreshold);
  if (!qualityOk) {
    idea = await ideaStore.updateIdea(idea.id, {
      automation: {
        attempts, state: attempts.length >= policy.maxAttempts ? 'failed' : 'review-required',
        lastError: brief.lastError ?? attempts.at(-1)?.error ?? 'No passing render was produced.',
        nextAction: attempts.length >= policy.maxAttempts
          ? 'Review the failed attempts, change the policy recipe order or inputs, then start a new policy revision.'
          : 'Retry the remaining policy-approved fallback recipe.',
      },
    });
    return resultFromIdea(idea, channel, 'quality-blocked');
  }

  if (!brief.media?.publicUrl && brief.media?.videoPath) {
    try {
      brief = await advanceStableMedia(brief, briefStore, options, now);
    } catch (error) {
      idea = await ideaStore.updateIdea(idea.id, {
        automation: {
          attempts, state: 'review-required', distributionState: 'stable-media-failed',
          lastError: error.message,
          nextAction: 'Fix the existing artifact publisher, then rerun this policy to reuse the render.',
        },
      });
      return resultFromIdea(idea, channel, 'media-blocked');
    }
  }
  if (!brief.media?.publicUrl) {
    idea = await ideaStore.updateIdea(idea.id, {
      automation: {
        attempts, state: 'review-required', distributionState: 'missing-stable-media',
        lastError: 'The render passed but has no stable public HTTPS media URL.',
        nextAction: 'Configure the existing artifact publisher, then rerun this policy to reuse the render.',
      },
    });
    return resultFromIdea(idea, channel, 'media-blocked');
  }

  brief = await briefStore.update(brief.id, { lifecycle: 'ready-for-distribution' });
  if (policy.distribution.mode === 'none') {
    idea = await ideaStore.updateIdea(idea.id, {
      automation: { attempts, state: 'distribution-ready', distributionState: 'not-requested', nextAction: 'Review the production.' },
    });
    return resultFromIdea(idea, channel, 'ready');
  }
  if (brief.distribution?.receipt?.externalId) {
    idea = await ideaStore.updateIdea(idea.id, {
      automation: {
        attempts,
        state: brief.distribution.request?.scheduledFor ? 'scheduled' : 'drafted',
        distributionState: 'submitted', nextAction: 'Manage the post in Postiz.', lastError: null,
      },
    });
    return resultFromIdea(idea, channel, 'unchanged-receipt');
  }

  try {
    const scheduledFor = policy.distribution.mode === 'schedule'
      ? resolvePolicySchedule(policy.distribution.schedule, now())
      : null;
    const submitter = options.submitDistribution
      ?? (policy.distribution.mode === 'draft' ? createStudioPostizDraft : submitStudioPostiz);
    const distribution = await submitter(brief, {
      approvedBy: `automation:${policy.id}:r${policy.revision}`,
      scheduledFor: scheduledFor ?? undefined,
      now,
      postizClient: options.postizClient,
    });
    brief = await briefStore.update(brief.id, {
      lifecycle: scheduledFor ? 'scheduled' : 'ready-for-distribution',
      distribution: { preparedAt: now().toISOString(), request: distribution.request, receipt: distribution.receipt },
    });
    idea = await ideaStore.updateIdea(idea.id, {
      automation: {
        attempts, state: scheduledFor ? 'scheduled' : 'drafted', distributionState: 'submitted',
        nextAction: 'Manage the post in Postiz.', lastError: null,
      },
    });
    return resultFromIdea(idea, channel, scheduledFor ? 'scheduled' : 'drafted');
  } catch (error) {
    idea = await ideaStore.updateIdea(idea.id, {
      automation: {
        attempts, state: 'review-required', distributionState: 'submission-blocked',
        lastError: error.message,
        nextAction: 'Restore Postiz readiness or fix the evidence blocker, then rerun to reuse this render.',
      },
    });
    return resultFromIdea(idea, channel, 'distribution-blocked');
  }
}

async function advanceStableMedia(brief, briefStore, options, now) {
  const publisher = options.publishArtifacts ?? publishRenderArtifacts;
  const published = await publisher({
    status: 'completed',
    provider: brief.media.provider,
    videos: [brief.media.videoPath],
  }, options.artifactOptions ?? {});
  const publicUrl = publicHttpsUrl(published.videos?.[0]);
  if (!publicUrl) return brief;
  return briefStore.update(brief.id, {
    media: {
      publicUrl,
      uploadEvidence: {
        publicUrl,
        provider: options.artifactOptions?.r2Bucket || process.env.REEL_ARTIFACT_R2_BUCKET ? 'r2' : 'public-directory',
        recordedAt: now().toISOString(),
      },
    },
  });
}

function originMatchesPolicySource(origin, policy, source) {
  return origin?.trigger?.automationPolicyId === policy.id
    && origin.trigger.automationPolicyRevision === policy.revision
    && origin.source?.adapter === source.sourceAdapter
    && origin.source.sourceId === source.sourceId
    && origin.source.fingerprint === source.fingerprint;
}

function briefInput(policy, source, channel, idea, recipe) {
  return {
    request: `Automated ${policy.label}: ${source.title}`,
    projectSlug: source.projectSlug,
    ideaId: idea.id,
    origin: originFor(policy, source),
    recipeId: recipe.id,
    recipeOptions: normalizeRecipeOptions(recipe.id, { channel }),
    channel,
    title: source.title,
    hook: source.hook,
    summary: source.summary,
    cta: source.cta,
    creativeDirection: `${recipe.outputStyle}. Preserve source-backed claims literally and visibly attribute the source.`,
    sourceEvidence: {
      canonicalUrl: source.canonicalUrl,
      claim: source.claim,
      destinationUrl: source.destinationUrl,
      rightsStatus: policy.sourceRights,
    },
    approval: { creativeStatus: 'approved', qualityAccepted: false },
    generation: { source: 'template', provider: null },
  };
}

function originFor(policy, source) {
  return {
    scope: { type: policy.scope.type, projectSlug: source.projectSlug ?? policy.scope.projectSlug },
    trigger: {
      type: policy.trigger.type,
      automationPolicyId: policy.id,
      automationPolicyRevision: policy.revision,
    },
    source: {
      adapter: source.sourceAdapter,
      sourceId: source.sourceId,
      revision: source.revision,
      fingerprint: source.fingerprint,
      canonicalUrl: source.canonicalUrl,
    },
  };
}

function selectPolicies(registry, options) {
  if (options.policy) return [typeof options.policy === 'string' ? automationPolicyById(registry, options.policy) : options.policy];
  if (Array.isArray(options.policyIds) && options.policyIds.length) {
    return options.policyIds.map((id) => automationPolicyById(registry, id));
  }
  if (options.all === true) return registry.policies.filter((policy) => policy.enabled);
  throw new Error('select one automation policy or pass all: true');
}

function boundedCount(value, ceiling) {
  if (value === undefined || value === null) return ceiling;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('autopilot count must be between 1 and 20');
  return Math.min(count, ceiling);
}

function qualityAccepted(quality, threshold) {
  if (quality?.verdict === 'pass') return true;
  return threshold === 'review' && quality?.verdict === 'review';
}

export function resolvePolicySchedule(schedule, now = new Date()) {
  if (Number.isInteger(schedule?.delayMinutes) && schedule.delayMinutes > 0) {
    return new Date(now.getTime() + schedule.delayMinutes * 60_000).toISOString();
  }
  if (schedule?.scheduledFor) {
    const date = new Date(schedule.scheduledFor);
    if (!Number.isFinite(date.getTime()) || date <= now) throw new Error('policy scheduledFor must be a future ISO date');
    return date.toISOString();
  }
  throw new Error('schedule policy requires delayMinutes or a future scheduledFor');
}

function compactRecipe(recipe) {
  return {
    id: recipe.id,
    name: recipe.name,
    engine: recipe.engine,
    outputStyle: recipe.outputStyle,
    spend: recipe.spend,
    readiness: recipe.readiness,
  };
}

function sourceSummary(source) {
  return {
    sourceAdapter: source.sourceAdapter,
    sourceId: source.sourceId,
    projectSlug: source.projectSlug,
    title: source.title,
    canonicalUrl: source.canonicalUrl,
    eligibility: source.eligibility,
  };
}

function resumeAction(idea) {
  if (TERMINAL_AUTOMATION_STATES.has(idea.automation?.state)) return 'unchanged';
  if (idea.automation?.briefId) return 'resume';
  return 'create-brief-and-produce';
}

function resultFromIdea(idea, channel, outcome) {
  return {
    ideaId: idea.id,
    briefId: idea.automation?.briefId ?? null,
    channel,
    outcome,
    state: idea.automation?.state ?? null,
    recipe: idea.automation?.selectedRecipe ?? null,
    distributionState: idea.automation?.distributionState ?? null,
    nextAction: idea.automation?.nextAction ?? null,
    error: idea.automation?.lastError ?? null,
  };
}

function summarizeRun(results) {
  const items = results.flatMap((result) => result.items);
  return {
    policies: results.length,
    discovered: results.reduce((sum, result) => sum + result.discovered, 0),
    eligible: results.reduce((sum, result) => sum + result.eligible, 0),
    items: items.length,
    unchanged: items.filter((item) => item.outcome?.startsWith('unchanged') || item.action === 'unchanged').length,
    blocked: items.filter((item) => item.state === 'failed' || item.state === 'review-required' || item.action === 'blocked').length,
    submitted: items.filter((item) => item.state === 'drafted' || item.state === 'scheduled').length,
  };
}

function countExclusions(excluded) {
  const counts = {};
  for (const source of excluded) {
    const reason = source.eligibility.reason;
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return counts;
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
