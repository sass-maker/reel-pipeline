import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PRODUCTION_RECIPE_IDS, PRODUCTION_SPEND_CLASSES } from './production-catalog.js';

export const AUTOMATION_POLICY_SCHEMA = 'fleet.studio-automation-policies.v1';
export const DISTRIBUTION_MODES = ['none', 'draft', 'schedule'];
const CHANNELS = ['instagram_reels', 'youtube_shorts'];
const TRIGGERS = ['scheduled', 'event'];
const CADENCES = ['daily', 'weekly', 'event'];

export async function loadAutomationPolicies(options = {}) {
  const filePath = path.resolve(options.filePath ?? 'config/studio-automation.json');
  const parsed = JSON.parse(await readFile(filePath, 'utf8'));
  return normalizeAutomationPolicies(parsed, { filePath });
}

export function normalizeAutomationPolicies(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('automation policy registry must be an object');
  const secretPath = findSecretField(input);
  if (secretPath) throw new Error(`automation policy registry must be secret-free: ${secretPath}`);
  if (input.$schema !== AUTOMATION_POLICY_SCHEMA) throw new Error(`unsupported automation policy schema: ${input.$schema ?? 'missing'}`);
  const version = positiveInteger(input.version, 'automation policy version');
  if (!Array.isArray(input.policies) || !input.policies.length) throw new Error('automation policy registry requires policies');
  const policies = input.policies.map((policy, index) => normalizeAutomationPolicy(policy, index));
  if (new Set(policies.map((policy) => policy.id)).size !== policies.length) throw new Error('automation policy ids must be unique');
  return {
    schema: AUTOMATION_POLICY_SCHEMA,
    version,
    filePath: options.filePath ? path.resolve(options.filePath) : null,
    policies,
  };
}

function findSecretField(value, prefix = '') {
  if (!value || typeof value !== 'object') return null;
  for (const [key, nested] of Object.entries(value)) {
    const field = prefix ? `${prefix}.${key}` : key;
    if (/(?:api.?key|credential|password|secret|token)/i.test(key)) return field;
    const found = findSecretField(nested, field);
    if (found) return found;
  }
  return null;
}

export function normalizeAutomationPolicy(input, index = 0) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`policies[${index}] must be an object`);
  const id = requiredString(input.id, `policies[${index}].id`);
  const revision = positiveInteger(input.revision, `policies[${index}].revision`);
  const scopeType = input.scope?.type;
  if (scopeType !== 'project' && scopeType !== 'personal') throw new Error(`${id}: scope.type must be project or personal`);
  const projectSlug = optionalString(input.scope?.projectSlug);
  if (scopeType === 'project' && !projectSlug) throw new Error(`${id}: project scope requires projectSlug or *`);
  if (scopeType === 'personal' && projectSlug) throw new Error(`${id}: personal scope cannot include projectSlug`);
  const sourceAdapter = requiredString(input.source?.adapter, `${id}: source.adapter`);
  const triggerType = input.trigger?.type;
  if (!TRIGGERS.includes(triggerType)) throw new Error(`${id}: trigger.type must be one of ${TRIGGERS.join(', ')}`);
  const cadence = input.trigger?.cadence;
  if (!CADENCES.includes(cadence)) throw new Error(`${id}: trigger.cadence must be one of ${CADENCES.join(', ')}`);
  if ((triggerType === 'event') !== (cadence === 'event')) throw new Error(`${id}: event trigger requires event cadence and vice versa`);
  const channels = uniqueArray(input.channels, `${id}: channels`);
  if (!channels.length || channels.some((channel) => !CHANNELS.includes(channel))) throw new Error(`${id}: unsupported channel`);
  const recipes = uniqueArray(input.recipes, `${id}: recipes`);
  if (!recipes.length || recipes.some((recipe) => !PRODUCTION_RECIPE_IDS.includes(recipe))) throw new Error(`${id}: unsupported recipe`);
  if (!PRODUCTION_SPEND_CLASSES.includes(input.spendCeiling)) throw new Error(`${id}: unsupported spend ceiling`);
  if (input.sourceRights !== 'approved') throw new Error(`${id}: sourceRights must be approved for unattended production`);
  const distributionMode = input.distribution?.mode ?? 'none';
  if (!DISTRIBUTION_MODES.includes(distributionMode)) throw new Error(`${id}: unsupported distribution mode`);
  if (distributionMode === 'schedule' && !input.distribution?.schedule) throw new Error(`${id}: schedule mode requires distribution.schedule`);
  return {
    id,
    revision,
    enabled: input.enabled === true,
    label: requiredString(input.label, `${id}: label`),
    scope: { type: scopeType, projectSlug },
    source: { adapter: sourceAdapter },
    trigger: { type: triggerType, cadence },
    channels,
    recipes,
    spendCeiling: input.spendCeiling,
    sourceRights: input.sourceRights,
    maxItemsPerRun: boundedInteger(input.maxItemsPerRun ?? 1, 1, 20, `${id}: maxItemsPerRun`),
    maxAttempts: boundedInteger(input.maxAttempts ?? 1, 1, 5, `${id}: maxAttempts`),
    qualityThreshold: ['pass', 'review'].includes(input.qualityThreshold) ? input.qualityThreshold : 'pass',
    distribution: {
      mode: distributionMode,
      schedule: input.distribution?.schedule ? structuredClone(input.distribution.schedule) : null,
    },
  };
}

export function automationPolicyById(registry, id) {
  const policy = registry.policies.find((entry) => entry.id === id);
  if (!policy) throw new Error(`automation policy not found: ${id}`);
  return structuredClone(policy);
}

export function spendAllowed(spendClass, ceiling) {
  return PRODUCTION_SPEND_CLASSES.indexOf(spendClass) <= PRODUCTION_SPEND_CLASSES.indexOf(ceiling);
}

function uniqueArray(value, field) {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return [...new Set(value.map((entry) => requiredString(entry, field)))];
}

function boundedInteger(value, min, max, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${field} must be between ${min} and ${max}`);
  return number;
}

function positiveInteger(value, field) {
  return boundedInteger(value, 1, Number.MAX_SAFE_INTEGER, field);
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredString(value, field) {
  const text = optionalString(value);
  if (!text) throw new Error(`${field} is required`);
  return text;
}
