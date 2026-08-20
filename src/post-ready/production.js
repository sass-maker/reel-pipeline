import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { renderCoherentFilm } from '../coherent-film-renderer.js';
import { masterPostReadyVideo, prepareMusic, prepareNarration } from './audio.js';
import {
  buildCoherentFilmFromPlan,
  createProductionReceipt,
  finalizeProductionReceipt,
  normalizeEditorialReview,
  normalizePostReadyBrief,
} from './contract.js';
import { reviewPostReadyVideo } from './review.js';
import { probePostReadyRuntimes } from './runtime.js';

function timestamp(date) {
  return date.toISOString().replaceAll(/[:.]/g, '-');
}

function slug(value) {
  return String(value).toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '').slice(0, 64) || 'post-ready';
}

async function hashFile(filePath) {
  const bytes = await readFile(filePath);
  return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}

async function allocateRunDir(outputRoot, id, startedAt) {
  await mkdir(outputRoot, { recursive: true });
  const stem = `${slug(id)}-${timestamp(startedAt)}`;
  for (let attempt = 1; attempt <= 999; attempt += 1) {
    const suffix = attempt === 1 ? '' : `-${String(attempt).padStart(2, '0')}`;
    const candidate = path.join(outputRoot, `${stem}${suffix}`);
    try {
      await mkdir(candidate);
      return candidate;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error(`could not allocate a run directory under ${outputRoot}`);
}

async function availableFile(filePath) {
  const info = await stat(filePath).catch(() => null);
  return info?.isFile() && info.size > 0;
}

export async function resolvePostReadyVisuals(plan, { sourceRoot }) {
  const results = [];
  for (const scene of plan.scenes) {
    const primaryPath = path.resolve(sourceRoot, scene.visual.source);
    let selected = scene.visual;
    let selectedPath = primaryPath;
    let fallbackUsed = false;
    if (!(await availableFile(primaryPath))) {
      if (!scene.visual.fallback) throw new Error(`visual source for scene ${scene.id} is missing: ${primaryPath}`);
      selected = scene.visual.fallback;
      selectedPath = path.resolve(sourceRoot, selected.source);
      if (!(await availableFile(selectedPath))) throw new Error(`visual fallback for scene ${scene.id} is missing: ${selectedPath}`);
      fallbackUsed = true;
    }
    results.push({
      sceneId: scene.id,
      ...selected,
      source: selectedPath,
      originalSource: scene.visual.source,
      fallbackUsed,
      sourceHash: await hashFile(selectedPath),
    });
  }
  return results;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function stage(receipt, name, data) {
  receipt.stages[name] = data;
}

export async function producePostReadyVideo({
  briefInput,
  briefPath,
  outputRoot,
  runtimeOptions = {},
  editorialReviewInput = null,
  now = () => new Date(),
}) {
  const plan = normalizePostReadyBrief(briefInput, { sourcePath: briefPath });
  const sourceRoot = briefPath ? path.dirname(path.resolve(briefPath)) : process.cwd();
  const started = now();
  const runDir = await allocateRunDir(path.resolve(outputRoot), plan.id, started);
  const receiptPath = path.join(runDir, 'production-receipt.json');
  let receipt = createProductionReceipt({ plan, runId: path.basename(runDir), startedAt: started.toISOString() });
  const persist = () => writeJson(receiptPath, receipt);
  await persist();
  try {
    const readiness = await probePostReadyRuntimes(runtimeOptions);
    receipt.engines = readiness.engines;
    stage(receipt, 'readiness', { status: readiness.ready ? 'completed' : 'failed', blockers: readiness.blockers });
    if (!readiness.ready) throw new Error(readiness.blockers.join('; '));
    if (plan.narration.mode === 'kokoro' && !readiness.engines.kokoro.ready) {
      throw new Error(readiness.engines.kokoro.blocker);
    }
    await persist();

    const visuals = await resolvePostReadyVisuals(plan, { sourceRoot });
    receipt.sources.visuals = visuals.map((entry) => ({
      sceneId: entry.sceneId,
      source: entry.originalSource,
      resolvedSource: entry.source,
      fallbackUsed: entry.fallbackUsed,
      sourceType: entry.sourceType,
      license: entry.license,
      hash: entry.sourceHash,
    }));
    stage(receipt, 'sources', { status: 'completed', visualCount: visuals.length, fallbacks: visuals.filter((entry) => entry.fallbackUsed).map((entry) => entry.sceneId) });
    const planPath = path.join(runDir, 'production-plan.json');
    await writeJson(planPath, plan);

    const runtime = readiness.paths;
    const [narration, music] = await Promise.all([
      prepareNarration({ plan, runDir, sourceRoot, runtime }),
      prepareMusic({ plan, runDir, sourceRoot, runtime }),
    ]);
    receipt.sources.narration = narration.source;
    receipt.sources.music = music.source;
    receipt.audio.narration = narration.metrics;
    receipt.audio.music = music.metrics;
    stage(receipt, 'audio-sources', { status: 'completed' });
    await persist();

    const coherentFilm = buildCoherentFilmFromPlan(plan, visuals);
    const coherentManifestPath = path.join(runDir, 'coherent-film.json');
    await writeJson(coherentManifestPath, coherentFilm);
    const visualRender = await renderCoherentFilm({
      filmInput: coherentFilm,
      manifestPath: coherentManifestPath,
      outputRoot: path.join(runDir, 'visual-render'),
      ffmpegPath: runtime.ffmpegPath,
    });
    stage(receipt, 'visual-render', {
      status: 'completed',
      frameCount: visualRender.frameCount,
      picture: visualRender.paths.picture,
      renderer: 'coherent-canvas-v1',
    });
    await persist();

    const finalPath = path.join(runDir, 'final.mp4');
    const mixPath = path.join(runDir, 'audio', 'final-mix.wav');
    const mix = await masterPostReadyVideo({
      picturePath: visualRender.paths.picture,
      narrationPath: narration.path,
      musicPath: music.path,
      outputPath: finalPath,
      mixPath,
      durationSeconds: plan.totalDurationSeconds,
      runtime,
    });
    const captionsPath = path.join(runDir, 'captions.srt');
    await copyFile(visualRender.paths.captions, captionsPath);
    receipt.audio.mix = { ...mix.metrics, filter: mix.filter };
    stage(receipt, 'final-master', { status: 'completed', finalPath, captionsPath, mixPath });

    const technicalReview = await reviewPostReadyVideo({
      videoPath: finalPath,
      reviewDir: path.join(runDir, 'review'),
      expected: { ...plan.format, durationSeconds: plan.totalDurationSeconds },
      runtime,
    });
    stage(receipt, 'technical-review', { status: technicalReview.status, findingsPath: technicalReview.findingsPath });
    const editorialReview = normalizeEditorialReview(editorialReviewInput);
    const outputPaths = {
      video: finalPath,
      captions: captionsPath,
      narration: narration.path,
      music: music.path,
      mix: mixPath,
      plan: planPath,
      coherentManifest: coherentManifestPath,
      contactSheet: technicalReview.evidence.contactSheet,
      audioEvidence: technicalReview.evidence.audioEvidence,
      technicalReview: technicalReview.findingsPath,
    };
    receipt.outputs = Object.fromEntries(await Promise.all(Object.entries(outputPaths).map(async ([key, filePath]) => [
      key,
      { path: filePath, ...(await hashFile(filePath)) },
    ])));
    receipt = finalizeProductionReceipt(receipt, {
      technicalReview,
      editorialReview,
      completedAt: now().toISOString(),
    });
    stage(receipt, 'editorial-review', { status: editorialReview.status });
    await persist();
    return { plan, runDir, receiptPath, receipt, paths: outputPaths };
  } catch (error) {
    receipt.status = 'failed';
    receipt.technicalStatus = 'failed';
    receipt.completedAt = now().toISOString();
    receipt.blockers.push(error.message);
    await persist();
    error.runDir = runDir;
    error.receiptPath = receiptPath;
    throw error;
  }
}
