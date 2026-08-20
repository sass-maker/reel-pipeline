export const POST_READY_VOICE_CATALOG = Object.freeze([
  Object.freeze({ id: 'af_bella', label: 'Bella', character: 'Bright and energetic', accent: 'American', recommendedFor: 'Friendly, poppy reels' }),
  Object.freeze({ id: 'af_heart', label: 'Heart', character: 'Warm and conversational', accent: 'American', recommendedFor: 'Personal stories and explainers' }),
  Object.freeze({ id: 'af_nova', label: 'Nova', character: 'Clear and upbeat', accent: 'American', recommendedFor: 'Fast hooks and product stories' }),
  Object.freeze({ id: 'am_puck', label: 'Puck', character: 'Playful and punchy', accent: 'American', recommendedFor: 'High-energy social shorts' }),
  Object.freeze({ id: 'am_adam', label: 'Adam', character: 'Direct and grounded', accent: 'American', recommendedFor: 'Straightforward explainers' }),
  Object.freeze({ id: 'af_sky', label: 'Sky', character: 'Soft and measured', accent: 'American', recommendedFor: 'Reflective narration' }),
  Object.freeze({ id: 'bf_emma', label: 'Emma', character: 'Warm and polished', accent: 'British', recommendedFor: 'Editorial and documentary reads' }),
]);

export function postReadyVoice(id) {
  return POST_READY_VOICE_CATALOG.find((voice) => voice.id === id) ?? null;
}

export function applyPostReadyVoiceOverride(briefInput, { voice, speed } = {}) {
  if (!voice && speed == null) return structuredClone(briefInput);
  if (briefInput?.narration?.mode !== 'kokoro') {
    throw new Error('voice overrides require narration.mode="kokoro"');
  }
  if (voice && !postReadyVoice(voice)) {
    throw new Error(`voice must be one of: ${POST_READY_VOICE_CATALOG.map((entry) => entry.id).join(', ')}`);
  }
  const numericSpeed = speed == null ? briefInput.narration.speed : Number(speed);
  if (numericSpeed != null && (!Number.isFinite(numericSpeed) || numericSpeed < 0.75 || numericSpeed > 1.25)) {
    throw new Error('voice speed must be between 0.75 and 1.25');
  }
  return {
    ...structuredClone(briefInput),
    narration: {
      ...briefInput.narration,
      ...(voice ? { voice } : {}),
      ...(numericSpeed == null ? {} : { speed: numericSpeed }),
    },
  };
}
