import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { buildDistributionRequest, executeDistribution, normalizeDistributionRequest } from '../distribution.js';
import { InternalChannelPublisher } from '../internal-publisher.js';
import { checkSocialReadiness } from '../social-readiness.js';
import { listExecutionAdapters, missingExecutionInputs, validateExecutionRegistry } from '../studio/execution-registry.js';
import { listProductionProjects, listRecipeVariants, normalizeRecipeOptions } from '../studio/production-catalog.js';
import { executeVideoVariant } from '../studio/video-execution.js';
import {
  AgentOperationError,
  VIDEO_AGENT_MANIFEST_SCHEMA,
  normalizeAgentRequest,
  operationSuccess,
  rejectUnknown,
} from './protocol.js';

export const REEL_AGENT_PRODUCT = 'reel-pipeline';
const OPERATIONS = Object.freeze([
  operation('manifest', 'read'),
  operation('readiness', 'read'),
  operation('validate', 'plan'),
  operation('execute', 'render'),
  operation('package', 'write'),
  operation('publish', 'external'),
]);

export async function runReelAgent(rawRequest, options = {}) {
  const request = normalizeAgentRequest(rawRequest, REEL_AGENT_PRODUCT);
  const known = OPERATIONS.find((entry) => entry.id === request.operation);
  if (!known) throw new AgentOperationError('UNKNOWN_OPERATION', `unknown Reel operation: ${request.operation}`, { path: 'operation' });

  switch (request.operation) {
    case 'manifest':
      rejectUnknown(request.input, new Set([]), 'input');
      return operationSuccess(request, reelAgentManifest(options), { sideEffect: 'read' });
    case 'readiness':
      rejectUnknown(request.input, new Set(['configPath']), 'input');
      return operationSuccess(request, {
        registry: validateExecutionRegistry(),
        social: checkSocialReadiness({ configPath: request.input.configPath }),
      }, { sideEffect: 'read' });
    case 'validate':
      return validateExecution(request);
    case 'execute':
      return executeVariant(request, options);
    case 'package':
      return packageDistribution(request);
    case 'publish':
      return publishDistribution(request, options);
    default:
      throw new AgentOperationError('UNKNOWN_OPERATION', `unknown Reel operation: ${request.operation}`);
  }
}

export function reelAgentManifest(options = {}) {
  const variants = listRecipeVariants();
  const adapters = listExecutionAdapters();
  const policies = loadChannelPolicies(options.channelPolicyPath, options.channelPolicies);
  return {
    schema: VIDEO_AGENT_MANIFEST_SCHEMA,
    product: REEL_AGENT_PRODUCT,
    transport: { kind: 'cli-json', foreground: true, stdout: 'single-json-envelope' },
    operations: OPERATIONS,
    capabilities: {
      recipes: variants,
      adapters,
      executionModes: ['fixture', 'real'],
      projects: listProductionProjects(),
      channels: policies.channels,
    },
    completeness: {
      recipes: new Set(variants.map((entry) => entry.recipeId)).size,
      variants: variants.length,
      adapters: adapters.length,
      registry: validateExecutionRegistry(),
    },
    safety: {
      arbitraryExecution: false,
      fixtureNeverSubstitutesReal: true,
      publicationRequiresConfiguredPolicy: true,
    },
  };
}

function validateExecution(request) {
  const { brief, mode = 'real', inputs = {} } = executionInput(request.input);
  const normalized = normalizeRecipeOptions(brief.recipeId, brief.recipeOptions ?? {});
  const missing = mode === 'real' ? missingExecutionInputs(brief.recipeId, inputs) : [];
  return operationSuccess(request, {
    ready: missing.length === 0,
    mode,
    briefId: brief.id,
    recipeId: brief.recipeId,
    variant: normalized,
    missingInputs: missing,
    blocker: missing.length ? `Add ${missing.join(', ')} before real execution.` : null,
  }, { sideEffect: 'plan' });
}

async function executeVariant(request, options) {
  const { brief, mode = 'real', inputs = {} } = executionInput(request.input);
  if (request.validateOnly) return validateExecution(request);
  try {
    const envelope = await executeVideoVariant(brief, {
      mode,
      inputs,
      realExecutors: options.realExecutors,
      galleryOptions: options.galleryOptions,
    });
    return operationSuccess(request, envelope, {
      sideEffect: 'render',
      artifacts: envelope.artifact?.videoPath ? [{ kind: 'video', ...envelope.artifact }] : [],
    });
  } catch (error) {
    throw classifyExecutionError(error);
  }
}

function packageDistribution(request) {
  rejectUnknown(request.input, new Set(['contentPackage', 'mediaReceipt', 'options']), 'input');
  const distribution = buildDistributionRequest(request.input.contentPackage, request.input.mediaReceipt, request.input.options ?? {});
  return operationSuccess(request, { distribution }, { sideEffect: request.validateOnly ? 'plan' : 'write' });
}

