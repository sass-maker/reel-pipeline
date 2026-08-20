import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, statfs, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_BASE_URL = 'http://127.0.0.1:8188';
let serialTail = Promise.resolve();

export async function probeComfyLocal(run, options = {}) {
  if (run?.engine !== 'comfy-local' || !run.graph) throw new Error('a resolved comfy-local workflow run is required');
  const baseUrl = normalizeLocalBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const fetchImpl = options.fetchImpl ?? fetch;
  const [systemStats, objectInfo] = await Promise.all([
    fetchJson(fetchImpl, `${baseUrl}/system_stats`),
    fetchJson(fetchImpl, `${baseUrl}/object_info`),
  ]);
  const failures = validateLiveGraph(run.graph, objectInfo);
  return {
    ready: failures.length === 0,
    blocker: failures.length ? failures.join('; ') : null,
    baseUrl,
    runtime: systemStats,
    checkedNodes: [...new Set(Object.values(run.graph).map((node) => node.class_type))].sort(),
  };
}

export async function executeComfyWorkflowRun(run, options = {}) {
  return withSerialExecution(() => executeSerial(run, options));
}

export async function interruptComfyLocal(options = {}) {
  const baseUrl = normalizeLocalBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const fetchImpl = options.fetchImpl ?? fetch;
  await fetchJson(fetchImpl, `${baseUrl}/interrupt`, { method: 'POST', body: '{}' });
  return { interrupted: true, baseUrl };
}

export function validateLiveGraph(graph, objectInfo) {
  const failures = [];
  for (const [nodeId, node] of Object.entries(graph)) {
    const live = objectInfo?.[node.class_type];
    if (!live) {
      failures.push(`live Comfy is missing ${node.class_type} for node ${nodeId}`);
      continue;
    }
    const fields = { ...(live.input?.required ?? {}), ...(live.input?.optional ?? {}) };
    for (const [field, value] of Object.entries(node.inputs)) {
      if (!/(?:ckpt|clip|vae|unet)_name$/.test(field) || typeof value !== 'string') continue;
      const choices = Array.isArray(fields[field]?.[0]) ? fields[field][0] : null;
      if (choices && !choices.includes(value)) failures.push(`${node.class_type}.${field} does not expose ${value}`);
    }
  }
  return failures;
}

export function normalizeLocalBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error('Comfy base URL must be an HTTP loopback address');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

async function executeSerial(run, options) {
  if (run?.engine !== 'comfy-local' || !run.graph) throw new Error('a resolved comfy-local workflow run is required');
  const startedAt = new Date(options.now?.() ?? Date.now());
  const baseUrl = normalizeLocalBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const fetchImpl = options.fetchImpl ?? fetch;
  const outputRoot = path.resolve(options.outputRoot ?? '.reel-pipeline/engines/comfyui/output');
  const receiptDir = path.resolve(options.receiptDir ?? path.join(outputRoot, '.fleet-receipts'));
  await mkdir(outputRoot, { recursive: true });
  await mkdir(receiptDir, { recursive: true });
  const disk = await diskPreflight(outputRoot, run.resourceEnvelope, options);
  const readiness = options.skipReadiness ? { ready: true, baseUrl, runtime: null, checkedNodes: [] } : await probeComfyLocal(run, { ...options, baseUrl, fetchImpl });
  if (!readiness.ready) throw new Error(`Comfy recipe is not ready: ${readiness.blocker}`);

  const graph = structuredClone(run.graph);
  if (run.inputs.referenceImage) {
    const upload = options.uploadReference ?? uploadReferenceImage;
    const staged = await upload(run.inputs.referenceImage, { baseUrl, fetchImpl });
    for (const node of Object.values(graph)) {
      if (node.class_type === 'LoadImage') node.inputs.image = staged.name;
    }
  }

  const clientId = options.clientId ?? randomUUID();
  const queued = await fetchJson(fetchImpl, `${baseUrl}/prompt`, {
    method: 'POST',
    body: JSON.stringify({ prompt: graph, client_id: clientId }),
  });
  const promptId = queued.prompt_id;
  if (!promptId) throw new Error('Comfy did not return a prompt id');
  let peakRamPercent = 0;
  let history = null;
  const pollIntervalMs = Number(options.pollIntervalMs ?? 1_000);
  const timeoutMs = Number(options.timeoutMs ?? 30 * 60 * 1000);
  const monitor = options.resourceMonitor ?? systemRamPercent;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));

  while (Date.now() - startedAt.getTime() < timeoutMs) {
    const ram = await monitor();
    peakRamPercent = Math.max(peakRamPercent, Number(ram.percent ?? ram));
    await options.onProgress?.({ type: 'resource', promptId, ramPercent: peakRamPercent });
    if (peakRamPercent >= run.resourceEnvelope.maxRamPercent) {
      await interruptComfyLocal({ baseUrl, fetchImpl }).catch(() => {});
      throw new Error(`Comfy interrupted at ${peakRamPercent.toFixed(2)} percent RAM`);
    }
    const response = await fetchJson(fetchImpl, `${baseUrl}/history/${encodeURIComponent(promptId)}`);
    history = response?.[promptId] ?? null;
    if (history) {
      const state = history.status?.status_str;
      if (state === 'error' || history.status?.completed === false && history.status?.messages?.some((entry) => entry?.[0] === 'execution_error')) {
        throw new Error(`Comfy execution failed for ${promptId}`);
      }
      if (history.status?.completed === true || state === 'success') break;
    }
    await sleep(pollIntervalMs);
  }
  if (!history || !(history.status?.completed === true || history.status?.status_str === 'success')) {
    await interruptComfyLocal({ baseUrl, fetchImpl }).catch(() => {});
    throw new Error(`Comfy execution timed out after ${timeoutMs}ms`);
  }

  const videoPath = resolveHistoryVideo(history, outputRoot);
  const details = await stat(videoPath);
  if (!details.isFile() || details.size < 1) throw new Error('Comfy returned an empty video artifact');
  const hashFile = options.hashFile ?? sha256File;
  const probeVideo = options.probeVideo ?? ffprobeVideo;
  const endedAt = new Date(options.now?.() ?? Date.now());
  const receipt = {
    schema: 'fleet.comfy-local-execution.v1',
    status: 'completed',
    promptId,
    clientId,
    recipeId: run.recipeId,
    recipeVersion: run.recipeVersion,
    inputSignature: run.inputSignature,
    graphSha256: run.graphSha256,
    runtime: run.provenance.runtime,
    models: run.provenance.models,
    startedAt: startedAt.toISOString(),
    completedAt: endedAt.toISOString(),
    renderDurationSeconds: (endedAt.getTime() - startedAt.getTime()) / 1000,
    peakRamPercent,
    disk,
    artifact: {
      path: videoPath,
      bytes: details.size,
      sha256: await hashFile(videoPath),
      metadata: await probeVideo(videoPath),
    },
  };
  const receiptPath = path.join(receiptDir, `${run.inputSignature}.json`);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return {
    videoPath,
    bytes: receipt.artifact.bytes,
    sha256: receipt.artifact.sha256,
    renderer: 'comfy-local',
    ownerManifestPath: receiptPath,
    provenance: {
      posture: 'real',
      renderer: 'comfy-local',
      recipeId: run.recipeId,
      recipeVersion: run.recipeVersion,
      graphSha256: run.graphSha256,
      runtime: run.provenance.runtime,
      models: run.provenance.models,
      promptId,
      peakRamPercent,
    },
    quality: { verdict: 'needs-review', basis: `${run.qualityLane} recipe completed; operator review required` },
  };
}

