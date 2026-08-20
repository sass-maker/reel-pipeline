import { resolveStudioLlm } from './llm.js';
import { buildHashtags } from './metadata.js';

const WORDS_PER_MINUTE = 150;
const MIN_DURATION = 5;
const MAX_DURATION = 20 * 60;
export const DEFAULT_VOICE = 'en-US-AriaNeural-Female';

const SHORT_SCENES = ['hook', 'setup', 'payoff', 'cta'];
const LONG_SCENES = ['hook', 'context', 'point_1', 'point_2', 'point_3', 'example', 'recap', 'cta'];

export function clampDuration(value, fallback = 60) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(MIN_DURATION, Math.min(MAX_DURATION, Math.round(numeric)));
}

export function wordBudgetForDuration(durationSeconds) {
  return Math.round((durationSeconds / 60) * WORDS_PER_MINUTE);
}

function sceneLabelsFor(durationSeconds) {
  return durationSeconds <= 90 ? SHORT_SCENES : LONG_SCENES;
}

export async function generateScript({
  topic,
  durationSeconds = 60,
  niche,
  voice = DEFAULT_VOICE,
  voiceProfile,
  inspiration,
  article,
  llm,
} = {}) {
  if (!topic && !article) throw new Error('topic or article is required');
  const duration = clampDuration(durationSeconds);
  const budget = wordBudgetForDuration(duration);
  const labels = sceneLabelsFor(duration);
  const subject = topic ?? extractArticleTopic(article);
  const client = resolveStudioLlm({ llm });

  const systemLines = [
    'You are a faceless-video scriptwriter. Output strict JSON only:',
    '{"hook": "...", "scenes": [{"label": "...", "narration": "...", "brollQuery": "...", "onScreenText": "... or null", "durationSeconds": 4}], "hashtags": ["#..."]}',
    `Use exactly these scene labels in order: ${labels.join(', ')}.`,
    `Total narration should be about ${budget} words (${duration} seconds at ${WORDS_PER_MINUTE} wpm).`,
    'Hook lands in the first 1.5 seconds. Narration is conversational, short words, no filler.',
    'Every scene needs a brollQuery suitable for stock-footage search.',
  ];
  if (voiceProfile) {
    systemLines.push(`Match this brand voice: ${JSON.stringify(voiceProfile)}`);
  }
  const userLines = [`Write the script about: ${subject}`];
  if (niche) userLines.push(`Channel niche: ${niche}`);
  if (inspiration) userLines.push(`Structure inspiration (do not copy wording, only pacing/structure):\n${String(inspiration).slice(0, 4000)}`);
  if (article) userLines.push(`Source article to adapt (use its key points, rewrite everything in the target voice):\n${String(article).slice(0, 8000)}`);

  const result = await client.generate({
    messages: [
      { role: 'system', content: systemLines.join('\n') },
      { role: 'user', content: userLines.join('\n\n') },
    ],
    maxTokens: 4096,
    normalize: (raw) => normalizeScript(raw, subject, duration, labels),
    fallback: () => templateScript(subject, duration, labels, article),
  });

  return {
    source: result.source,
    topic: subject,
    voice,
    targetDurationSeconds: duration,
    wordBudget: budget,
    ...result.data,
  };
}

function normalizeScript(raw, subject, duration, labels) {
  const rawScenes = Array.isArray(raw?.scenes) ? raw.scenes : [];
  if (!rawScenes.length) return templateScript(subject, duration, labels);
  const scenes = rawScenes.map((scene, index) => ({
    label: typeof scene.label === 'string' && scene.label.trim() ? scene.label.trim() : labels[index] ?? `scene_${index + 1}`,
    narration: typeof scene.narration === 'string' ? scene.narration.trim() : '',
    brollQuery: typeof scene.brollQuery === 'string' && scene.brollQuery.trim() ? scene.brollQuery.trim() : subject,
    onScreenText: typeof scene.onScreenText === 'string' && scene.onScreenText.trim() ? scene.onScreenText.trim() : null,
    durationSeconds: clampSceneDuration(scene.durationSeconds),
  })).filter((scene) => scene.narration);
  if (!scenes.length) return templateScript(subject, duration, labels);
  rebalanceDurations(scenes, duration);
  return {
    hook: typeof raw.hook === 'string' && raw.hook.trim() ? raw.hook.trim() : scenes[0].narration,
    scenes,
    hashtags: Array.isArray(raw.hashtags) && raw.hashtags.length ? raw.hashtags.slice(0, 8) : buildHashtags(subject),
  };
}

function templateScript(subject, duration, labels, article) {
  const keyPoints = article ? extractKeyPoints(article, labels.length) : [];
  const budget = wordBudgetForDuration(duration);
  const wordsPerScene = Math.max(10, Math.round(budget / labels.length));
  const scenes = labels.map((label, index) => {
    const point = keyPoints[index] ?? null;
    return {
      label,
      narration: templateNarration(label, subject, point, wordsPerScene),
      brollQuery: point ? `${subject} ${label.replace(/_/g, ' ')}` : subject,
      onScreenText: label === 'hook' ? shortOverlay(subject) : null,
      durationSeconds: 4,
    };
  });
  rebalanceDurations(scenes, duration);
  return {
    hook: scenes[0].narration,
    scenes,
    hashtags: buildHashtags(subject),
  };
}

function templateNarration(label, subject, point, wordsPerScene) {
  const bank = {
    hook: `Here is the one thing about ${subject} that changes how you see it.`,
    setup: `Most explanations of ${subject} skip the part that actually matters, so let us fix that right now.`,
    context: `Before the details, here is the context: ${subject} shows up everywhere once you know what to look for, and the basics take one minute to grasp.`,
    payoff: `The core idea is simple: understand the mechanism behind ${subject}, apply it once, and the results compound from there.`,
    example: `Take one concrete example: apply ${subject} to a real case and watch which step makes the difference.`,
    recap: `Quick recap: know the mechanism, start small, and let repetition do the heavy lifting with ${subject}.`,
    cta: `If this made ${subject} click, follow for the next one.`,
  };
  let narration = point ?? bank[label] ?? `Here is what you should know about ${subject} next.`;
  // Pad toward the per-scene word budget so long-form durations hold up.
  const filler = ` Think about how this applies to your own situation with ${subject}, because the difference shows up fast once you act on it.`;
  while (narration.split(/\s+/).length < wordsPerScene - 10) {
    narration += filler;
  }
  return narration;
}

function shortOverlay(subject) {
  return subject.split(/\s+/).slice(0, 4).join(' ');
}

export function extractArticleTopic(article) {
  const firstLine = String(article ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? 'this topic';
  return firstLine.replace(/^#+\s*/, '').slice(0, 80);
}

export function extractKeyPoints(article, count) {
  const text = String(article ?? '');
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 40);
  const points = paragraphs.map((p) => {
    const sentence = p.split(/(?<=[.!?])\s+/)[0] ?? p;
    return sentence.slice(0, 220);
  });
  return points.slice(0, count);
}

function clampSceneDuration(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 4;
  return Math.max(2, Math.min(90, Math.round(numeric)));
}

function rebalanceDurations(scenes, target) {
  const total = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  if (Math.abs(total - target) <= 2) return;
  const factor = target / total;
  let drift = 0;
  for (const scene of scenes) {
    const scaled = scene.durationSeconds * factor;
    const rounded = Math.max(2, Math.round(scaled + drift));
    drift = scaled + drift - rounded;
    scene.durationSeconds = rounded;
  }
}

export function formatTranscriptAsScript(transcript, options = {}) {
  return generateScript({ ...options, article: transcript });
}
