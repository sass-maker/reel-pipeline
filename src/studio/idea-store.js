import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import brandConfig from '../../config/brand-channels.json' with { type: 'json' };
import { normalizeContentOrigin } from './content-origin.js';

const STATUSES = ['new', 'scripted', 'rendered', 'posted'];
export const AUTOMATION_STATES = [
  'discovered', 'queued', 'producing', 'rendered', 'review-required',
  'distribution-ready', 'drafted', 'scheduled', 'failed', 'skipped',
];

export class IdeaStore {
  constructor(options = {}) {
    this.filePath = path.resolve(options.filePath ?? process.env.STUDIO_IDEAS_FILE ?? './tmp/studio/ideas.json');
  }

  async load() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.ideas) ? parsed.ideas.map(normalizeIdea) : [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async persist(ideas) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ ideas }, null, 2)}\n`);
    await rename(temporary, this.filePath);
  }

  async saveIdea(input) {
    if (!input || typeof input.title !== 'string' || !input.title.trim()) {
      throw new Error('idea requires a title');
    }
    const ideas = await this.load();
    const now = new Date().toISOString();
    const projectSlug = normalizeProjectSlug(input.projectSlug);
    const idempotencyKey = optionalString(input.idempotencyKey) ?? null;
    if (idempotencyKey) {
      const existing = ideas.find((entry) => entry.idempotencyKey === idempotencyKey);
      if (existing) return freezeSourcePayload(existing);
    }
    const idea = {
      id: input.id ?? `idea_${now.replace(/\D/g, '').slice(0, 14)}_${ideas.length + 1}`,
      projectSlug,
      origin: normalizeContentOrigin(input.origin, { projectSlug }),
      title: input.title.trim(),
      niche: input.niche ?? null,
      angle: input.angle ?? null,
      hook: input.hook ?? null,
      format: input.format ?? null,
      notes: input.notes ?? null,
      idempotencyKey,
      contentSource: input.contentSource ? structuredClone(input.contentSource) : null,
      approvedVariant: input.approvedVariant ? structuredClone(input.approvedVariant) : null,
      automation: normalizeAutomationState(input.automation),
      status: STATUSES.includes(input.status) ? input.status : 'new',
      createdAt: now,
      updatedAt: now,
    };
    ideas.push(idea);
    await this.persist(ideas);
    return freezeSourcePayload(idea);
  }

  async listIdeas({ status, projectSlug, lane } = {}) {
    const ideas = await this.load();
    const normalizedProject = projectSlug === undefined ? undefined : normalizeProjectSlug(projectSlug);
    return ideas.filter((idea) => (
      (!status || idea.status === status)
      && (normalizedProject === undefined || idea.projectSlug === normalizedProject)
      && (!lane || idea.origin?.lane === lane)
    ));
  }

  async findByIdempotencyKey(idempotencyKey) {
    const key = optionalString(idempotencyKey);
    if (!key) return null;
    return (await this.load()).find((idea) => idea.idempotencyKey === key) ?? null;
  }

  async updateIdea(id, patch = {}) {
    const ideas = await this.load();
    const idea = ideas.find((entry) => entry.id === id);
    if (!idea) throw new Error(`idea not found: ${id}`);
    if (patch.status !== undefined && !STATUSES.includes(patch.status)) {
      throw new Error(`unsupported idea status: ${patch.status} (expected ${STATUSES.join(', ')})`);
    }
    for (const key of ['status', 'niche', 'angle', 'hook', 'format', 'notes']) {
      if (patch[key] !== undefined) idea[key] = patch[key];
    }
    if (patch.automation !== undefined) {
      idea.automation = normalizeAutomationState({ ...(idea.automation ?? {}), ...patch.automation });
    }
    idea.updatedAt = new Date().toISOString();
    await this.persist(ideas);
    return freezeSourcePayload(idea);
  }

  async updateIdeaStatus(id, status) {
    if (!STATUSES.includes(status)) {
      throw new Error(`unsupported idea status: ${status} (expected ${STATUSES.join(', ')})`);
    }
    const ideas = await this.load();
    const idea = ideas.find((entry) => entry.id === id);
    if (!idea) throw new Error(`idea not found: ${id}`);
    idea.status = status;
    idea.updatedAt = new Date().toISOString();
    await this.persist(ideas);
    return freezeSourcePayload(idea);
  }
}

export const IDEA_STATUSES = STATUSES;

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeProjectSlug(value) {
  const slug = optionalString(value);
  if (!slug) return null;
  if (!brandConfig.brands?.[slug]) throw new Error(`unknown Fleet brand: ${slug}`);
  return slug;
}

function normalizeIdea(idea) {
  const projectSlug = normalizeProjectSlug(idea?.projectSlug);
  return freezeSourcePayload({
    ...idea,
    projectSlug,
    origin: normalizeContentOrigin(idea?.origin, { projectSlug }),
    automation: normalizeAutomationState(idea?.automation),
  });
}

function normalizeAutomationState(value) {
  if (!value) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('automation state must be an object');
  const state = AUTOMATION_STATES.includes(value.state) ? value.state : 'discovered';
  return {
    policyId: optionalString(value.policyId) ?? null,
    policyRevision: positiveIntegerOrNull(value.policyRevision),
    runId: optionalString(value.runId) ?? null,
    state,
    briefId: optionalString(value.briefId) ?? null,
    selectedRecipe: value.selectedRecipe && typeof value.selectedRecipe === 'object'
      ? structuredClone(value.selectedRecipe)
      : null,
    attempts: Array.isArray(value.attempts) ? structuredClone(value.attempts) : [],
    distributionState: optionalString(value.distributionState) ?? 'not-prepared',
    nextAction: optionalString(value.nextAction) ?? null,
    lastError: optionalString(value.lastError) ?? null,
  };
}

function positiveIntegerOrNull(value) {
  if (value === undefined || value === null) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error('automation policy revision must be a positive integer');
  return number;
}

function freezeSourcePayload(idea) {
  if (idea?.contentSource) deepFreeze(idea.contentSource);
  if (idea?.approvedVariant) deepFreeze(idea.approvedVariant);
  if (idea?.origin) deepFreeze(idea.origin);
  return idea;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
