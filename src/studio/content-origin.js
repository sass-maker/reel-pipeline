export const CONTENT_LANES = ['project-automation', 'operator-request', 'personal-automation'];
export const CONTENT_SCOPES = ['project', 'personal'];
export const CONTENT_TRIGGERS = ['scheduled', 'event', 'operator-request'];

export function normalizeContentOrigin(input, context = {}) {
  const projectSlug = optionalString(context.projectSlug);
  if (!input) return legacyOperatorOrigin(projectSlug);
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('origin must be an object');

  const scopeInput = typeof input.scope === 'string' ? { type: input.scope } : (input.scope ?? {});
  const scopeType = scopeInput.type ?? (projectSlug ? 'project' : 'personal');
  if (!CONTENT_SCOPES.includes(scopeType)) throw new Error(`origin scope must be one of ${CONTENT_SCOPES.join(', ')}`);
  const scopedProject = optionalString(scopeInput.projectSlug ?? input.projectSlug ?? projectSlug);
  if (scopeType === 'project' && !scopedProject) throw new Error('project-scoped origin requires projectSlug');
  if (scopeType === 'personal' && scopedProject) throw new Error('personal-scoped origin cannot include projectSlug');

  const triggerInput = typeof input.trigger === 'string' ? { type: input.trigger } : (input.trigger ?? {});
  const triggerType = triggerInput.type ?? 'operator-request';
  if (!CONTENT_TRIGGERS.includes(triggerType)) throw new Error(`origin trigger must be one of ${CONTENT_TRIGGERS.join(', ')}`);
  const automationPolicyId = optionalString(
    triggerInput.automationPolicyId ?? input.automationPolicyId,
  );
  const automationPolicyRevision = optionalPositiveInteger(
    triggerInput.automationPolicyRevision ?? input.automationPolicyRevision,
    'origin.trigger.automationPolicyRevision',
  );
  if (triggerType !== 'operator-request' && !automationPolicyId) {
    throw new Error('automated origin requires automationPolicyId');
  }
  if (triggerType === 'operator-request' && automationPolicyId) {
    throw new Error('operator-request origin cannot include automationPolicyId');
  }

  const lane = laneFor({ scopeType, triggerType });
  if (input.lane !== undefined && input.lane !== lane) {
    throw new Error(`origin lane ${input.lane} conflicts with scope and trigger (${lane})`);
  }
  const sourceInput = input.source ?? {};
  const source = {
    adapter: optionalString(sourceInput.adapter) ?? (triggerType === 'operator-request' ? 'studio-conversation' : null),
    sourceId: optionalString(sourceInput.sourceId),
    revision: sourceInput.revision === undefined || sourceInput.revision === null
      ? null
      : String(sourceInput.revision),
    fingerprint: optionalString(sourceInput.fingerprint),
    canonicalUrl: optionalUrl(sourceInput.canonicalUrl, 'origin.source.canonicalUrl'),
    createdBy: optionalString(sourceInput.createdBy) ?? (triggerType === 'operator-request' ? 'operator' : 'automation'),
  };
  if (triggerType !== 'operator-request') {
    for (const field of ['adapter', 'sourceId', 'fingerprint']) {
      if (!source[field]) throw new Error(`automated origin requires source.${field}`);
    }
  }
  return {
    schema: 'fleet.studio-content-origin.v1',
    lane,
    scope: { type: scopeType, projectSlug: scopedProject },
    trigger: {
      type: triggerType,
      automationPolicyId,
      automationPolicyRevision,
      requestedBy: optionalString(triggerInput.requestedBy) ?? (triggerType === 'operator-request' ? 'operator' : null),
    },
    source,
  };
}

export function laneFor({ scopeType, triggerType }) {
  if (triggerType === 'operator-request') return 'operator-request';
  return scopeType === 'project' ? 'project-automation' : 'personal-automation';
}

function legacyOperatorOrigin(projectSlug) {
  return {
    schema: 'fleet.studio-content-origin.v1',
    lane: 'operator-request',
    scope: { type: projectSlug ? 'project' : 'personal', projectSlug: projectSlug ?? null },
    trigger: {
      type: 'operator-request', automationPolicyId: null, automationPolicyRevision: null, requestedBy: 'operator',
    },
    source: {
      adapter: 'legacy', sourceId: null, revision: null, fingerprint: null, canonicalUrl: null, createdBy: 'operator',
    },
  };
}

function optionalUrl(value, field) {
  const text = optionalString(value);
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${field} must be an absolute URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${field} must use http or https`);
  return url.toString();
}

function optionalPositiveInteger(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${field} must be a positive integer`);
  return number;
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
