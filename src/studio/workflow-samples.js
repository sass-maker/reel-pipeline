import { stat } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

import sampleConfig from '../../config/studio-workflow-samples.json' with { type: 'json' };

export const WORKFLOW_SAMPLE_SCHEMA = 'fleet.studio-workflow-samples.v1';

export function listWorkflowSamples(options = {}) {
  const config = validateWorkflowSamples(options.config ?? sampleConfig);
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  return config.samples.map((sample) => ({
    ...structuredClone(sample),
    briefId: `sample_${sample.id}`,
    sampleSetId: config.sampleSetId,
    referenceImage: path.resolve(rootDir, sample.referenceImage),
  }));
}

export async function runWorkflowSamples(options = {}) {
  const fetchImpl = options.fetchImpl ?? localLongRequest;
  const baseUrl = String(options.baseUrl ?? 'http://127.0.0.1:4317').replace(/\/$/, '');
  const samples = listWorkflowSamples(options);
  const only = options.only ? new Set(options.only) : null;
  const current = await requestJson(fetchImpl, `${baseUrl}/studio/briefs`);
  const briefs = new Map(current.map((brief) => [brief.id, brief]));
  const results = [];

  for (const sample of samples) {
    if (only && !only.has(sample.id)) continue;
    await assertReference(sample.referenceImage, options.fileStat ?? stat);
    let brief = briefs.get(sample.briefId);
    if (brief?.media?.videoPath && await isPlayable(brief.media.videoPath, options.fileStat ?? stat)) {
      results.push({ sampleId: sample.id, briefId: brief.id, status: 'reused', videoPath: brief.media.videoPath });
      options.onProgress?.({ type: 'sample-reused', sample, brief });
      continue;
    }
    if (!brief) {
      options.onProgress?.({ type: 'sample-planning', sample });
      brief = await requestJson(fetchImpl, `${baseUrl}/studio/briefs`, {
        method: 'POST',
        body: JSON.stringify({
          request: sample.prompt,
          fields: {
            id: sample.briefId,
            title: sample.title,
            channel: 'instagram_reels',
            modelProfileId: sample.lane === 'preview' ? 'ltx-2b-comfy-preview' : 'ltx-2.3-mlx-q4',
            executionInputs: {
              referenceImage: sample.referenceImage,
              seed: String(sample.seed),
              aspectRatio: sample.aspectRatio,
              durationSeconds: String(sample.durationSeconds),
              quality: 'final'
            }
          }
        })
      });
      briefs.set(brief.id, brief);
    }
    if (options.planOnly) {
      results.push({ sampleId: sample.id, briefId: brief.id, status: 'planned', videoPath: null });
      continue;
    }
    options.onProgress?.({ type: 'sample-rendering', sample, brief });
    const played = await requestJson(fetchImpl, `${baseUrl}/studio/briefs/${encodeURIComponent(brief.id)}/workflow-proposal/play`, {
      method: 'POST',
      body: JSON.stringify({ confirm: true, version: brief.workflowProposal.version })
    });
    brief = played.brief;
    briefs.set(brief.id, brief);
    results.push({
      sampleId: sample.id,
      briefId: brief.id,
      status: played.executed ? 'completed' : 'blocked',
      videoPath: brief.media?.videoPath ?? null,
    });
    options.onProgress?.({ type: 'sample-completed', sample, brief, result: played });
  }
  return { sampleSetId: samples[0]?.sampleSetId ?? null, results };
}

export function validateWorkflowSamples(input) {
  if (input?.$schema !== WORKFLOW_SAMPLE_SCHEMA || !Number.isInteger(input.version)) throw new Error(`workflow samples must use ${WORKFLOW_SAMPLE_SCHEMA}`);
  if (!input.sampleSetId || !Array.isArray(input.samples) || input.samples.length !== 5) throw new Error('workflow samples require one id and exactly five samples');
  const ids = new Set();
  for (const sample of input.samples) {
    if (!sample.id || ids.has(sample.id)) throw new Error(`invalid or duplicate workflow sample: ${sample.id}`);
    ids.add(sample.id);
    if (!sample.title || !sample.prompt || sample.prompt.length < 80) throw new Error(`${sample.id}: title and detailed prompt are required`);
    if (!sample.referenceImage || !['9:16', '16:9'].includes(sample.aspectRatio)) throw new Error(`${sample.id}: reference image and supported aspect ratio are required`);
    if (!Number.isInteger(sample.seed) || sample.seed < 0) throw new Error(`${sample.id}: seed must be a non-negative integer`);
    if (!Number.isFinite(sample.durationSeconds) || sample.durationSeconds < 1 || sample.durationSeconds > 8) throw new Error(`${sample.id}: duration must be between 1 and 8 seconds`);
    if (!['preview', 'final'].includes(sample.lane)) throw new Error(`${sample.id}: lane must be preview or final`);
  }
  return input;
}

async function requestJson(fetchImpl, url, init) {
  const response = await fetchImpl(url, {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `${response.status} ${response.statusText}`);
  return payload.data;
}

function localLongRequest(url, init = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === 'https:' ? https : http;
    const request = transport.request(target, {
      method: init.method ?? 'GET',
      headers: init.headers,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          statusText: response.statusMessage,
          async json() { return raw ? JSON.parse(raw) : {}; },
        });
      });
    });
    request.on('error', reject);
    if (init.body) request.write(init.body);
    request.end();
  });
}

async function assertReference(filePath, fileStat) {
  const details = await fileStat(filePath);
  if (!details.isFile() || details.size < 1) throw new Error(`sample reference is unavailable: ${filePath}`);
}

async function isPlayable(filePath, fileStat) {
  try {
    const details = await fileStat(filePath);
    return details.isFile() && details.size > 0;
  } catch {
    return false;
  }
}
