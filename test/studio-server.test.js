import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { writeFile } from 'node:fs/promises';
import { createServer } from '../src/server/index.js';
import { StudioLlm } from '../src/studio/llm.js';
import { IdeaStore } from '../src/studio/idea-store.js';
import { MarketingBriefStore } from '../src/studio/briefs.js';
import { listLocalVideoWorkflowRecipes } from '../src/local-video-workflow-recipes.js';
import modelConfig from '../config/forge-model-profiles.json' with { type: 'json' };

function deterministicHtmlVideoOptions() {
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

async function startServer(studioOverrides = {}) {
  const scratch = await mkdtemp(path.join(tmpdir(), 'studio-server-'));
  const localFinal = modelConfig.profiles.find((profile) => profile.id === 'ltx-2.3-mlx-q4');
  for (const relativePath of localFinal.requiredPaths) {
    const target = path.join(scratch, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'fixture');
  }
  const workflowRecipes = studioOverrides.workflowRecipes ?? listLocalVideoWorkflowRecipes({ rootDir: process.cwd() })
    .map((recipe) => ({ ...recipe, readiness: { ready: true, state: 'ready', blocker: null, missing: [], unhashed: [] } }));
  const server = createServer({
    reelStoreOptions: { filePath: path.join(scratch, 'reels.json') },
    lessonStoreOptions: { filePath: path.join(scratch, 'lessons.json') },
    studio: {
      llm: new StudioLlm({ apiKey: '' }),
      ideaStore: new IdeaStore({ filePath: path.join(scratch, 'ideas.json') }),
      briefStore: new MarketingBriefStore({
        filePath: path.join(scratch, 'briefs.json'),
        workflowProposalOptions: { recipes: workflowRecipes },
      }),
      workflowRecipes,
      modelOptions: { rootDir: scratch },
      characterStoreOptions: { filePath: path.join(scratch, 'characters.json') },
      voiceIntakeOptions: {
        artifactDir: path.join(scratch, 'voice'),
        commandRunner: async () => { throw new Error('runtime missing'); },
      },
      facelessOutputDir: path.join(scratch, 'faceless'),
      artifactRoots: [scratch],
      galleryRoot: scratch,
      galleryConfig: {
        schema: 'fleet.video-explore-gallery.v1',
        version: 1,
        items: [{
          id: 'gallery-proof',
          title: 'Gallery proof',
          family: 'Motion graphics',
          description: 'Registered range fixture.',
          engine: 'HTML / Canvas',
          sourcePosture: 'local-render',
          qualityTier: 'showcase',
          spend: 'No API spend',
          variantId: 'web-motion--visualstyle-kinetic-type',
          source: 'gallery.mp4',
        }],
      },
      rendererOptions: {
        mock: { artifactDir: path.join(scratch, 'renders') },
        htmlComposition: { artifactDir: path.join(scratch, 'html-renders'), ...deterministicHtmlVideoOptions() },
      },
      videoRealExecutors: {
        'coherent-local-film': async () => {
          const videoPath = path.join(scratch, 'workflow-proposal-result.mp4');
          await writeFile(videoPath, Buffer.from('workflow-proposal-video'));
          return { videoPath, renderer: 'test-local-video', quality: { verdict: 'pass', basis: 'bounded test executor' } };
        },
      },
      blenderCapability: { ready: false, executable: null, version: null, blocker: 'Blender unavailable for deterministic test.' },
      htmlCapability: { ready: true, chromePath: '/fixture/chrome', ffmpegPath: '/fixture/ffmpeg', blocker: null },
      kokoroReady: false,
      platformAudioCommandRunner: async (command, args) => {
        if (command !== 'ffmpeg') throw new Error(`unexpected platform-audio command: ${command}`);
        await copyFile(args[args.indexOf('-i') + 1], args.at(-1));
        return { stdout: '', stderr: '' };
      },
      platformAudioProbe: async () => ({
        durationSeconds: 30,
        bytes: 128,
        hasVideo: true,
        hasAudio: false,
        videoCodec: 'h264',
        width: 1080,
        height: 1920,
        frameRate: '30/1',
      }),
      logger: { info: () => {}, warn: () => {} },
      ...studioOverrides,
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, scratch };
}

test('studio server routes', async (t) => {
  const { server, base, scratch } = await startServer();
  t.after(() => server.close());

  await t.test('GET /studio serves a simple Video Maker while keeping tool APIs available', async () => {
    const res = await fetch(`${base}/studio`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const page = await res.text();
    for (const marker of ['Video ideas', 'Titles', 'Tags', 'Script', 'Keywords', 'Transcript', 'Thumbnails', 'Brand voice', 'Ideas manager', 'Faceless run']) {
      assert.ok(page.includes(marker), `page missing panel: ${marker}`);
    }
    for (const marker of [
      '<h1>Video Maker</h1>',
      'Describe the video.',
      'Automatic paid generation spend is $0; approved media is imported manually.',
      'Plan workflow',
      'Film style',
      'How Film styles work',
      'id="production-search"',
      'Command or Control + Enter',
      'id="operation-status"',
      'Editorial decision',
      'data-review-decision="accepted"',
      'Settings <span>Optional</span>',
      'What should we make?',
      'Faceless lesson',
      'Brand reel',
      'Guided app demo',
      'Coherent film',
      'Lyric video',
      'Night Out carousel',
      'id="quick-theme"',
      'id="quick-model"',
      'Mature-enabled adults',
      'Proposed route · nothing has run',
      'Inspect model, runtime, and graph',
      'Revise plan',
      'Run this plan',
      "activateView('productions')",
      'Everything you made. Ready to revisit.',
      'Est. final',
      'id="tab-recipes"',
      'id="tab-workflows"',
      'Now showing',
      'Video library',
      'Drafts and incomplete plans',
      'Open video',
      'Play music with this video',
      'Makeba',
      'One Kiss',
      'Levitating',
      'Blinding Lights',
    ]) {
      assert.ok(page.includes(marker), `page missing Video Maker control: ${marker}`);
    }
    const inlineScript = page.match(/<script>([\s\S]*)<\/script>/)?.[1];
    assert.ok(inlineScript, 'page must include its application script');
    assert.doesNotThrow(() => new Function(inlineScript), 'Video Maker application script must parse');
    assert.doesNotMatch(page, /Five films|five LTX|WORKFLOW_SAMPLES|sample-filmstrip/);
    assert.doesNotMatch(page, /<section class="capability-picker"/);
    assert.match(page, /id="tab-tools"[^>]+hidden/);
  });

  await t.test('POST /studio/titles returns tool output', async () => {
    const res = await fetch(`${base}/studio/titles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: 'latte art' }),
    });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.data.source, 'template');
    assert.ok(payload.data.data.titles.length >= 5);
  });

  await t.test('voice intake preserves recordings when no local transcriber is ready', async () => {
    const readiness = await fetch(`${base}/studio/voice-readiness`);
    assert.equal(readiness.status, 200);
    assert.equal((await readiness.json()).data.ready, false);
    const response = await fetch(`${base}/studio/voice-intake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ audioBase64: Buffer.from('local-voice-fixture').toString('base64'), mimeType: 'audio/webm' }),
    });
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.match(payload.error, /recording is preserved/i);
    assert.ok(payload.data.recording.recordingPath.startsWith(path.join(scratch, 'voice')));
  });

  await t.test('character directory and fixed workflow actions round trip', async () => {
    const characterResponse = await fetch(`${base}/studio/characters`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Mira', age: 28, adultConfirmed: true, consentPosture: 'affirmative', fictional: true,
        sourcePosture: 'original', likenessPosture: 'fictional', appearance: { hair: 'silver bob' },
      }),
    });
    assert.equal(characterResponse.status, 201);
    const character = (await characterResponse.json()).data;
    const directory = await fetch(`${base}/studio/characters`);
    assert.ok((await directory.json()).data.some((entry) => entry.id === character.id));

    const briefResponse = await fetch(`${base}/studio/briefs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request: 'A fictional adults-only fashion film.', mode: 'quick' }),
    });
    const brief = (await briefResponse.json()).data;
    assert.equal(brief.workflow.mode, 'quick');
    assert.equal(brief.workflow.stages.find((stage) => stage.id === 'cast').status, 'ready');

    const wrongAction = await fetch(`${base}/studio/briefs/${brief.id}/workflow/cast`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actionId: 'prompt.invented.action', operation: 'run' }),
    });
    assert.equal(wrongAction.status, 400);
    assert.match((await wrongAction.json()).error, /only permits registered action/);

    const completed = await fetch(`${base}/studio/briefs/${brief.id}/workflow/cast`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actionId: 'studio.cast.confirm', operation: 'run' }),
    });
    assert.equal(completed.status, 200);
    const updated = (await completed.json()).data;
    assert.deepEqual(updated.workflowRun.executed, ['cast', 'scenes']);
    assert.equal(updated.workflow.stages.find((stage) => stage.id === 'generation').status, 'blocked');
    assert.equal(updated.workflow.paused, true);
  });

  await t.test('invalid input returns 400 naming the field', async () => {
    const res = await fetch(`${base}/studio/titles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.match(payload.error, /topic/);
  });

  await t.test('production planner scopes ideas, saves a normalized plan, and builds an HTML preview explicitly', async () => {
    const catalogRes = await fetch(`${base}/studio/production-planner`);
    assert.equal(catalogRes.status, 200);
    const catalog = (await catalogRes.json()).data;
    assert.ok(catalog.projects.some((project) => project.slug === 'high-signal'));
    assert.ok(catalog.recipes.some((recipe) => recipe.id === 'threejs-scene' && recipe.owner === 'Editorial'));
    assert.equal(catalog.ideas.length, 0);

    const ideaRes = await fetch(`${base}/studio/project-ideas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectSlug: 'high-signal', title: 'Evidence over vibes', hook: 'Show the proof first.' }),
    });
    assert.equal(ideaRes.status, 201);
    const idea = (await ideaRes.json()).data;
    assert.equal(idea.projectSlug, 'high-signal');

    const scoped = await fetch(`${base}/studio/production-planner?projectSlug=high-signal`);
    assert.ok((await scoped.json()).data.ideas.some((entry) => entry.id === idea.id));
    const otherProject = await fetch(`${base}/studio/ideas-list?projectSlug=karte`);
    assert.ok(!(await otherProject.json()).data.some((entry) => entry.id === idea.id));

    const planRes = await fetch(`${base}/studio/production-plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectSlug: 'high-signal', ideaId: idea.id, recipeId: 'image-slideshow',
        options: { channel: 'instagram_reels', durationSeconds: 24, qualityTier: 'standard', variantCount: 1, transition: 'push' },
      }),
    });
    const planJson = await planRes.json();
    assert.equal(planRes.status, 201, JSON.stringify(planJson));
    const plan = planJson.data;
    assert.equal(plan.ideaId, idea.id);
    assert.equal(plan.recipeId, 'image-slideshow');
    assert.equal(plan.engine, 'html-composition');
    assert.equal(plan.actions.build.kind, 'execute');
    assert.equal(plan.actions.preview.enabled, false);
    assert.equal(plan.actions.post.enabled, false);

    const invalidRes = await fetch(`${base}/studio/production-plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectSlug: 'high-signal', ideaId: idea.id, recipeId: 'ascii-story', options: { variantCount: 9 },
      }),
    });
    assert.equal(invalidRes.status, 400);
    assert.match((await invalidRes.json()).error, /between 1 and 6/);

    const builtRes = await fetch(`${base}/studio/briefs/${plan.id}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    const builtJson = await builtRes.json();
    assert.equal(builtRes.status, 200, JSON.stringify(builtJson));
    assert.equal(builtJson.data.executed, true);
    assert.equal(builtJson.data.brief.media.previewType, 'video');
    assert.match(builtJson.data.brief.media.videoPath, /\.mp4$/);
    assert.equal(builtJson.data.brief.actions.preview.enabled, true);
    assert.equal(builtJson.data.brief.actions.post.enabled, false);
  });

  await t.test('unknown tool returns 404', async () => {
    const res = await fetch(`${base}/studio/bogus`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 404);
  });

  await t.test('faceless mock run and ideas-list round trip', async () => {
    const res = await fetch(`${base}/studio/faceless`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: 'server smoke topic', engine: 'bogus-engine' }),
    });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.data.engine, 'mock');
    assert.equal(payload.data.renderStatus, 'completed');
    assert.equal(payload.data.postHandoff, null);

    const listRes = await fetch(`${base}/studio/ideas-list`);
    assert.equal(listRes.status, 200);
    const list = await listRes.json();
    assert.ok(list.data.some((idea) => idea.title === 'server smoke topic'));
  });

  await t.test('renders-list surfaces rendered ideas with quality', async () => {
    const res = await fetch(`${base}/studio/renders-list`);
    assert.equal(res.status, 200);
    const payload = await res.json();
    const entry = payload.data.find((render) => render.title === 'server smoke topic');
    assert.ok(entry, 'faceless run should appear in renders-list');
    assert.ok(entry.artifactDir);
    assert.ok(entry.quality === null || typeof entry.quality.verdict === 'string');
  });

  await t.test('render-file serves whitelisted files and blocks traversal', async () => {
    const inside = path.join(scratch, 'inside.mp4');
    await writeFile(inside, 'fake video bytes');
    const ok = await fetch(`${base}/studio/render-file?path=${encodeURIComponent(inside)}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'video/mp4');
    assert.equal(ok.headers.get('accept-ranges'), 'bytes');

    const ranged = await fetch(`${base}/studio/render-file?path=${encodeURIComponent(inside)}`, {
      headers: { range: 'bytes=5-9' },
    });
    assert.equal(ranged.status, 206);
    assert.equal(ranged.headers.get('content-range'), 'bytes 5-9/16');
    assert.equal(await ranged.text(), 'video');

    const audio = path.join(scratch, 'canary.mp3');
    await writeFile(audio, 'fake audio bytes');
    const playableAudio = await fetch(`${base}/studio/render-file?path=${encodeURIComponent(audio)}`);
    assert.equal(playableAudio.status, 200);
    assert.equal(playableAudio.headers.get('content-type'), 'audio/mpeg');
    assert.equal(playableAudio.headers.get('accept-ranges'), 'bytes');

    const outside = await fetch(`${base}/studio/render-file?path=${encodeURIComponent('/etc/hosts')}`);
    assert.equal(outside.status, 403);
    const sneaky = await fetch(`${base}/studio/render-file?path=${encodeURIComponent(path.join(scratch, '..', '..', 'etc', 'hosts'))}`);
    assert.equal(sneaky.status, 403);
  });

  await t.test('explore gallery streams registered media by stable id with byte ranges', async () => {
    await writeFile(path.join(scratch, 'gallery.mp4'), 'registered gallery bytes');
    const registry = await fetch(`${base}/studio/explore-gallery`);
    assert.equal(registry.status, 200);
    const payload = await registry.json();
    assert.equal(payload.data.playableCount, 1);
    assert.equal(payload.data.items[0].mediaUrl, '/studio/explore-gallery/gallery-proof/media');
    assert.equal('source' in payload.data.items[0], false);

    const media = await fetch(`${base}${payload.data.items[0].mediaUrl}`, { headers: { range: 'bytes=0-9' } });
    assert.equal(media.status, 206);
    assert.equal(media.headers.get('accept-ranges'), 'bytes');
    assert.equal(media.headers.get('content-range'), 'bytes 0-9/24');
    assert.equal(await media.text(), 'registered');
  });

  await t.test('representative gallery serves substantive capability proofs separately from exact options', async () => {
    const registry = await fetch(`${base}/studio/explore-gallery/representatives`);
    assert.equal(registry.status, 200);
    const payload = await registry.json();
    assert.equal(payload.data.provenCapabilityCount, 9);
    assert.equal(payload.data.proofCount, 14);
    assert.equal(payload.data.totalCapabilityCount, 13);
    assert.equal(payload.data.exactOptionCount, 49);
    assert.equal(payload.data.playableCount, 14);
    assert.deepEqual(payload.data.unproven.map((entry) => entry.recipeId), ['grok-asset-film', 'guided-app-demo', 'product-proof', 'night-out-carousel']);

    const sample = payload.data.items[0];
    const media = await fetch(`${base}${sample.mediaUrl}`, { headers: { range: 'bytes=0-9' } });
    assert.equal(media.status, 206);
    assert.equal(media.headers.get('accept-ranges'), 'bytes');
    assert.equal((await media.arrayBuffer()).byteLength, 10);
    const poster = await fetch(`${base}${sample.posterUrl}`);
    assert.equal(poster.status, 200);
    assert.equal(poster.headers.get('content-type'), 'image/jpeg');
    assert.ok((await poster.arrayBuffer()).byteLength > 0);
  });

  await t.test('factory plan/produce/status over the API', async () => {
    const plan = await fetch(`${base}/studio/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ niche: 'api factory', count: 2 }),
    });
    assert.equal(plan.status, 200);
    const produce = await fetch(`${base}/studio/produce`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ count: 1, engine: 'mock' }),
    });
    assert.equal(produce.status, 200);
    const producePayload = await produce.json();
    assert.equal(producePayload.data.succeeded, 1);
    const status = await fetch(`${base}/studio/factory-status`);
    const statusPayload = await status.json();
    assert.ok(statusPayload.data.counts.new >= 1);
    assert.ok(statusPayload.data.counts.rendered >= 1);
  });

  await t.test('idea status update via POST /studio/status', async () => {
    const listRes = await fetch(`${base}/studio/ideas-list`);
    const list = await listRes.json();
    const idea = list.data[0];
    const res = await fetch(`${base}/studio/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: idea.id, to: 'posted' }),
    });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.data.status, 'posted');
  });

  await t.test('conversational briefs list, update, route, and execute only after confirmation', async () => {
    const createdRes = await fetch(`${base}/studio/briefs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request: 'Make a 45-second faceless High Signal lesson for Instagram.' }),
    });
    assert.equal(createdRes.status, 201);
    const created = (await createdRes.json()).data;
    assert.equal(created.kind, 'faceless');
    assert.equal(created.projectSlug, 'high-signal');
    assert.equal(created.capability.state, 'ready');

    const blocked = await fetch(`${base}/studio/briefs/${created.id}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: false }),
    });
    assert.equal(blocked.status, 400);
    assert.match((await blocked.json()).error, /confirmation/);

    const patched = await fetch(`${base}/studio/briefs/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cta: 'Read the evidence' }),
    });
    assert.equal(patched.status, 200);
    assert.equal((await patched.json()).data.revision, 2);

    const refined = await fetch(`${base}/studio/briefs/${created.id}/refine`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instruction: 'Make it a 30-second YouTube lesson.' }),
    });
    assert.equal(refined.status, 200);
    const refinedBrief = (await refined.json()).data;
    assert.equal(refinedBrief.durationSeconds, 30);
    assert.equal(refinedBrief.channel, 'youtube_shorts');
    assert.equal(refinedBrief.revision, 3);
    assert.equal(refinedBrief.messages.at(-2).content, 'Make it a 30-second YouTube lesson.');

    const executed = await fetch(`${base}/studio/briefs/${created.id}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(executed.status, 200);
    const execution = (await executed.json()).data;
    assert.equal(execution.executed, true);
    assert.equal(execution.brief.lifecycle, 'needs-review');
    assert.ok(execution.brief.media.videoPath);

    const acceptedRes = await fetch(`${base}/studio/briefs/${created.id}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'accepted' }),
    });
    assert.equal(acceptedRes.status, 200);
    const accepted = (await acceptedRes.json()).data;
    assert.equal(accepted.approval.reviewDecision, 'accepted');
    assert.equal(accepted.approval.reviewHistory.length, 1);
    assert.match(accepted.approval.reviewHistory[0].artifactSha256, /^[a-f0-9]{64}$/);

    const rejectedRes = await fetch(`${base}/studio/briefs/${created.id}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'rejected' }),
    });
    assert.equal(rejectedRes.status, 200);
    const rejected = (await rejectedRes.json()).data;
    assert.equal(rejected.approval.reviewDecision, 'rejected');
    assert.deepEqual(rejected.approval.reviewHistory.map((entry) => entry.decision), ['accepted', 'rejected']);

    const previewRes = await fetch(`${base}/studio/platform-audio-preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        briefId: created.id,
        confirm: true,
        reference: {
          provider: 'youtube',
          youtubeUrl: 'https://www.youtube.com/watch?v=weRHyjj34ZE',
          artist: 'Shakira',
          title: 'Whenever, Wherever',
          startSeconds: 47,
          durationSeconds: 30,
          targetPlatform: 'youtube_shorts',
        },
      }),
    });
    const previewJson = await previewRes.json();
    assert.equal(previewRes.status, 200, JSON.stringify(previewJson));
    const previewPayload = previewJson.data;
    assert.equal(previewPayload.downloadedAudio, false);
    assert.equal(previewPayload.preview.reference.videoId, 'weRHyjj34ZE');
    assert.equal(previewPayload.preview.reference.youtubeUrl, 'https://www.youtube.com/watch?v=weRHyjj34ZE');
    assert.equal(previewPayload.preview.reference.reviewProvider, 'youtube');
    assert.equal(previewPayload.preview.ready, true);
    assert.equal(previewPayload.brief.media.platformAudio.receiptPath, previewPayload.preview.receiptPath);

    const productions = await fetch(`${base}/studio/productions`);
    const productionPayload = await productions.json();
    const productionBrief = productionPayload.data.briefs.find((brief) => brief.id === created.id);
    assert.ok(productionBrief);
    assert.equal(productionBrief.media.ideaId, execution.brief.media.ideaId);
    assert.ok(
      !productionPayload.data.legacyRenders.some((render) => render.video === execution.brief.media.videoPath),
      'brief-owned video should not be duplicated through the legacy render index',
    );

    const capabilities = await fetch(`${base}/studio/capabilities?briefId=${created.id}`);
    assert.equal((await capabilities.json()).data.length, 6);
  });

  await t.test('AI workflow proposals remain inspectable but parked model playback fails closed', async () => {
    const libraryRes = await fetch(`${base}/studio/workflow-library`);
    assert.equal(libraryRes.status, 200);
    assert.equal((await libraryRes.json()).data.length, 14);

    const recipeLibraryRes = await fetch(`${base}/studio/recipe-library`);
    assert.equal(recipeLibraryRes.status, 200);
    const recipeLibrary = (await recipeLibraryRes.json()).data;
    assert.ok(recipeLibrary.recipes.length >= 10);
    assert.ok(recipeLibrary.workflowRecipes.length >= 2);

    const historyRes = await fetch(`${base}/studio/history`);
    assert.equal(historyRes.status, 200);
    const history = (await historyRes.json()).data;
    assert.ok(Array.isArray(history));
    assert.ok(history.every((entry) => Object.hasOwn(entry, 'prompt') && Object.hasOwn(entry, 'workflow') && Object.hasOwn(entry, 'video')));

    const createdRes = await fetch(`${base}/studio/briefs`, {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({
        request:'A wild night out party montage in a neon club.',
        fields:{ executionInputs:{ referenceImage:'/tmp/party-reference.png', aspectRatio:'16:9' } },
      }),
    });
    const createdJson = await createdRes.json();
    assert.equal(createdRes.status, 201, JSON.stringify(createdJson));
    const created = createdJson.data;
    assert.equal(created.workflowProposal.archetypeId, 'night-out-rush');
    assert.equal(created.workflowProposal.inputs.aspectRatio, '16:9');
    assert.equal(created.workflowProposal.state, 'proposed');
    assert.equal(created.media, null);

    const revisedRes = await fetch(`${base}/studio/briefs/${created.id}/workflow-proposal/revise`, {
      method:'POST', headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ instruction:'Use a fast preview, landscape, 6 seconds, seed 99' }),
    });
    assert.equal(revisedRes.status, 200);
    const revised = (await revisedRes.json()).data;
    assert.equal(revised.workflowProposal.version, 2);
    assert.equal(revised.workflowProposal.lane, 'preview');
    assert.deepEqual(revised.workflowProposal.lastRevision.changes.map((entry) => entry.field), ['lane', 'duration', 'seed']);

    const graphRes = await fetch(`${base}/studio/briefs/${created.id}/workflow-proposal/graph`);
    assert.equal(graphRes.status, 200);
    const inspection = (await graphRes.json()).data;
    assert.equal(inspection.comfy.available, true);
    assert.ok(inspection.comfy.nodes.length > 0);

    const blockedPlay = await fetch(`${base}/studio/briefs/${created.id}/workflow-proposal/play`, {
      method:'POST', headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ confirm:false, version:2 }),
    });
    assert.equal(blockedPlay.status, 400);
    assert.match((await blockedPlay.json()).error, /confirmation/);

    const finalRes = await fetch(`${base}/studio/briefs/${created.id}/workflow-proposal/revise`, {
      method:'POST', headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ instruction:'Use final production quality' }),
    });
    const finalBrief = (await finalRes.json()).data;
    assert.equal(finalBrief.workflowProposal.version, 3);
    assert.equal(finalBrief.workflowProposal.lane, 'final');
    const playedRes = await fetch(`${base}/studio/briefs/${created.id}/workflow-proposal/play`, {
      method:'POST', headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ confirm:true, version:3 }),
    });
    const playedJson = await playedRes.json();
    assert.equal(playedRes.status, 400, JSON.stringify(playedJson));
    assert.match(playedJson.error, /parked.*Import an approved external clip/i);
  });

  await t.test('projectless prompt can create a faceless video', async () => {
    const createdRes = await fetch(`${base}/studio/briefs`, {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({
        request:'Create a 15-second faceless explainer about why the moon has phases.',
        fields:{ kind:'faceless', durationSeconds:15, engine:'mock' },
      }),
    });
    assert.equal(createdRes.status, 201);
    const created = (await createdRes.json()).data;
    assert.equal(created.projectSlug, null);
    assert.equal(created.capability.state, 'ready');
    const executedRes = await fetch(`${base}/studio/briefs/${created.id}/execute`, {
      method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ confirm:true }),
    });
    assert.equal(executedRes.status, 200);
    const executed = (await executedRes.json()).data;
    assert.equal(executed.executed, true);
    assert.ok(executed.brief.media.videoPath);
  });

  await t.test('projectless prompt preserves the selected visual recipe', async () => {
    const arsenalRes = await fetch(`${base}/studio/arsenal`);
    assert.equal(arsenalRes.status, 200);
    const arsenal = (await arsenalRes.json()).data;
    const recipe = arsenal.recipes.find((entry) => entry.id === 'image-slideshow');
    assert.equal(recipe.readiness.state, 'ready');
    assert.equal(recipe.engine, 'html-composition');

    const createdRes = await fetch(`${base}/studio/briefs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        request: 'Explain why the sky changes color at sunset.',
        fields: { recipeId: 'image-slideshow', recipeOptions: { durationSeconds: 15 } },
      }),
    });
    assert.equal(createdRes.status, 201);
    const created = (await createdRes.json()).data;
    assert.equal(created.projectSlug, null);
    assert.equal(created.recipeId, 'image-slideshow');
    assert.equal(created.engine, 'html-composition');
    assert.equal(created.durationSeconds, 15);
    assert.equal(created.actions.build.enabled, true);
    assert.equal(created.actions.build.kind, 'execute');
  });

  await t.test('projectless prompt preserves the selected narration voice', async () => {
    const createdRes = await fetch(`${base}/studio/briefs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        request: 'Make a friendly, poppy narrated short about protecting one creative hour.',
        fields: {
          recipeId: 'local-voice-film',
          recipeOptions: { variantId: 'local-voice-film--voice-af-heart' },
        },
      }),
    });
    assert.equal(createdRes.status, 201);
    const created = (await createdRes.json()).data;
    assert.equal(created.recipeOptions.values.voice, 'af_heart');
    assert.equal(created.recipeOptions.variantId, 'local-voice-film--voice-af-heart');
  });

  await t.test('Fleet Console can execute any exact variant as a portable fixture and seek its MP4', async () => {
    const createdRes = await fetch(`${base}/studio/briefs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        request: 'Show a concise kinetic explanation.',
        fields: {
          recipeId: 'web-motion',
          recipeOptions: { variantId: 'web-motion--visualstyle-kinetic-type' },
        },
      }),
    });
    assert.equal(createdRes.status, 201);
    const created = (await createdRes.json()).data;
    const executionRes = await fetch(`${base}/studio/briefs/${created.id}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true, mode: 'fixture' }),
    });
    const executionJson = await executionRes.json();
    assert.equal(executionRes.status, 200, JSON.stringify(executionJson));
    const execution = executionJson.data;
    assert.equal(execution.executed, true);
    assert.equal(execution.production.mode, 'fixture');
    assert.equal(execution.production.variantId, 'web-motion--visualstyle-kinetic-type');
    assert.equal(execution.brief.media.execution.provenance.posture, 'fixture');

    const pathValue = encodeURIComponent(execution.brief.media.videoPath);
    const mediaRes = await fetch(`${base}/studio/render-file?path=${pathValue}`, { headers: { range: 'bytes=0-99' } });
    assert.equal(mediaRes.status, 206);
    assert.equal(mediaRes.headers.get('content-type'), 'video/mp4');
    assert.equal((await mediaRes.arrayBuffer()).byteLength, 24);
  });

  await t.test('Blender readiness and lyric route expose truthful safe boundaries', async () => {
    const readiness = await fetch(`${base}/studio/blender-readiness`);
    assert.equal(readiness.status, 200);
    const capability = (await readiness.json()).data;
    assert.equal(typeof capability.ready, 'boolean');
    assert.equal('apiKey' in capability, false);

    const createdRes = await fetch(`${base}/studio/briefs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request: 'Make a literal lyric video from this cleared song.' }),
    });
    assert.equal(createdRes.status, 201);
    const created = (await createdRes.json()).data;
    assert.equal(created.kind, 'lyric-video');
    assert.match(created.capability.blocker, /operator-supplied timed lyrics/i);

    const unconfirmed = await fetch(`${base}/studio/lyric-video`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ briefId: created.id, confirm: false }),
    });
    assert.equal(unconfirmed.status, 400);
    assert.match((await unconfirmed.json()).error, /confirmation/i);
  });

  await t.test('every specialized workflow returns its authoritative continuation instead of fake execution', async () => {
    const cases = [
      {
        request: 'Create a brand reel for High Signal.',
        fields: { sourceEvidence: { canonicalUrl: 'https://highsignal.app' } },
        owner: 'Brand Reel',
        href: '/',
      },
      {
        request: 'Create a guided app demo for High Signal.',
        fields: {
          sourceEvidence: {
            canonicalUrl: 'https://highsignal.app',
            rightsStatus: 'approved',
          },
        },
        owner: 'Forge',
        href: 'https://reels.sassmaker.com/forge',
      },
      {
        request: 'Create a cinematic LTX film for High Signal.',
        fields: {
          creativeDirection: 'Use one approved evidence path from tension to clarity.',
          sourceEvidence: { rightsStatus: 'approved' },
        },
        owner: 'Forge',
        href: 'https://reels.sassmaker.com/forge',
      },
      {
        request: 'Clip this podcast interview.',
        fields: {
          sourceEvidence: {
            canonicalUrl: 'https://media.example.test/episode.mp4',
            rightsStatus: 'approved',
          },
        },
        owner: 'Editorial',
        href: 'http://127.0.0.1:8765',
      },
    ];

    for (const item of cases) {
      const createdRes = await fetch(`${base}/studio/briefs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ request: item.request, fields: item.fields }),
      });
      assert.equal(createdRes.status, 201);
      const created = (await createdRes.json()).data;
      const executed = await fetch(`${base}/studio/briefs/${created.id}/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      assert.equal(executed.status, 200);
      const payload = await executed.json();
      assert.equal(payload.data.executed, false);
      assert.equal(payload.data.continuation.owner, item.owner);
      const continuation = new URL(payload.data.continuation.href, base);
      const expected = new URL(item.href, base);
      assert.equal(continuation.origin, expected.origin);
      assert.equal(continuation.pathname, expected.pathname);
      assert.equal(continuation.searchParams.get('studioBriefId'), created.id);
      if (created.sourceEvidence.canonicalUrl?.startsWith('https://')) {
        const sourceParam = created.kind === 'brand-reel' ? 'url' : 'sourceUrl';
        assert.equal(continuation.searchParams.get(sourceParam), created.sourceEvidence.canonicalUrl);
      }
      if (created.kind === 'guided-app-demo' || created.kind === 'coherent-film') {
        assert.equal(continuation.searchParams.get('kind'), created.kind);
        assert.equal(continuation.searchParams.get('projectName'), created.projectSlug);
      }
    }
  });
});

test('studio distribution endpoints prepare, draft, and schedule through Postiz', async (t) => {
  const postCalls = [];
  const { server, base } = await startServer({
    postizClient: {
      post: async (post) => {
        postCalls.push(post);
        return {
          provider: 'postiz',
          status: post.scheduled_for ? 'scheduled' : 'draft',
          externalId: `post-studio-${postCalls.length}`,
          externalUrl: null,
        };
      },
    },
    postizAppUrl: 'https://postiz.example.test',
    now: () => new Date('2026-07-31T12:05:00Z'),
  });
  t.after(() => server.close());

  async function createApprovedProduction(request) {
    const createdRes = await fetch(`${base}/studio/briefs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request }),
    });
    const created = (await createdRes.json()).data;
    await fetch(`${base}/studio/briefs/${created.id}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    const patchedRes = await fetch(`${base}/studio/briefs/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cta: 'Read the evidence',
        sourceEvidence: {
          canonicalUrl: 'https://highsignal.app/evidence',
          destinationUrl: 'https://highsignal.app',
          claim: 'High Signal keeps evidence attached to recommendations.',
          rightsStatus: 'approved',
        },
        approval: { creativeStatus: 'approved', qualityAccepted: true },
        media: {
          publicUrl: 'https://assets.example.test/video.mp4',
          reviewedAt: '2026-07-31T12:00:00Z',
        },
      }),
    });
    assert.equal(patchedRes.status, 200);
    return created;
  }

  const draftProduction = await createApprovedProduction('Make a faceless High Signal lesson for YouTube.');

  const prepared = await fetch(`${base}/studio/briefs/${draftProduction.id}/prepare-distribution`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(prepared.status, 200);
  const preparedPayload = await prepared.json();
  assert.equal(preparedPayload.data.posted, false);
  assert.equal(postCalls.length, 0);
  assert.equal(preparedPayload.data.bundle.request.scheduledFor, null);

  const draft = await fetch(`${base}/studio/briefs/${draftProduction.id}/create-postiz-draft`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approvedBy: 'owner' }),
  });
  assert.equal(draft.status, 200);
  const draftPayload = await draft.json();
  assert.equal(draftPayload.data.receipt.status, 'draft');
  assert.equal(postCalls.length, 1);
  assert.equal(postCalls[0].scheduled_for, null);

  const scheduledProduction = await createApprovedProduction('Make a faceless High Signal lesson for Instagram.');
  const scheduled = await fetch(`${base}/studio/briefs/${scheduledProduction.id}/schedule-postiz`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approvedBy: 'owner', scheduledFor: '2026-08-01T12:00:00Z' }),
  });
  assert.equal(scheduled.status, 200);
  const scheduledPayload = await scheduled.json();
  assert.equal(scheduledPayload.data.brief.lifecycle, 'scheduled');
  assert.equal(scheduledPayload.data.brief.distribution.request.scheduledFor, '2026-08-01T12:00:00.000Z');
  assert.equal(scheduledPayload.data.receipt.status, 'scheduled');
  assert.equal(scheduledPayload.data.receipt.scheduledFor, '2026-08-01T12:00:00.000Z');
  assert.equal(postCalls.length, 2);
  assert.equal(postCalls[1].scheduled_for, '2026-08-01T12:00:00.000Z');

  const rejectedDuplicate = await fetch(`${base}/studio/briefs/${scheduledProduction.id}/schedule-postiz`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approvedBy: 'owner', scheduledFor: '2026-08-02T12:00:00Z' }),
  });
  assert.equal(rejectedDuplicate.status, 400);
  assert.match((await rejectedDuplicate.json()).error, /receipt already exists/);
  assert.equal(postCalls.length, 2);

  const rejectedImmediate = await fetch(`${base}/studio/briefs/${scheduledProduction.id}/schedule-postiz`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approvedBy: 'owner', scheduledFor: '2026-08-02T12:00:00Z', publishNow: true }),
  });
  assert.equal(rejectedImmediate.status, 400);
  assert.match((await rejectedImmediate.json()).error, /does not accept immediate publication/);
  assert.equal(postCalls.length, 2);

  const readiness = await fetch(`${base}/studio/postiz-readiness`);
  const readinessPayload = await readiness.json();
  assert.equal(readinessPayload.data.state, 'ready-for-submission');
  assert.equal(readinessPayload.data.appUrl, 'https://postiz.example.test/');
});

