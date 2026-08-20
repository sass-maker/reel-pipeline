import { MockRenderer } from './adapters/mock-renderer.js';
import { GrokVideoAdapter } from './adapters/grok-video.js';
import { AsciiAnimationAdapter } from './adapters/ascii-animation.js';
import { HtmlCompositionAdapter } from './adapters/html-composition.js';
import { KokoroComposeAdapter } from './adapters/kokoro-compose.js';
import { BlenderAdapter } from './adapters/blender.js';
import { NightOutCarouselAdapter } from './adapters/night-out-carousel.js';
import { publishRenderArtifacts } from './artifact-publisher.js';
import { FileJobStore } from './job-store.js';
import { assertRenderableReel, attachReelRender } from './reel-intake.js';
import { normalizeVideoBrief } from './video-brief.js';
import { buildVariantPlan } from './reel-templates.js';
import { scoreVariant } from './reel-quality.js';
import { selfReviewRender } from './reel-self-review.js';
import { wrapLegacyRenderer } from '../content-factory/src/manifest.js';

export function createRenderer(mode = 'mock', options = {}) {
  if (mode === 'grok' || mode === 'grok-video' || mode === 'grok-videos') return contentFactoryAdapter(new GrokVideoAdapter(options.grokVideo ?? options.grok ?? {}));
  if (mode === 'ascii' || mode === 'ascii-animation' || mode === 'ascii-fable' || mode === 'askai') return contentFactoryAdapter(new AsciiAnimationAdapter(options.asciiAnimation ?? options.ascii ?? options.askai ?? {}));
  if (mode === 'html' || mode === 'html-composition' || mode === 'web-composition') return contentFactoryAdapter(new HtmlCompositionAdapter(options.htmlComposition ?? options.html ?? {}));
  if (mode === 'night-out-carousel') return contentFactoryAdapter(new NightOutCarouselAdapter(options.nightOutCarousel ?? {}));
  if (mode === 'kokoro' || mode === 'kokoro-compose') return contentFactoryAdapter(new KokoroComposeAdapter(options.kokoroCompose ?? options.kokoro ?? {}));
  if (mode === 'blender') return contentFactoryAdapter(new BlenderAdapter(options.blender ?? {}));
  if (mode === 'openshorts' || mode === 'ugc_actor') {
    throw new Error('openshorts/ugc_actor was removed; use a supported local renderer');
  }
  if (mode === 'mock') return contentFactoryAdapter(new MockRenderer(options.mock));
  throw new Error(`unsupported renderer mode: ${mode}`);
}

function contentFactoryAdapter(renderer) {
  return wrapLegacyRenderer(renderer, { rendererVersion: 'reel-pipeline-adapter-v1' });
}

