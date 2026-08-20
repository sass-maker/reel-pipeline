import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeVideoBrief } from '../video-brief.js';
import { createRenderer } from '../pipeline.js';
import { publishRenderArtifacts } from '../artifact-publisher.js';
import { generateScript, DEFAULT_VOICE } from './script.js';
import { normalizeKokoroVoice } from '../adapters/kokoro.js';
import { generateTitles, generateTags, buildHashtags } from './metadata.js';
import { IdeaStore } from './idea-store.js';
import { assessRender } from './quality.js';

const VOICE_ROTATION_POOL = [
  'en-US-AriaNeural-Female',
  'en-US-GuyNeural-Male',
  'en-US-JennyNeural-Female',
];

export function scriptToBrief(script, options = {}) {
  const {
    projectSlug = 'studio',
    channel = 'youtube_shorts',
    id = `studio_${slugify(script.topic)}`,
    engine = 'mock',
    voiceRotation = false,
    hook,
    summary,
    cta,
    creativeDirection,
    recordingUrl,
    literalScenes,
    renderOptions,
    cast,
    soundtrack,
    matureAssertions,
  } = options;

  const body = [
    `Script for ${script.topic}`,
    '',
    'Scenes (shot list):',
    ...script.scenes.map((scene, index) => [
      `${index + 1}. [${scene.label}] (${scene.durationSeconds}s)`,
      `   Narration: ${scene.narration}`,
      `   Visual asset prompt: ${scene.brollQuery}`,
      scene.onScreenText ? `   Caption overlay: ${scene.onScreenText}` : '   Caption overlay: none',
    ].join('\n')),
    '',
    `Captions: auto-generated from narration, bottom position.`,
    `Hashtags: ${script.hashtags.join(' ')}`,
    creativeDirection ? `Creative direction: ${creativeDirection}` : null,
  ].filter(Boolean).join('\n');

  const brief = normalizeVideoBrief({
    id,
    projectSlug,
    channel,
    title: script.topic,
    summary,
    creativeDirection,
    hook: hook ?? script.hook,
    body,
    cta,
    renderMode: engine,
    durationSeconds: Math.max(5, Math.min(90, script.targetDurationSeconds)),
    recordingUrl,
    literalScenes,
    renderOptions,
    cast,
    soundtrack,
    matureAssertions,
  });

  const baseVoice = script.voice ?? DEFAULT_VOICE;
  const voicePlan = {
    rotation: Boolean(voiceRotation),
    voice: baseVoice,
    scenes: script.scenes.map((scene, index) => ({
      label: scene.label,
      voice: voiceRotation ? VOICE_ROTATION_POOL[index % VOICE_ROTATION_POOL.length] : baseVoice,
    })),
  };

  return { brief, voicePlan };
}