test('studio autopilot APIs expose policy and status reads plus one confirmed bounded invocation', async (t) => {
  const calls = [];
  const { server, base } = await startServer({
    autopilotRunner: async (input) => {
      calls.push(input);
      return { schema: 'fleet.studio-autopilot-run.v1', runId: 'fixture-run', mode: input.execute ? 'execute' : 'dry-run' };
    },
  });
  t.after(() => server.close());

  const policies = await fetch(`${base}/studio/autopilot/policies`);
  assert.equal(policies.status, 200);
  assert.deepEqual((await policies.json()).data.policies.map((entry) => entry.id), [
    'high-signal-daily', 'significant-hobbies-weekly', 'major-project-changelog',
  ]);

  const status = await fetch(`${base}/studio/autopilot/status`);
  assert.equal(status.status, 200);
  assert.deepEqual((await status.json()).data.lanes, {
    'project-automation': 0, 'operator-request': 0, 'personal-automation': 0,
  });
  assert.equal((await (await fetch(`${base}/studio/autopilot/runs`)).json()).data.length, 0);
  assert.equal((await (await fetch(`${base}/studio/autopilot/exceptions`)).json()).data.length, 0);

  const rejected = await fetch(`${base}/studio/autopilot/run`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ policy: 'high-signal-daily' }),
  });
  assert.equal(rejected.status, 400);
  assert.match((await rejected.json()).error, /confirmation/);

  const invoked = await fetch(`${base}/studio/autopilot/run`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: true, policy: 'high-signal-daily', execute: false, count: 1 }),
  });
  assert.equal(invoked.status, 200);
  assert.equal((await invoked.json()).data.mode, 'dry-run');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].count, 1);
});

