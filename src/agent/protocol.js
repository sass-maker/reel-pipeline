import { createHash, randomUUID } from 'node:crypto';

export const VIDEO_AGENT_SCHEMA = 'fleet.video-agent-operation.v1';
export const VIDEO_AGENT_MANIFEST_SCHEMA = 'fleet.video-agent-manifest.v1';

const ROOT_FIELDS = new Set(['schema', 'product', 'operation', 'operationId', 'idempotencyKey', 'validateOnly', 'input']);
// `script` is valid authored video copy inside a content package. Executable
// inputs remain impossible because every operation strictly validates its
// top-level fields and these explicit execution-shaped keys are rejected at
// every depth.
const FORBIDDEN_FIELDS = new Set(['command', 'shell', 'sourceCode', 'code', 'plugin', 'executable']);

export class AgentOperationError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'AgentOperationError';
    this.code = code;
    this.path = options.path ?? null;
    this.retryable = Boolean(options.retryable);
    this.details = options.details ?? null;
  }
}

export function normalizeAgentRequest(input, product) {
  if (!plainObject(input)) throw new AgentOperationError('INVALID_REQUEST', 'request must be a JSON object');
  rejectUnknown(input, ROOT_FIELDS, 'request');
  if (input.schema !== VIDEO_AGENT_SCHEMA) throw new AgentOperationError('UNSUPPORTED_SCHEMA', `schema must be ${VIDEO_AGENT_SCHEMA}`, { path: 'schema' });
  if (input.product !== product) throw new AgentOperationError('PRODUCT_MISMATCH', `product must be ${product}`, { path: 'product' });
  const operation = requiredString(input.operation, 'operation');
  const normalizedInput = input.input ?? {};
  if (!plainObject(normalizedInput)) throw new AgentOperationError('INVALID_INPUT', 'input must be an object', { path: 'input' });
  rejectForbidden(normalizedInput, 'input');
  return {
    schema: VIDEO_AGENT_SCHEMA,
    product,
    operation,
    operationId: optionalString(input.operationId) ?? randomUUID(),
    idempotencyKey: optionalString(input.idempotencyKey),
    validateOnly: input.validateOnly === true,
    input: structuredClone(normalizedInput),
  };
}

export function operationSuccess(request, result, options = {}) {
  const finishedAt = new Date().toISOString();
  return {
    schema: VIDEO_AGENT_SCHEMA,
    product: request.product,
    operation: request.operation,
    operationId: request.operationId,
    idempotencyKey: request.idempotencyKey,
    state: options.state ?? (request.validateOnly ? 'validated' : 'completed'),
    sideEffect: options.sideEffect ?? 'read',
    startedAt: options.startedAt ?? finishedAt,
    finishedAt,
    requestHash: stableHash({ operation: request.operation, input: request.input }),
    result,
    warnings: options.warnings ?? [],
    artifacts: options.artifacts ?? [],
    error: null,
  };
}

export function operationFailure(requestInput, error, product = 'unknown') {
  const request = plainObject(requestInput) ? requestInput : {};
  const normalized = error instanceof AgentOperationError
    ? error
    : new AgentOperationError(error?.code ?? 'OPERATION_FAILED', error?.message ?? String(error), { retryable: Boolean(error?.retryable) });
  const finishedAt = new Date().toISOString();
  return {
    schema: VIDEO_AGENT_SCHEMA,
    product: request.product ?? product,
    operation: request.operation ?? null,
    operationId: request.operationId ?? null,
    idempotencyKey: request.idempotencyKey ?? null,
    state: 'failed',
    sideEffect: 'none',
    startedAt: finishedAt,
    finishedAt,
    requestHash: null,
    result: null,
    warnings: [],
    artifacts: [],
    error: {
      code: normalized.code,
      message: normalized.message,
      path: normalized.path,
      retryable: normalized.retryable,
      details: normalized.details,
    },
  };
}

export function stableHash(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function rejectUnknown(input, allowed, path) {
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new AgentOperationError('UNKNOWN_FIELD', `unknown field: ${path}.${key}`, { path: `${path}.${key}` });
  }
}

export function requiredString(value, path) {
  if (typeof value !== 'string' || !value.trim()) throw new AgentOperationError('REQUIRED_FIELD', `${path} is required`, { path });
  return value.trim();
}

function rejectForbidden(value, path) {
  if (Array.isArray(value)) return value.forEach((entry, index) => rejectForbidden(entry, `${path}[${index}]`));
  if (!plainObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.has(key)) throw new AgentOperationError('ARBITRARY_EXECUTION_REJECTED', `${path}.${key} is not an accepted agent input`, { path: `${path}.${key}` });
    rejectForbidden(entry, `${path}.${key}`);
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (plainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function plainObject(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function optionalString(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