export async function renderReelVariants(brief, options = {}) {
  const variantCount = Math.max(1, Math.min(6, Number(options.variantCount ?? 1)));
  const mode = options.mode ?? brief.renderMode ?? 'mock';
  const plan = buildVariantPlan(brief, { variantCount });
  const renderer = options.renderer ?? createRenderer(mode, options);
  const variants = [];
  const renderLog = [];

  for (const entry of plan) {
    try {
      const variantBrief = { ...brief, hook: entry.hook, cta: entry.cta, template: entry.template.id };
      const raw = await renderer.createVideo(variantBrief, {
        variantId: entry.variantId,
        template: entry.template.id,
        hook: entry.hook,
        cta: entry.cta,
      });
      const published = raw.status === 'completed' ? await publishRenderArtifacts(raw, options.artifacts) : raw;
      // Probe the real file (raw still holds the local path; published may have
      // been rewritten to upload URLs). Verified facts beat claimed metadata.
      const review = raw.status === 'completed'
        ? await selfReviewRender(raw, {
          commandRunner: options.commandRunner,
          ffprobePath: options.ffprobePath,
        })
        : null;
      const score = scoreVariant({
        brief: variantBrief,
        variant: { hook: entry.hook, cta: entry.cta },
        template: entry.template,
        proof: {
          type: raw.raw?.proof?.type,
          proofType: raw.proofType ?? raw.raw?.proof?.proofType ?? 'generated_card',
          paths: raw.proofPaths ?? raw.raw?.proof?.paths ?? [],
        },
        render: {
          ...published,
          aspect: review?.probed?.aspect ?? raw.raw?.aspect ?? '9:16',
          durationSeconds: review?.probed?.durationSeconds ?? raw.durationSeconds,
        },
      });
      if (review?.issues?.length) {
        score.reasons.push(...review.issues.map((issue) => `self-review: ${issue}`));
      }
      const variant = {
        variantId: entry.variantId,
        template: entry.template.id,
        templateLabel: entry.template.label,
        proofType: raw.proofType ?? 'generated_card',
        hook: entry.hook,
        cta: entry.cta,
        captionText: raw.captionText ?? null,
        assetUrl: firstUrl(published) ?? null,
        thumbnailUrl: typeof raw.thumbnail === 'string' ? raw.thumbnail : null,
        durationSeconds: review?.probed?.durationSeconds ?? raw.durationSeconds ?? null,
        qualityScore: score.overall,
        qualityScores: score.scores,
        slideshowRisk: score.slideshowRisk,
        selfReview: review ?? null,
        qualityReasons: score.reasons,
        renderLog: raw.renderLog ?? [],
        status: score.status,
        provider: raw.provider,
        externalTaskId: raw.externalTaskId,
        createdAt: new Date().toISOString(),
      };
      variants.push(variant);
      renderLog.push(`variant=${entry.variantId} status=${score.status} score=${score.overall}`);
    } catch (error) {
      renderLog.push(`variant=${entry.variantId} failed: ${formatError(error)}`);
      variants.push({
        variantId: entry.variantId,
        template: entry.template.id,
        templateLabel: entry.template.label,
        status: 'video_rejected',
        qualityReasons: [`render failed: ${formatError(error)}`],
        qualityScore: 0,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return { variants, renderLog };
}

function firstUrl(published) {
  if (!published) return null;
  if (Array.isArray(published.videos)) return published.videos[0] ?? null;
  if (Array.isArray(published.combinedVideos)) return published.combinedVideos[0] ?? null;
  return published.videoUrl ?? null;
}

function formatError(error) {
  if (!error) return 'unknown error';
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function createDraftVideo(input, options = {}) {
  const brief = normalizeVideoBrief(input);
  const renderer = options.renderer ?? createRenderer(options.mode ?? brief.renderMode ?? 'mock', options);
  const store = options.store ?? new FileJobStore(options.storeOptions);
  const result = await renderer.createVideo(brief);
  const render = result.status === 'completed' ? await publishRenderArtifacts(result, options.artifacts) : result;
  const job = await store.save({
    id: render.externalTaskId,
    brief,
    render,
    sync: null,
    status: render.status === 'completed' ? 'video_ready' : 'rendering',
  });

  return job;
}

export async function getDraftVideoStatus(id, options = {}) {
  const store = options.store ?? new FileJobStore(options.storeOptions);
  const job = await store.get(id);
  if (!job) return null;
  const renderer = options.renderer ?? createRenderer(options.mode ?? job.brief.renderMode ?? 'mock', options);
  if (job.render?.status === 'completed' || !renderer.getStatus) return job;
  const render = await renderer.getStatus(job.render.externalTaskId, { brief: job.brief });
  const updatedJob = await store.save({
    ...job,
    render,
    status: render.status === 'completed' ? 'video_ready' : render.status,
  });
  return updatedJob;
}

export async function renderReelDraft(id, options = {}) {
  const reelStore = options.reelStore;
  if (!reelStore) throw new Error('reelStore is required');
  const record = await reelStore.get(id);
  if (!record) return null;
  assertRenderableReel(record, options);
  const mode = options.mode ?? record.brief?.renderMode ?? 'mock';
  const variantCount = Math.max(1, Math.min(6, Number(options.variantCount ?? 1)));
  const wantsVariants = variantCount > 1;
  if (wantsVariants) {
    const { variants, renderLog } = await renderReelVariants(
      { ...record.brief, renderMode: mode },
      {
        ...options,
        mode,
        variantCount,
      },
    );
    const reel = await attachReelRender(id, { variants, renderLog, job: { id: `${record.id}-render-${Date.now()}` } }, { reelStore });
    return { reel, variants, renderLog };
  }

  const job = await createDraftVideo({ ...record.brief, renderMode: mode }, {
    ...options,
    mode,
  });
  const reel = await attachReelRender(id, job, { reelStore });
  return { reel, job };
}

export function createRenderResponse(job) {
  return {
    id: job.id,
    brief: job.brief,
    render: job.render,
    sync: job.sync,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
