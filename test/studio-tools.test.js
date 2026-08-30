import assert from 'node:assert/strict';
import test from 'node:test';

import { StudioLlm } from '../src/studio/llm.js';
import { generateIdeas, exploreNiche, suggestChannelNames } from '../src/studio/ideas.js';
import { generateTitles, generateDescription, generateTags, organizeTags, buildHashtags } from '../src/studio/metadata.js';
import { generateScript, wordBudgetForDuration } from '../src/studio/script.js';
import { deriveVoiceProfile, analyzeSamples } from '../src/studio/brand-voice.js';
import { generateThumbnailConcepts, clampOverlay } from '../src/studio/thumbnails.js';

const offlineLlm = new StudioLlm({ apiKey: '' });

function llmStub(payload) {
  return new StudioLlm({
    apiKey: 'test-key',
    fetchImpl: async () =>
      Response.json({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
  });
}

test('studio tools return template output when no llm is configured', async () => {
  const result = await generateTitles({ topic: 'compound interest', llm: offlineLlm });
  assert.equal(result.source, 'template');
  assert.ok(result.data.titles.length >= 5);
});

test('studio tools return llm output when configured', async () => {
  const llm = llmStub({ titles: ['Title A', 'Title B', 'Title C', 'Title D', 'Title E'] });
  const result = await generateTitles({ topic: 'compound interest', llm });
  assert.equal(result.source, 'llm');
  assert.deepEqual(result.data.titles, ['Title A', 'Title B', 'Title C', 'Title D', 'Title E']);
});

test('llm failure falls back to template', async () => {
  const llm = new StudioLlm({
    apiKey: 'test-key',
    fetchImpl: async () => new Response('boom', { status: 500 }),
    logger: { warn: () => {} },
  });
  const result = await generateTitles({ topic: 'compound interest', llm });
  assert.equal(result.source, 'template');
  assert.ok(result.data.titles.length >= 5);
});

test('idea generation returns N distinct ideas with required fields', async () => {
  const result = await generateIdeas({ niche: 'personal finance', count: 12, llm: offlineLlm });
  const ideas = result.data.ideas;
  assert.equal(ideas.length, 12);
  assert.equal(new Set(ideas.map((idea) => idea.title)).size, 12);
  for (const idea of ideas) {
    assert.ok(idea.title && idea.angle && idea.hook && idea.format);
  }
});

test('niche explorer and channel names produce suggestions', async () => {
  const niche = await exploreNiche({ niche: 'home coffee', llm: offlineLlm });
  assert.ok(niche.data.subNiches.length >= 3);
  const names = await suggestChannelNames({ niche: 'home coffee', count: 6, llm: offlineLlm });
  assert.equal(names.data.names.length, 6);
});

test('titles stay under 100 characters', async () => {
  const result = await generateTitles({ topic: 'a very long topic about the history of mechanical keyboards and why they matter', llm: offlineLlm });
  for (const title of result.data.titles) {
    assert.ok(title.length <= 100);
  }
});

test('description contains hook, chapters, and cta', async () => {
  const result = await generateDescription({ topic: 'sourdough starters', cta: 'Follow for more baking.', llm: offlineLlm });
  assert.match(result.data.description, /Chapters:/);
  assert.match(result.data.description, /Follow for more baking\./);
});

test('generated tags respect the 500-char joined budget with no duplicates', async () => {
  const result = await generateTags({ topic: 'intermittent fasting', niche: 'health', llm: offlineLlm });
  assert.ok(result.joinedLength <= 500);
  assert.equal(new Set(result.tags).size, result.tags.length);
});

test('organizeTags dedupes, trims, and enforces the budget', () => {
  const noisy = ['  Alpha ', 'alpha', '#beta', 'beta', 'x'.repeat(600), 'gamma delta epsilon'];
  const result = organizeTags(noisy);
  assert.deepEqual(result.tags.includes('alpha'), true);
  assert.equal(result.tags.filter((t) => t === 'alpha').length, 1);
  assert.ok(result.joinedLength <= 500);
  assert.ok(result.dropped >= 1);
});

test('buildHashtags returns bounded lowercase hashtags', () => {
  const tags = buildHashtags('Compound Interest', ['Finance']);
  assert.ok(tags.length <= 8);
  for (const tag of tags) assert.match(tag, /^#[a-z0-9]+$/);
});

test('script word count scales to a 10-minute duration within ±20%', async () => {
  const script = await generateScript({ topic: 'index fund investing', durationSeconds: 600, llm: offlineLlm });
  const budget = wordBudgetForDuration(600);
  const words = script.scenes.reduce((sum, scene) => sum + scene.narration.split(/\s+/).length, 0);
  assert.ok(words >= budget * 0.8 && words <= budget * 1.2, `expected ~${budget} words, got ${words}`);
});

test('script scene durations sum to the target within 10%', async () => {
  const script = await generateScript({ topic: 'index fund investing', durationSeconds: 90, llm: offlineLlm });
  const total = script.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  assert.ok(Math.abs(total - 90) <= 9, `expected ~90s, got ${total}`);
});

test('article converts into a scene-structured script using its key points', async () => {
  const article = [
    'Why Cold Brew Wins',
    '',
    'Cold brew coffee is less acidic than hot coffee because the grounds never touch hot water. That single fact changes the flavor completely.',
    '',
    'Steeping for sixteen hours extracts sweetness without bitterness, which is why cafes charge a premium for it.',
    '',
    'Making it at home costs about a tenth of the cafe price and takes five minutes of active work.',
  ].join('\n');
  const script = await generateScript({ article, durationSeconds: 60, llm: offlineLlm });
  assert.equal(script.topic, 'Why Cold Brew Wins');
  assert.ok(script.scenes.length >= 3);
  const narration = script.scenes.map((scene) => scene.narration).join(' ');
  assert.match(narration, /less acidic/);
});

test('brand voice profile derives tone and metrics from transcripts', async () => {
  const sample = "Look, here's the thing. It's simple! You test it. You ship it. You learn. Don't overthink it! What's stopping you? Nothing. That's the move. Ship it again! It's honestly that simple. You've got this.";
  const profile = await deriveVoiceProfile({ transcripts: [sample], llm: offlineLlm });
  assert.ok(Array.isArray(profile.data.tone) && profile.data.tone.length >= 1);
  assert.ok(profile.data.heuristics.metrics.avgSentenceLength < 12);
  const heuristics = analyzeSamples([sample]);
  assert.ok(heuristics.tone.includes('punchy'));
});

test('thumbnail concepts have overlay text of at most 4 words', async () => {
  const result = await generateThumbnailConcepts({ topic: 'budget travel hacks for europe', count: 3, llm: offlineLlm });
  assert.ok(result.data.concepts.length >= 3);
  for (const concept of result.data.concepts) {
    assert.ok(concept.overlayText.split(/\s+/).length <= 4);
  }
  assert.equal(clampOverlay('one two three four five six'), 'one two three four');
});
