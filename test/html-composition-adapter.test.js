import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  buildHtmlComposition,
  HtmlCompositionAdapter,
} from '../src/adapters/html-composition.js';
import { createDraftVideo, createRenderer } from '../src/pipeline.js';
import { normalizeVideoBrief } from '../src/video-brief.js';

const reelBody = [
  'Script: show how the operator sees a missed post before it becomes a launch gap.',
  'Shot list: summary card, queue filter, pending metrics row.',
  'Captions: "missed posts are visible" and "metrics sync has a queue".',
  'Asset prompts: HTML motion cards with product UI proof.',
].join('\n');

function deterministicVideoOptions() {
  return {
    frameRenderer: async (_htmlPath, timeline, framesDir) => Promise.all(timeline.scenes.map(async (scene) => {
      const framePath = path.join(framesDir, `scene-${scene.index}.png`);
      await writeFile(framePath, Buffer.from('fixture-png'));
      return { path: framePath, duration: scene.duration, motion: scene.motion };
    })),
    commandRunner: async (_binary, args) => {
      await writeFile(args.at(-1), Buffer.from('fixture-video'));
      return { stdout: '', stderr: '' };
    },
  };
}

test('html composition render modes map to HtmlCompositionAdapter', () => {
  assert.equal(createRenderer('html').constructor.name, 'HtmlCompositionAdapter');
  assert.equal(createRenderer('html-composition').constructor.name, 'HtmlCompositionAdapter');
  assert.equal(createRenderer('web-composition').constructor.name, 'HtmlCompositionAdapter');
});

test('video brief accepts html composition render modes', () => {
  const brief = normalizeVideoBrief({
    id: 'brief-html',
    projectSlug: 'reel-pipeline',
    channel: 'youtube_shorts',
    title: 'Ops preview',
    hook: 'A queue should show what needs action.',
    body: reelBody,
    renderMode: 'html-composition',
  });

  assert.equal(brief.renderMode, 'html-composition');
});

test('buildHtmlComposition emits timeline, preview HTML, and word cues', () => {
  const brief = normalizeVideoBrief({
    id: 'brief-html',
    projectSlug: 'reel-pipeline',
    channel: 'instagram_reels',
    title: 'Ops preview',
    hook: 'A queue should show what needs action.',
    body: reelBody,
    renderMode: 'html',
    durationSeconds: 12,
  });

  const composition = buildHtmlComposition(brief);
  assert.equal(composition.timeline.format, 'html-composition-v1');
  assert.equal(composition.timeline.width, 1080);
  assert.equal(composition.timeline.height, 1920);
  assert.equal(composition.timeline.durationSeconds, 12);
  assert.ok(composition.timeline.scenes.length >= 3);
  assert.ok(composition.captions.length > 0);
  assert.ok(composition.captions[0].words.length > 0);
  assert.match(composition.html, /setCompositionTime/);
  assert.match(composition.html, /A queue should show/);
  assert.doesNotThrow(() =>
    JSON.parse(composition.html.match(/<script type="application\/json" id="captions">([^<]+)<\/script>/)?.[1] ?? '')
  );
});

test('HTML visual styles change composition structure and motion plans', () => {
  const base = {
    id: 'brief-html-style',
    projectSlug: 'reel-pipeline',
    channel: 'instagram_reels',
    title: 'Style proof',
    hook: 'The same idea should have visibly different art direction.',
    body: reelBody,
    renderMode: 'html',
    durationSeconds: 12,
  };
  const kinetic = buildHtmlComposition(normalizeVideoBrief({
    ...base,
    renderOptions: { visualStyle: 'kinetic-type' },
  }));
  const grid = buildHtmlComposition(normalizeVideoBrief({
    ...base,
    renderOptions: { visualStyle: 'editorial-grid' },
  }));

  assert.equal(kinetic.timeline.visualStyle, 'kinetic-type');
  assert.equal(grid.timeline.visualStyle, 'editorial-grid');
  assert.notDeepEqual(kinetic.timeline.scenes.map((scene) => scene.motion), grid.timeline.scenes.map((scene) => scene.motion));
  assert.match(kinetic.html, /data-style="kinetic-type"/);
  assert.match(grid.html, /data-style="editorial-grid"/);
});

test('HtmlCompositionAdapter smoke proves request to status to artifact metadata', async () => {
  const root = path.resolve('./tmp/html-composition-test');
  const artifactDir = path.join(root, 'artifacts');
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  const adapter = new HtmlCompositionAdapter({
    artifactDir,
    now: () => new Date('2026-07-03T00:00:00.000Z'),
    ...deterministicVideoOptions(),
  });
  const brief = normalizeVideoBrief({
    id: 'brief-html-preview',
    projectSlug: 'reel-pipeline',
    channel: 'tiktok',
    title: 'Ops preview',
    hook: 'Rendered posts need visible operating state.',
    body: reelBody,
    renderMode: 'html',
    durationSeconds: 10,
  });

  const render = await adapter.createVideo(brief);
  assert.equal(render.provider, 'html-composition');
  assert.equal(render.status, 'completed');
  assert.equal(render.externalTaskId, 'html_brief-html-preview_1783036800000');
  assert.equal(render.videos.length, 1);
  assert.match(render.videos[0], /\.mp4$/);
  assert.equal(render.durationSeconds, 10);
  assert.ok(render.renderLog.includes('style=html-css-composition'));
  assert.match(render.raw.previewHtmlPath, /composition\.html$/);
  assert.match(render.raw.timelinePath, /timeline\.json$/);
  assert.match(render.raw.captionsPath, /captions\.json$/);

  const timeline = JSON.parse(await readFile(render.raw.timelinePath, 'utf8'));
  const captions = JSON.parse(await readFile(render.raw.captionsPath, 'utf8'));
  assert.equal(timeline.format, 'html-composition-v1');
  assert.ok(captions[0].words[0].start >= 0);

  const status = await adapter.getStatus(render.externalTaskId);
  assert.equal(status.provider, 'html-composition');
  assert.equal(status.raw.previewHtmlPath, render.raw.previewHtmlPath);
});

test('createDraftVideo can save an html composition preview job', async () => {
  const root = path.resolve('./tmp/html-composition-draft-test');
  const artifactDir = path.join(root, 'artifacts');
  await rm(root, { recursive: true, force: true });

  const job = await createDraftVideo(
    {
      id: 'brief-html-draft',
      projectSlug: 'reel-pipeline',
      channel: 'instagram_reels',
      title: 'HTML composition preview',
      hook: 'Video previews can be web pages first.',
      body: reelBody,
      renderMode: 'html',
    },
    {
      htmlComposition: {
        artifactDir,
        now: () => new Date('2026-07-03T00:00:00.000Z'),
        ...deterministicVideoOptions(),
      },
      storeOptions: {
        root,
      },
    }
  );

  assert.equal(job.status, 'video_ready');
  assert.equal(job.render.provider, 'html-composition');
  assert.equal(job.render.videos.length, 1);
  assert.match(job.render.raw.previewHtmlPath, /composition\.html$/);
});
