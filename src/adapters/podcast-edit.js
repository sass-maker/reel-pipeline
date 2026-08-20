import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export const MASHUP_MEDIA_RECEIPT_SCHEMA = 'fleet.mashup-media-receipt.v1';

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function assertInsideRoots(candidate, roots) {
  if (!roots.length) throw new Error('at least one approved artifact root is required');
  if (!roots.some((root) => candidate === root || candidate.startsWith(`${root}${path.sep}`))) {
    throw new Error('Mashup media must be inside an approved local artifact root');
  }
}

export function normalizeMashupMediaReceipt(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Mashup receipt must be an object');
  if (input.schema !== MASHUP_MEDIA_RECEIPT_SCHEMA) throw new Error(`unsupported Mashup receipt schema: ${input.schema ?? 'missing'}`);
  if (input.approval?.status !== 'approved') throw new Error('Mashup media must be approved before ingestion');
  const video = input.output?.video;
  const normalized = {
    schema: input.schema,
    artifactId: requiredString(input.artifactId, 'artifactId'),
    generatedAt: requiredString(input.generatedAt, 'generatedAt'),
    approval: structuredClone(input.approval),
    recipe: { id: requiredString(input.recipe?.id, 'recipe.id') },
    runtime: { revision: requiredString(input.runtime?.revision, 'runtime.revision') },
    modelRevisions: structuredClone(input.modelRevisions ?? {}),
    sources: structuredClone(input.sources ?? []),
    output: {
      video: {
        path: requiredString(video?.path, 'output.video.path'),
        bytes: Number(video?.bytes),
        sha256: requiredString(video?.sha256, 'output.video.sha256'),
      },
      captions: input.output?.captions ? structuredClone(input.output.captions) : null,
      durationSeconds: Number(input.output?.durationSeconds),
      width: Number(input.output?.width),
      height: Number(input.output?.height),
    },
    validation: structuredClone(input.validation ?? {}),
  };
  if (!normalized.sources.length) throw new Error('Mashup receipt must retain source provenance');
  if (![normalized.output.video.bytes, normalized.output.durationSeconds, normalized.output.width, normalized.output.height].every(Number.isFinite)) {
    throw new Error('Mashup receipt has invalid media measurements');
  }
  if (!/^[a-f0-9]{64}$/i.test(normalized.output.video.sha256)) throw new Error('Mashup receipt has invalid video hash');
  return normalized;
}

export async function inspectMashupMedia({ receiptPath, approvedRoots = [] }) {
  const resolvedReceipt = await realpath(path.resolve(requiredString(receiptPath, 'receiptPath'))).catch(() => null);
  if (!resolvedReceipt) throw new Error(`Mashup receipt is missing: ${receiptPath}`);
  const roots = await Promise.all(approvedRoots.map((root) => realpath(path.resolve(root)).catch(() => path.resolve(root))));
  assertInsideRoots(resolvedReceipt, roots);
  const receipt = normalizeMashupMediaReceipt(JSON.parse(await readFile(resolvedReceipt, 'utf8')));
  const mediaPath = await realpath(path.resolve(path.dirname(resolvedReceipt), receipt.output.video.path)).catch(() => null);
  if (!mediaPath) throw new Error(`Mashup media is missing: ${receipt.output.video.path}`);
  assertInsideRoots(mediaPath, roots);
  const info = await stat(mediaPath);
  if (!info.isFile() || info.size !== receipt.output.video.bytes) throw new Error('Mashup media size does not match receipt');
  if (await sha256File(mediaPath) !== receipt.output.video.sha256) throw new Error('Mashup media hash does not match receipt');
  return {
    sourceType: 'external-mashup-media',
    mediaPath,
    receiptPath: resolvedReceipt,
    receipt,
  };
}