export async function runFacelessWorkflow({
  topic,
  niche,
  durationSeconds = 60,
  engine = 'mock',
  voice = DEFAULT_VOICE,
  voiceRotation = false,
  voiceProfile,
  projectSlug = 'studio',
  channel = 'youtube_shorts',
  briefId,
  hook,
  cta,
  creativeDirection,
  recordingUrl,
  literalScenes,
  renderOptions,
  cast,
  soundtrack,
  matureAssertions,
  outputDir = './tmp/studio/faceless',
  postHandoff = false,
  ideaId,
  ideaStore,
  assessQuality = assessRender,
  rendererOptions = {},
  llm,
  logger = console,
} = {}) {
  if (!topic || !topic.trim()) throw new Error('topic is required');

  const isKokoroEngine = engine === 'kokoro' || engine === 'kokoro-compose';
  const effectiveVoice = isKokoroEngine ? normalizeKokoroVoice(voice) : voice;
  const script = await generateScript({
    topic,
    niche,
    durationSeconds,
    voice: effectiveVoice,
    voiceProfile,
    inspiration: creativeDirection,
    llm,
  });
  if (hook) script.hook = hook;
  const { brief, voicePlan } = scriptToBrief(script, {
    projectSlug,
    channel,
    id: briefId ? `studio_${briefId}` : undefined,
    engine,
    voiceRotation,
    hook,
    summary:niche,
    cta,
    creativeDirection,
    recordingUrl,
    literalScenes,
    renderOptions,
    cast,
    soundtrack,
    matureAssertions,
  });
  const [titles, tags] = await Promise.all([
    generateTitles({ topic, llm }),
    generateTags({ topic, niche, llm }),
  ]);

  const dir = path.resolve(outputDir, slugify(topic));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'script.json'), JSON.stringify(script, null, 2));
  await writeFile(path.join(dir, 'brief.json'), JSON.stringify(brief, null, 2));
  await writeFile(path.join(dir, 'metadata.json'), JSON.stringify({
    titles: titles.data?.titles ?? titles.titles,
    tags: tags.tags,
    hashtags: script.hashtags?.length ? script.hashtags : buildHashtags(topic),
    voicePlan,
    projectSlug,
    channel,
    creativeDirection: creativeDirection ?? null,
  }, null, 2));

  const engineOptions = isKokoroEngine
    ? { ...rendererOptions, kokoroCompose: { script, voice: effectiveVoice, ...(rendererOptions.kokoroCompose ?? {}) } }
    : rendererOptions;
  const renderer = rendererOptions.renderer ?? createRenderer(engine, engineOptions);
  const render = await renderer.createVideo(brief);
  await writeFile(path.join(dir, 'render.json'), JSON.stringify(render, null, 2));

  const quality = await assessQuality({ script, videoPath: render.videos?.[0] ?? null });
  await writeFile(path.join(dir, 'quality.json'), JSON.stringify(quality, null, 2));

  const store = ideaStore ?? new IdeaStore();
  const idea = ideaId
    ? await store.updateIdea(ideaId, { status: 'rendered', hook: script.hook, notes: `artifacts: ${dir}` })
    : await store.saveIdea({
      title: script.topic,
      niche: niche ?? null,
      hook: script.hook,
      status: 'rendered',
      notes: `artifacts: ${dir}`,
    });

  const summary = {
    topic: script.topic,
    projectSlug,
    channel,
    scriptSource: script.source,
    engine,
    durationSeconds: script.targetDurationSeconds,
    artifactDir: dir,
    video: render.videos?.[0] ?? null,
    previewPath: render.videos?.[0] ?? render.raw?.previewHtmlPath ?? render.artifacts?.[0] ?? null,
    previewType: render.videos?.[0] ? 'video' : render.raw?.previewHtmlPath ? 'html' : render.artifacts?.[0] ? 'image' : null,
    renderStatus: render.status,
    quality,
    ideaId: idea.id,
    voicePlan,
    postHandoff: postHandoff
      ? {
        note: 'render complete; submit an approved content package and media receipt to Postiz',
        command: 'npm run distribution -- --file <content-package.json> --receipt <media-receipt.json> --provider postiz',
      }
      : null,
  };
  logger.info?.(`faceless workflow complete: ${summary.video ?? summary.renderStatus} (${dir})`);
  return summary;
}

export async function runBatch({ topics, topicsFile, ...options } = {}) {
  const list = topics ?? await loadTopicsFile(topicsFile);
  if (!Array.isArray(list) || !list.length) throw new Error('batch requires at least one topic');
  const results = [];
  for (const topic of list) {
    try {
      const summary = await runFacelessWorkflow({ ...options, topic });
      results.push({ topic, ok: true, summary });
    } catch (error) {
      results.push({ topic, ok: false, error: error.message });
    }
  }
  const summary = {
    total: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
  if (options.outputDir) {
    const dir = path.resolve(options.outputDir);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'batch-summary.json'), JSON.stringify(summary, null, 2));
  }
  return summary;
}

