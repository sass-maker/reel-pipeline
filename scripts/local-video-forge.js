#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  checkForgeHost,
  generateForgeVariants,
  loadForgeProject,
  selectForgeShot,
} from '../src/local-video-forge.js';
import { planCartoonHandPointer } from '../src/cartoon-hand-pointer.js';
import { loadHandStyle, rasterizeCartoonHandOverlay } from '../src/cartoon-hand-overlay.js';
import { prepareFilmSkillForgeExecution } from '../src/film-skills.js';
import { guidedAppDemoRenderProfile, renderGuidedAppDemoCapture } from '../src/guided-app-demo.js';

// Reference composition for cartoon-hand planning. Renders scale the overlay
// vectors from here instead of re-planning, so treatment digests stay stable.
const CARTOON_HAND_REFERENCE_COMPOSITION = {
  width: 720,
  height: 1280,
  fps: 24,
  presenter: { position: 'bottom-right', widthFraction: 0.24, safeMarginFraction: 0.06 },
};

const { command, options } = parseArguments(process.argv.slice(2));

try {
  if (command === 'readiness') {
    const result = await checkForgeHost(options);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'variants') {
    const { project, shot } = await projectAndShot(options);
    const result = await generateForgeVariants(project, shot, {
      dryRun: options.dryRun === true,
      outputRoot: options.output,
      workerId: options.workerId,
    });
    console.log(JSON.stringify({ status: result.status, runPath: result.runPath, variants: result.variants }, null, 2));
  } else if (command === 'enqueue') {
    const { project, shot } = await projectAndShot(options);
    const keyframeBytes = await readFile(shot.keyframePath);
    const response = await coordinatorFetch('/forge/jobs', {
      method: 'POST',
      body: {
        project: project.project,
        shot: serializableShot(shot),
        keyframe: {
          fileName: path.basename(shot.keyframePath),
          mediaType: mediaTypeFor(shot.keyframePath),
          dataBase64: keyframeBytes.toString('base64'),
          sha256: createHash('sha256').update(keyframeBytes).digest('hex'),
        },
      },
    }, options);
    console.log(JSON.stringify(response.data, null, 2));
  } else if (command === 'tasks') {
    const query = options.status ? `?status=${encodeURIComponent(options.status)}` : '';
    const response = await coordinatorFetch(`/forge/jobs${query}`, {}, options);
    console.log(JSON.stringify(response.data, null, 2));
  } else if (command === 'work') {
    if (options.once) {
      const result = await workOnce(options);
      console.log(JSON.stringify(result, null, 2));
    } else {
      await workLoop(options);
    }
  } else {
    usage(command ? `unknown command: ${command}` : null);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function projectAndShot(cliOptions) {
  if (!cliOptions.project) throw new Error('--project is required');
  if (!cliOptions.shot) throw new Error('--shot is required');
  const project = await loadForgeProject(cliOptions.project);
  return { project, shot: selectForgeShot(project, cliOptions.shot) };
}

async function workOnce(cliOptions) {
  const workerId = cliOptions.workerId ?? `${os.hostname()}-${process.pid}`;
  const readiness = await checkForgeHost({
    outputDir: cliOptions.output ?? '.reel-pipeline/forge-jobs',
    minHeadroomGb: 16,
  });
  if (!readiness.ok) {
    return { status: 'not-ready', workerId, failures: readiness.failures };
  }
  const claim = await coordinatorFetch('/forge/jobs/claim', {
    method: 'POST',
    body: {
      workerId,
      capabilities: ['apple-silicon', 'mlx-ltx-2.3', 'ffmpeg', 'guided-app-demo', 'cartoon-hand-pointer'],
      leaseSeconds: 6 * 60 * 60,
    },
    allowNoContent: true,
  }, cliOptions);
  if (!claim) return { status: 'idle', workerId };

  const job = claim.data;
  const renderKind = job.activeRenderKind === 'final' ? 'final' : 'preview';
  const jobDir = path.resolve(cliOptions.output ?? '.reel-pipeline/forge-jobs', job.id);
  const inputDir = path.join(jobDir, 'input');
  await mkdir(inputDir, { recursive: true });

  try {
    if (job.sourceKind === 'guided-app-capture') {
      return await workGuidedAppDemoJob(job, {
        cliOptions,
        inputDir,
        jobDir,
        renderKind,
        workerId,
      });
    }

    const extension = path.extname(job.keyframe.fileName) || extensionFor(job.keyframe.mediaType);
    const keyframePath = path.join(inputDir, `keyframe${extension}`);
    const keyframeResponse = await coordinatorFetchRaw(`/forge/jobs/${encodeURIComponent(job.id)}/keyframe`, {}, cliOptions);
    await writeFile(keyframePath, Buffer.from(await keyframeResponse.arrayBuffer()));
    await assertFileSha256(keyframePath, job.keyframe.sha256, 'approved keyframe');
    const prepared = job.filmSkill
      ? prepareFilmSkillForgeExecution(job, { renderKind, keyframePath })
      : {
          execution: {
            renderKind: 'preview',
            preset: job.shot.preview.preset,
            seeds: job.shot.preview.seeds,
            qualityGateIds: [],
          },
          shot: {
            ...job.shot,
            keyframePath,
            keyframe: keyframePath,
            keyframeApproved: true,
          },
        };
    const { execution: skillExecution, shot } = prepared;
    const project = {
      schema: 'reel-pipeline.local-video-forge.v0.1',
      manifestPath: null,
      project: job.project,
      shots: [shot],
    };
    const run = await generateForgeVariants(project, shot, {
      outputRoot: path.join(jobDir, renderKind === 'final' ? 'finals' : 'previews'),
      workerId,
      taskId: job.id,
      onProgress: async (progress) => {
        await coordinatorFetch(`/forge/jobs/${encodeURIComponent(job.id)}/progress`, {
          method: 'POST',
          body: {
            workerId,
            progress: {
              stage: progress.type,
              variantId: progress.variant?.variantId ?? null,
              completed: progress.run.variants.filter((variant) => variant.status === 'completed').length,
              total: skillExecution.seeds.length,
              renderKind,
              filmSkill: job.filmSkill?.ref ?? null,
              qualityGates: skillExecution.qualityGateIds,
            },
          },
        }, cliOptions);
      },
    });

    const variants = [];
    for (const variant of run.variants.filter((candidate) => candidate.status === 'completed')) {
      const upload = await coordinatorFetchRaw(
        `/forge/jobs/${encodeURIComponent(job.id)}/artifacts/${encodeURIComponent(variant.variantId)}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'video/mp4', 'x-forge-worker-id': workerId },
          body: await readFile(variant.outputPath),
        },
        cliOptions,
      );
      const uploaded = await upload.json();
      const { outputPath: _localOutputPath, ...portableVariant } = variant;
      variants.push({
        ...portableVariant,
        artifactKey: uploaded.data.key,
        renderKind,
        filmSkill: job.filmSkill?.ref ?? null,
        qualityGates: skillExecution.qualityGateIds,
      });
    }
    const completed = await coordinatorFetch(`/forge/jobs/${encodeURIComponent(job.id)}/complete`, {
      method: 'POST',
      body: { workerId, variants },
    }, cliOptions);
    return completed.data;
  } catch (error) {
    await coordinatorFetch(`/forge/jobs/${encodeURIComponent(job.id)}/fail`, {
      method: 'POST',
      body: { workerId, error: error instanceof Error ? error.message : String(error) },
    }, cliOptions).catch(() => {});
    throw error;
  }
}

async function workGuidedAppDemoJob(job, context) {
  const {
    cliOptions,
    inputDir,
    jobDir,
    renderKind,
    workerId,
  } = context;
  const sourceExtension = extensionForCapture(job.sourceCapture?.mediaType);
  const sourcePath = path.join(inputDir, `approved-capture${sourceExtension}`);
  const sourceResponse = await coordinatorFetchRaw(
    `/forge/jobs/${encodeURIComponent(job.id)}/source`,
    {},
    cliOptions,
  );
  await writeFile(sourcePath, Buffer.from(await sourceResponse.arrayBuffer()));
  await assertFileSha256(sourcePath, job.sourceCapture.sha256, 'approved capture');

  await coordinatorFetch(`/forge/jobs/${encodeURIComponent(job.id)}/progress`, {
    method: 'POST',
    body: {
      workerId,
      progress: {
        stage: 'encoding-approved-capture',
        completed: 0,
        total: 1,
        renderKind,
        filmSkill: job.filmSkill.ref,
        sourceSha256: job.sourceCapture.sha256,
      },
    },
  }, cliOptions);

  const outputPath = path.join(
    jobDir,
    renderKind === 'final' ? 'finals' : 'previews',
    `${renderKind}.mp4`,
  );
  const treatment = await resolveCartoonHandTreatment(job, {
    cliOptions,
    inputDir,
    jobDir,
    renderKind,
  });
  const rendered = await renderGuidedAppDemoCapture({
    inputPath: sourcePath,
    outputPath,
    renderKind,
    ...(treatment?.overlay ? { overlay: treatment.overlay } : {}),
  });
  const variantId = renderKind === 'final' ? 'guided-final' : 'guided-preview';
  const upload = await coordinatorFetchRaw(
    `/forge/jobs/${encodeURIComponent(job.id)}/artifacts/${variantId}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'video/mp4', 'x-forge-worker-id': workerId },
      body: await readFile(rendered.outputPath),
    },
    cliOptions,
  );
  const uploaded = await upload.json();
  const qualityGates = job.filmSkill.contract.qualityGates.map((gate) => gate.id);
  const completed = await coordinatorFetch(`/forge/jobs/${encodeURIComponent(job.id)}/complete`, {
    method: 'POST',
    body: {
      workerId,
      variants: [{
        variantId,
        artifactKey: uploaded.data.key,
        renderKind,
        filmSkill: job.filmSkill.ref,
        qualityGates,
        sourceSha256: job.sourceCapture.sha256,
        ...(treatment ? { pointerTreatment: treatment.reported } : {}),
        renderDurationMs: rendered.renderDurationMs,
        encoder: {
          name: 'ffmpeg',
          profile: rendered.profile.label,
          width: rendered.profile.width,
          height: rendered.profile.height,
          crf: rendered.profile.crf,
          audioNormalizedLufs: -16,
        },
      }],
    },
  }, cliOptions);
  return completed.data;
}

// Resolves the cartoon-hand pointer treatment for a guided-app-demo@2 job.
// The plan is computed from the approved trace and the rights-cleared style on
// this host; if anything is untrustworthy the render keeps the standard cursor
// and the reason travels with the variant.
async function resolveCartoonHandTreatment(job, context) {
  const request = job.pointerTreatment;
  if (!request?.requested) return null;
  if (request.outcome === 'standard-cursor') {
    return {
      overlay: null,
      reported: {
        outcome: 'standard-cursor',
        planDigest: null,
        fallbackReason: request.fallbackReason,
        traceSha256: request.trace?.sha256 ?? null,
        styleRef: request.style?.ref ?? null,
      },
    };
  }
  const { cliOptions, inputDir, jobDir, renderKind } = context;
  const traceResponse = await coordinatorFetchRaw(
    `/forge/jobs/${encodeURIComponent(job.id)}/pointer-trace`,
    {},
    cliOptions,
  );
  const traceBytes = Buffer.from(await traceResponse.arrayBuffer());
  const tracePath = path.join(inputDir, 'pointer-trace.json');
  await writeFile(tracePath, traceBytes);
  await assertFileSha256(tracePath, request.trace.sha256, 'approved pointer trace');
  const { style, poseSources } = await loadHandStyle(request.style.ref, {
    root: path.resolve(import.meta.dirname, '..'),
  });
  if (style.digest !== request.style.digest) {
    throw new Error('hand style digest does not match the approved job');
  }
  const plan = planCartoonHandPointer({
    filmSkillRef: job.filmSkill.ref,
    capture: job.sourceCapture,
    trace: JSON.parse(traceBytes.toString('utf8')),
    traceSha256: request.trace.sha256,
    style,
    // The treatment is planned once in the reference composition so the
    // accepted preview and the final render share one plan digest.
    composition: CARTOON_HAND_REFERENCE_COMPOSITION,
    treatmentRequested: true,
    reducedMotion: request.reducedMotion === true,
  });
  const reported = {
    outcome: plan.treatment,
    planDigest: plan.digest,
    fallbackReason: plan.fallbackReason,
    traceSha256: request.trace.sha256,
    styleRef: style.ref,
    reducedMotion: request.reducedMotion === true,
  };
  if (renderKind === 'final') {
    const accepted = job.finalRender?.pointerTreatmentDigest;
    if (accepted && accepted !== plan.digest) {
      throw new Error('final render pointer treatment differs from the accepted preview');
    }
  }
  if (plan.treatment !== 'cartoon-hand') return { overlay: null, reported };
  const profile = guidedAppDemoRenderProfile(renderKind);
  const overlay = await rasterizeCartoonHandOverlay({
    plan,
    poseSources,
    dir: path.join(jobDir, 'overlay', renderKind),
    scale: profile.width / plan.composition.width,
  });
  return {
    overlay: { framePattern: overlay.framePattern, fps: overlay.fps },
    reported,
  };
}

async function workLoop(cliOptions) {
  const pollSeconds = positiveNumber(cliOptions.pollSeconds ?? 30, '--poll-seconds');
  for (;;) {
    const result = await workOnce(cliOptions);
    console.log(JSON.stringify({ ...result, checkedAt: new Date().toISOString() }));
    if (result.status !== 'idle' && result.status !== 'not-ready') continue;
    await new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000));
  }
}