test('studio probes and caches Blender readiness before creating a recipe brief', async (t) => {
  const calls = [];
  const { server, base } = await startServer({
    blenderCapability: undefined,
    blender: {
      blenderPath: '/test/blender',
      commandRunner: async (executable, args) => {
        calls.push({ executable, args });
        return { stdout: 'Blender 5.2.0 LTS\n', stderr: '' };
      },
    },
  });
  t.after(() => server.close());

  const createdRes = await fetch(`${base}/studio/briefs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      request: 'Make an abstract 3D animation about momentum.',
      fields: { recipeId: 'blender-film', recipeOptions: { durationSeconds: 15 } },
    }),
  });
  const createdJson = await createdRes.json();
  assert.equal(createdRes.status, 201, JSON.stringify(createdJson));
  assert.equal(createdJson.data.recipe.readiness.ready, true);
  assert.equal(createdJson.data.actions.build.enabled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, '/test/blender');

  const readinessRes = await fetch(`${base}/studio/blender-readiness`);
  assert.equal(readinessRes.status, 200);
  assert.equal((await readinessRes.json()).data.version, '5.2.0');
  assert.equal(calls.length, 1, 'the server should reuse the readiness result across requests');
});

test('Fleet Console real mode crosses a registered owner adapter and preserves its evidence', async (t) => {
  const ownerRoot = await mkdtemp(path.join(tmpdir(), 'studio-owner-adapter-'));
  const videoPath = path.join(ownerRoot, 'threejs-owner.mp4');
  const manifestPath = path.join(ownerRoot, 'threejs-owner.json');
  await writeFile(videoPath, Buffer.from('owner-video'));
  await writeFile(manifestPath, JSON.stringify({ verdict: 'pass' }));
  const { server, base } = await startServer({
    artifactRoots: [ownerRoot],
    videoRealExecutors: {
      'threejs-scene': async () => ({
        videoPath,
        renderer: 'forge-threejs',
        ownerManifestPath: manifestPath,
        provenance: { posture: 'real', renderer: 'forge-threejs' },
        quality: { verdict: 'pass', basis: 'owner fixture' },
      }),
    },
  });
  t.after(() => server.close());

  const createdRes = await fetch(`${base}/studio/briefs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      request: 'Make a Three.js diagram about a reliable pipeline.',
      fields: {
        recipeId: 'threejs-scene',
        recipeOptions: { variantId: 'threejs-scene--scenestyle-diagram' },
      },
    }),
  });
  const created = (await createdRes.json()).data;
  const executionRes = await fetch(`${base}/studio/briefs/${created.id}/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: true, mode: 'real', inputs: {} }),
  });
  const executionJson = await executionRes.json();
  assert.equal(executionRes.status, 200, JSON.stringify(executionJson));
  assert.equal(executionJson.data.executed, true);
  assert.equal(executionJson.data.production.mode, 'real');
  assert.equal(executionJson.data.production.owner, 'Forge');
  assert.equal(executionJson.data.production.evidence.ownerManifestPath, manifestPath);
  assert.equal(executionJson.data.brief.media.execution.quality.verdict, 'pass');
});