export async function runSourceBackedWorkflow({
  source,
  recipe,
  channel = 'youtube_shorts',
  briefId,
  ideaId,
  ideaStore,
  outputDir = './tmp/studio/autopilot',
  assessQuality = assessRender,
  rendererOptions = {},
  artifactOptions = {},
  publishArtifacts = publishRenderArtifacts,
  now = () => new Date(),
  logger = console,
} = {}) {
  if (!source?.title || !source?.claim || !source?.canonicalUrl) {
    throw new Error('source-backed workflow requires title, claim, and canonicalUrl');
  }
  if (!recipe?.engine) throw new Error('source-backed workflow requires a production recipe');

  const variant = source.contentPackage?.variants?.find((entry) => entry.channel === channel) ?? null;
  const durationSeconds = recipe.defaults?.durationSeconds ?? 30;
  const copy = [
    variant?.hook ?? source.hook,
    variant?.summary ?? source.summary,
    variant?.proof ?? source.claim,
    variant?.cta ?? source.cta,
  ].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
  const sceneDuration = Math.max(2, Math.floor(durationSeconds / copy.length));
  const script = {
    source: 'standing-policy-source',
    topic: source.title,
    voice: DEFAULT_VOICE,
    targetDurationSeconds: durationSeconds,
    wordBudget: copy.join(' ').split(/\s+/).filter(Boolean).length,
    hook: copy[0],
    scenes: copy.map((narration, index) => ({
      label: ['hook', 'context', 'proof', 'cta'][index] ?? `scene_${index + 1}`,
      narration,
      brollQuery: `${source.title} literal visual ${index + 1}`,
      onScreenText: narration,
      durationSeconds: index === copy.length - 1
        ? durationSeconds - sceneDuration * (copy.length - 1)
        : sceneDuration,
    })),
    hashtags: buildHashtags(source.title),
  };
  const { brief, voicePlan } = scriptToBrief(script, {
    projectSlug: source.projectSlug,
    channel,
    id: briefId ? `studio_${briefId}` : undefined,
    engine: recipe.engine,
    hook: script.hook,
    cta: source.cta,
    creativeDirection: `${recipe.outputStyle}. Use only the supplied source-backed copy. Evidence: ${source.canonicalUrl}`,
  });
  const dir = path.resolve(outputDir, `${slugify(source.title)}-${channel}`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'script.json'), JSON.stringify(script, null, 2));
  await writeFile(path.join(dir, 'brief.json'), JSON.stringify(brief, null, 2));
  await writeFile(path.join(dir, 'source.json'), JSON.stringify(source, null, 2));

  const renderer = rendererOptions.renderer ?? createRenderer(recipe.engine, rendererOptions);
  const rawRender = await renderer.createVideo(brief);
  await writeFile(path.join(dir, 'render.json'), JSON.stringify(rawRender, null, 2));
  const localVideo = rawRender.videos?.[0] ?? null;
  const publishedRender = rawRender.status === 'completed'
    ? await publishArtifacts(rawRender, artifactOptions)
    : rawRender;
  const quality = await assessQuality({ script, videoPath: localVideo });
  await writeFile(path.join(dir, 'quality.json'), JSON.stringify(quality, null, 2));

  const store = ideaStore ?? new IdeaStore();
  const idea = ideaId
    ? await store.updateIdea(ideaId, { status: 'rendered', hook: script.hook, notes: `artifacts: ${dir}` })
    : await store.saveIdea({ title: source.title, projectSlug: source.projectSlug, status: 'rendered', notes: `artifacts: ${dir}` });
  const publishedVideo = publishedRender.videos?.[0] ?? localVideo;
  const publicUrl = publicHttpsUrl(publishedVideo);
  const summary = {
    topic: source.title,
    projectSlug: source.projectSlug,
    channel,
    scriptSource: script.source,
    engine: recipe.engine,
    durationSeconds,
    artifactDir: dir,
    video: publishedVideo,
    localVideo,
    publicUrl,
    previewPath: localVideo ?? publishedRender.raw?.previewHtmlPath ?? publishedRender.artifacts?.[0] ?? null,
    previewType: localVideo ? 'video' : publishedRender.raw?.previewHtmlPath ? 'html' : publishedRender.artifacts?.[0] ? 'image' : null,
    renderStatus: publishedRender.status,
    provider: publishedRender.provider ?? recipe.engine,
    quality,
    ideaId: idea.id,
    voicePlan,
    uploadEvidence: publicUrl ? {
      publicUrl,
      provider: artifactOptions.r2Bucket || process.env.REEL_ARTIFACT_R2_BUCKET ? 'r2' : 'public-directory',
      recordedAt: now().toISOString(),
    } : null,
  };
  logger.info?.(`source-backed workflow complete: ${summary.video ?? summary.renderStatus} (${dir})`);
  return summary;
}

async function loadTopicsFile(topicsFile) {
  if (!topicsFile) throw new Error('topics or topicsFile is required');
  const raw = await readFile(path.resolve(topicsFile), 'utf8');
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    return parsed.map((entry) => (typeof entry === 'string' ? entry : entry?.topic)).filter(Boolean);
  }
  return trimmed.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'topic';
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
