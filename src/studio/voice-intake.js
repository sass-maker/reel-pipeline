import { createHash } from 'node:crypto';
import { mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
const MAX_RECORDING_BYTES = 25 * 1024 * 1024;
const MIME_EXTENSIONS = new Map([
  ['audio/webm', '.webm'],
  ['audio/mp4', '.m4a'],
  ['audio/ogg', '.ogg'],
  ['audio/wav', '.wav'],
  ['audio/x-wav', '.wav'],
]);

export async function saveVoiceRecording(input = {}, options = {}) {
  const encoded = requiredString(input.audioBase64, 'audioBase64').replace(/^data:[^;]+;base64,/, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length) throw new Error('voice recording is empty');
  if (bytes.length > MAX_RECORDING_BYTES) throw new Error('voice recording exceeds 25 MB');
  const mimeType = String(input.mimeType ?? '').split(';')[0].trim().toLowerCase();
  const extension = MIME_EXTENSIONS.get(mimeType);
  if (!extension) throw new Error(`unsupported voice recording type: ${mimeType || 'unknown'}`);
  const root = path.resolve(options.artifactDir ?? './artifacts/studio-voice');
  await mkdir(root, { recursive: true });
  const now = options.now?.() ?? new Date();
  const id = `voice_${now.toISOString().replace(/\D/g, '').slice(0, 14)}_${createHash('sha256').update(bytes).digest('hex').slice(0, 10)}`;
  const recordingPath = path.join(root, `${id}${extension}`);
  await writeFile(recordingPath, bytes, { flag: 'wx' }).catch(async (error) => {
    if (error.code !== 'EEXIST') throw error;
  });
  return {
    id,
    recordingPath,
    mimeType,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    capturedAt: now.toISOString(),
  };
}

export async function probeVoiceTranscription(options = {}) {
  const provider = options.provider ?? null;
  if (provider?.id && provider?.modelPath && await exists(path.resolve(provider.modelPath))) {
    return { ready: true, provider: structuredClone(provider), providers: [structuredClone(provider)], blocker: null };
  }
  return {
    ready: false,
    provider: null,
    providers: [],
    blocker: 'No Reel-owned local transcription provider is configured. The recording is preserved; type the request or configure an injected local provider.',
  };
}

export async function transcribeVoiceRecording(recording, options = {}) {
  const recordingPath = path.resolve(requiredString(recording?.recordingPath, 'recordingPath'));
  const roots = (options.artifactRoots ?? [options.artifactDir ?? './artifacts/studio-voice']).map((root) => path.resolve(root));
  const resolved = await realpath(recordingPath).catch(() => null);
  if (!resolved) throw new Error(`voice recording is missing: ${recordingPath}`);
  const resolvedRoots = await Promise.all(roots.map((root) => realpath(root).catch(() => root)));
  if (!resolvedRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error('voice recording must be inside an approved local artifact root');
  }
  const readiness = options.readiness ?? await probeVoiceTranscription(options);
  if (!readiness.ready) throw new Error(readiness.blocker);
  if (typeof options.providerRunner === 'function') {
    const result = await options.providerRunner({ recordingPath: resolved, provider: readiness.provider });
    return normalizeTranscriptionResult(result, recording, readiness.provider);
  }
  throw new Error('configured transcription provider has no Reel-owned runner');
}

export function parseSrt(value) {
  return String(value ?? '').trim().split(/\n\s*\n/).map((block) => {
    const lines = block.split(/\r?\n/);
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) return null;
    const [start, end] = lines[timingIndex].split('-->').map((stamp) => stamp.trim());
    const text = lines.slice(timingIndex + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    return text ? { start, end, text } : null;
  }).filter(Boolean);
}

function normalizeTranscriptionResult(input = {}, recording, provider) {
  const transcript = requiredString(input.transcript, 'transcript');
  return {
    transcript,
    cues: Array.isArray(input.cues) ? structuredClone(input.cues) : [],
    recording: structuredClone(recording),
    evidence: {
      provider: provider.id,
      modelPath: provider.modelPath,
      srtPath: input.srtPath ?? null,
      localOnly: true,
    },
  };
}

async function exists(candidate) {
  try {
    const info = await stat(candidate);
    return info.isFile() || info.isDirectory();
  } catch {
    return false;
  }
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}