async function coordinatorFetch(pathname, requestOptions = {}, cliOptions = {}) {
  const response = await coordinatorFetchRaw(pathname, requestOptions, cliOptions);
  if (requestOptions.allowNoContent && response.status === 204) return null;
  return response.json();
}

async function coordinatorFetchRaw(pathname, requestOptions = {}, cliOptions = {}) {
  const baseUrl = cliOptions.coordinator ?? process.env.REEL_WORKER_URL;
  const token = process.env.REEL_INTERNAL_TOKEN;
  if (!baseUrl) throw new Error('--coordinator or REEL_WORKER_URL is required');
  if (!token) throw new Error('REEL_INTERNAL_TOKEN is required for coordinator commands');
  const headers = new Headers(requestOptions.headers ?? {});
  headers.set('authorization', `Bearer ${token}`);
  let body = requestOptions.body;
  if (body && !(body instanceof Buffer) && typeof body !== 'string') {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(body);
  }
  const response = await fetch(new URL(pathname, ensureTrailingSlash(baseUrl)), {
    method: requestOptions.method ?? 'GET',
    headers,
    body,
  });
  if (!response.ok && !(requestOptions.allowNoContent && response.status === 204)) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? `coordinator ${response.status} ${response.statusText}`);
  }
  return response;
}

