export const FORGE_DEMO_NARRATION = [
  'Most video generators begin with a prompt.',
  'This one begins with a frame you approve.',
  'Then the Mac renders three motion variants,',
  'saves every seed,',
  'and lets you choose before spending more compute.',
].join(' ');

export const FORGE_DEMO_CAPTIONS = [
  { text: 'Most video generators begin with a prompt.', scene: 'prompt-field' },
  { text: 'This one begins with a frame you approve.', scene: 'approved-frame' },
  { text: 'Then the Mac renders three motion variants,', scene: 'variant-filmstrip' },
  { text: 'saves every seed,', scene: 'seed-ledger' },
  { text: 'and lets you choose before spending more compute.', scene: 'selection-proof' },
];

function speechWeight(text) {
  const words = text.trim().split(/\s+/).length;
  const punctuationPauses = (text.match(/[,.]/g) ?? []).length * 0.7;
  return words + punctuationPauses;
}

export function buildForgeDemoTimeline({
  narrationDurationSeconds,
  audioOffsetSeconds = 0.8,
  outroSeconds = 0.9,
  captionDurationsSeconds,
} = {}) {
  if (!(narrationDurationSeconds > 0)) {
    throw new Error('narrationDurationSeconds must be greater than zero');
  }

  if (captionDurationsSeconds && (
    captionDurationsSeconds.length !== FORGE_DEMO_CAPTIONS.length
    || captionDurationsSeconds.some((duration) => !(duration > 0))
  )) {
    throw new Error(`captionDurationsSeconds must contain ${FORGE_DEMO_CAPTIONS.length} positive durations`);
  }
  const weights = captionDurationsSeconds ?? FORGE_DEMO_CAPTIONS.map(({ text }) => speechWeight(text));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let cursor = audioOffsetSeconds;
  const captions = FORGE_DEMO_CAPTIONS.map((caption, index) => {
    const duration = narrationDurationSeconds * (weights[index] / totalWeight);
    const cue = {
      ...caption,
      start: cursor,
      end: index === FORGE_DEMO_CAPTIONS.length - 1
        ? audioOffsetSeconds + narrationDurationSeconds
        : cursor + duration,
    };
    cursor = cue.end;
    return cue;
  });

  const narrationEnd = audioOffsetSeconds + narrationDurationSeconds;
  const scenes = [
    {
      id: 'silent-intro',
      start: 0,
      end: audioOffsetSeconds,
      visual: 'static-presenter',
      speech: false,
    },
    ...captions.map((cue) => ({
      id: cue.scene,
      start: cue.start,
      end: cue.end,
      visual: cue.scene === 'approved-frame' || cue.scene === 'variant-filmstrip'
        ? 'static-approved-evidence'
        : 'generated-graphics',
      speech: true,
    })),
    {
      id: 'silent-outro',
      start: narrationEnd,
      end: narrationEnd + outroSeconds,
      visual: 'static-presenter',
      speech: false,
    },
  ];

  return {
    audioOffsetSeconds,
    narrationDurationSeconds,
    narrationEnd,
    totalDurationSeconds: narrationEnd + outroSeconds,
    captions,
    scenes,
    lipSync: false,
  };
}

export function assertNoFalseLipSync(timeline) {
  const violations = timeline.scenes.filter(
    (scene) => scene.speech && scene.visual === 'moving-presenter',
  );
  if (violations.length) {
    throw new Error(`speech scenes cannot use moving presenter footage: ${violations.map(({ id }) => id).join(', ')}`);
  }
  return true;
}

function srtTimestamp(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export function timelineToSrt(timeline) {
  return `${timeline.captions.map((cue, index) => [
    index + 1,
    `${srtTimestamp(cue.start)} --> ${srtTimestamp(cue.end)}`,
    cue.text,
  ].join('\n')).join('\n\n')}\n`;
}

export function sceneAt(timeline, seconds) {
  return timeline.scenes.find(
    (scene, index) => seconds >= scene.start
      && (seconds < scene.end || (index === timeline.scenes.length - 1 && seconds <= scene.end)),
  ) ?? timeline.scenes.at(-1);
}
