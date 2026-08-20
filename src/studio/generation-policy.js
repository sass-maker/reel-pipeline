export const GENERATIVE_MEDIA_POLICY = Object.freeze({
  schema: 'fleet.media-generation-policy.v1',
  mode: 'manual-import',
  localFrontierGeneration: 'parked',
  paidProviderGeneration: 'approval-required',
  automaticPaidSpendUsd: 0,
  retainedLocalUtilities: Object.freeze([
    'deterministic-rendering',
    'kokoro-tts',
    'procedural-draft-audio',
  ]),
  blocker: 'Frontier image, video, and music generation is parked. Import approved external media; any paid generation requires a separate per-job budget and operator approval.',
});

export function generativeMediaBlocker(kind = 'media') {
  return `${kind} generation is parked. Import approved external media; any paid generation requires a separate per-job budget and operator approval.`;
}