function serializableShot(shot) {
  const { keyframePath, ...result } = shot;
  return result;
}

function mediaTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  throw new Error(`unsupported keyframe extension: ${extension}`);
}

function extensionFor(mediaType) {
  if (mediaType === 'image/png') return '.png';
  if (mediaType === 'image/webp') return '.webp';
  return '.jpg';
}

function extensionForCapture(mediaType) {
  if (mediaType === 'video/mp4') return '.mp4';
  if (mediaType === 'video/webm') return '.webm';
  throw new Error(`unsupported forge capture media type: ${mediaType}`);
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function positiveNumber(value, name) {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) throw new Error(`${name} must be a positive number`);
  return result;
}

async function assertFileSha256(filePath, expected, label) {
  const actual = createHash('sha256').update(await readFile(filePath)).digest('hex');
  if (actual !== expected) {
    throw new Error(`${label} sha256 does not match the queued source`);
  }
}

function parseArguments(args) {
  const commandName = args[0] ?? '';
  const parsed = {};
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) throw new Error(`unexpected argument: ${argument}`);
    const key = argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (['dryRun', 'once'].includes(key)) {
      parsed[key] = true;
    } else {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      parsed[key] = value;
      index += 1;
    }
  }
  return { command: commandName, options: parsed };
}

function usage(error) {
  if (error) console.error(error);
  console.error(`Usage:
  npm run forge:readiness
  npm run forge:variants -- --project <project.json> --shot <id> [--dry-run]
  npm run forge:enqueue -- --project <project.json> --shot <id> --coordinator <url>
  npm run forge:tasks -- --coordinator <url> [--status queued]
  npm run forge:work -- --coordinator <url> [--worker-id <id>] [--once] [--poll-seconds 30]`);
  process.exitCode = 1;
}