async function publishDistribution(request, options) {
  rejectUnknown(request.input, new Set(['contentPackage', 'mediaReceipt', 'distributionRequest', 'channelPolicyPath']), 'input');
  const distribution = normalizeDistributionRequest(request.input.distributionRequest);
  const policies = loadChannelPolicies(request.input.channelPolicyPath ?? options.channelPolicyPath, options.channelPolicies);
  const policy = policies.channels.find((entry) => entry.brand === distribution.brand && entry.channel === distribution.channel);
  if (!policy) throw new AgentOperationError('CHANNEL_NOT_CONFIGURED', `no agent channel policy for ${distribution.brand}/${distribution.channel}`);
  if (policy.provider !== distribution.provider) throw new AgentOperationError('CHANNEL_PROVIDER_MISMATCH', `configured provider for ${distribution.brand}/${distribution.channel} is ${policy.provider}`);
  if (request.validateOnly) return operationSuccess(request, { ready: policy.mode !== 'draft_only', policy, distribution }, { sideEffect: 'plan' });
  if (policy.mode === 'draft_only' && distribution.provider !== 'manual') {
    throw new AgentOperationError('CHANNEL_DRAFT_ONLY', 'channel policy permits local preparation only');
  }
  if (policy.mode === 'approval_required' && distribution.approval.status !== 'approved') {
    throw new AgentOperationError('APPROVAL_REQUIRED', 'configured channel requires an approved distribution request');
  }
  if (policy.mode === 'autonomous' && distribution.approval.status !== 'approved') {
    distribution.approval = { status: 'approved', approvedAt: new Date().toISOString(), approvedBy: 'configured-agent-policy' };
  }
  const internalProvider = options.internalProvider ?? createInternalProvider(options);
  const receipt = await executeDistribution(request.input.contentPackage, request.input.mediaReceipt, distribution, { internalProvider });
  return operationSuccess(request, { policy, receipt }, { sideEffect: 'external' });
}

function executionInput(input) {
  rejectUnknown(input, new Set(['brief', 'mode', 'inputs']), 'input');
  if (!input.brief?.id || !input.brief?.recipeId) throw new AgentOperationError('INVALID_BRIEF', 'input.brief requires id and recipeId', { path: 'input.brief' });
  if (!['fixture', 'real'].includes(input.mode ?? 'real')) throw new AgentOperationError('INVALID_MODE', 'input.mode must be fixture or real', { path: 'input.mode' });
  return input;
}

function loadChannelPolicies(configPath, injected) {
  if (injected) return validatePolicies(injected);
  const resolved = path.resolve(configPath ?? process.env.VIDEO_AGENT_CHANNELS_CONFIG ?? 'config/video-agent-channels.json');
  if (!existsSync(resolved)) return { schema: 'fleet.video-agent-channels.v1', channels: [] };
  return validatePolicies(JSON.parse(readFileSync(resolved, 'utf8')));
}

function validatePolicies(input) {
  if (input?.schema !== 'fleet.video-agent-channels.v1' || !Array.isArray(input.channels)) {
    throw new AgentOperationError('CHANNEL_CONFIG_INVALID', 'channel policy config must use fleet.video-agent-channels.v1');
  }
  const channels = input.channels.map((entry, index) => {
    if (!entry?.brand || !entry.channel || !['manual', 'internal'].includes(entry.provider ?? 'internal') || !['draft_only', 'approval_required', 'autonomous'].includes(entry.mode)) {
      throw new AgentOperationError('CHANNEL_CONFIG_INVALID', `channels[${index}] requires brand, channel, and valid mode`);
    }
    return { brand: entry.brand, channel: entry.channel, provider: entry.provider ?? 'internal', mode: entry.mode };
  });
  return { schema: input.schema, channels };
}

function createInternalProvider(options) {
  const configPath = path.resolve(options.internalChannelConfigPath ?? process.env.INTERNAL_VIDEO_CHANNELS_CONFIG ?? 'config/internal-video-channels.json');
  if (!existsSync(configPath)) return undefined;
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  return new InternalChannelPublisher(config);
}

function classifyExecutionError(error) {
  const message = error?.message ?? String(error);
  if (message.includes('Add ') || message.includes('no registered')) return new AgentOperationError('EXECUTION_BLOCKED', message);
  if (message.includes('fixture preview is unavailable')) return new AgentOperationError('FIXTURE_UNAVAILABLE', message);
  return new AgentOperationError('EXECUTION_FAILED', message, { retryable: false });
}

function operation(id, sideEffect) {
  return { id, sideEffect, validateOnly: !['manifest', 'readiness'].includes(id) };
}