async function uploadReferenceImage(filePath, { baseUrl, fetchImpl }) {
  const body = new FormData();
  body.append('image', new Blob([await readFile(path.resolve(filePath))]), path.basename(filePath));
  body.append('type', 'input');
  body.append('overwrite', 'true');
  const uploaded = await fetchJson(fetchImpl, `${baseUrl}/upload/image`, { method: 'POST', body });
  if (!uploaded?.name) throw new Error('Comfy did not accept the reference image');
  return uploaded;
}

async function diskPreflight(outputRoot, envelope, options) {
  const readStatfs = options.statfs ?? statfs;
  const disk = await readStatfs(outputRoot);
  const totalBytes = Number(disk.blocks) * Number(disk.bsize);
  const availableBytes = Number(disk.bavail) * Number(disk.bsize);
  const usedBytes = totalBytes - availableBytes;
  const projectedOutputBytes = Number(options.projectedOutputBytes ?? 1024 ** 3);
  const projectedPercent = totalBytes > 0 ? (usedBytes + projectedOutputBytes) / totalBytes * 100 : 100;
  if (projectedPercent >= envelope.maxDiskPercent) {
    throw new Error(`Comfy refused: projected disk use ${projectedPercent.toFixed(2)} percent reaches ${envelope.maxDiskPercent} percent limit`);
  }
  return { totalBytes, availableBytes, projectedOutputBytes, projectedPercent };
}

function resolveHistoryVideo(history, outputRoot) {
  const candidates = [];
  collectOutputFiles(history.outputs, candidates);
  const selected = candidates.find((entry) => String(entry.filename ?? '').toLowerCase().endsWith('.mp4'));
  if (!selected) throw new Error('Comfy history contains no MP4 output');
  const resolved = path.resolve(outputRoot, selected.subfolder ?? '', selected.filename);
  if (resolved !== outputRoot && !resolved.startsWith(outputRoot + path.sep)) throw new Error('Comfy output escapes the configured output root');
  return resolved;
}

function collectOutputFiles(value, output) {
  if (Array.isArray(value)) {
    for (const entry of value) collectOutputFiles(entry, output);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (typeof value.filename === 'string') output.push(value);
  for (const child of Object.values(value)) collectOutputFiles(child, output);
}

async function fetchJson(fetchImpl, url, init = {}) {
  const response = await fetchImpl(url, {
    ...init,
    headers: init.body instanceof FormData ? init.headers : { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!response?.ok) throw new Error(`Comfy request failed (${response?.status ?? 'unknown'}): ${url}`);
  return response.json();
}

async function systemRamPercent() {
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('memory_pressure', ['-Q']);
      const match = stdout.match(/System-wide memory free percentage:\s*(\d+)%/);
      if (match) return { percent: 100 - Number(match[1]) };
    } catch {}
  }
  return { percent: (1 - os.freemem() / os.totalmem()) * 100 };
}

async function ffprobeVideo(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,r_frame_rate', '-of', 'json', filePath,
  ]);
  return JSON.parse(stdout);
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function withSerialExecution(task) {
  const previous = serialTail;
  let release;
  serialTail = new Promise((resolve) => { release = resolve; });
  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
  }
}
