export const LYRIC_DETAILS_SCHEMA = 'fleet.lyric-video-details.v1';
export const LYRIC_PRODUCTION_SCHEMA = 'fleet.lyric-video-production.v1';
export const MAX_LYRIC_CUES = 240;
export const MAX_LYRIC_DURATION_MS = 20 * 60 * 1000;

const COMPOSITION_RIGHTS = new Set(['unknown', 'owned', 'licensed', 'public-domain', 'rejected']);
const MASTER_RIGHTS = new Set(['unknown', 'owned', 'licensed', 'original-recording', 'rejected']);
const VISUAL_STYLES = new Set(['literal-cinematic', 'kinetic-type', 'blender-literal']);

export function normalizeLyricDetails(input, options = {}) {
  if (!input) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('lyric must be an object');
  }

  const audioDurationMs = optionalDurationMs(input.audioDurationMs);
  const timedLyrics = normalizeTimedLyricsSource(input.timedLyrics);
  let cues = [];
  let parseError = null;

  try {
    if (Array.isArray(input.cues) && input.cues.length) {
      cues = parseTimedLyrics(input.cues, { audioDurationMs });
    } else if (timedLyrics) {
      cues = parseTimedLyrics(timedLyrics, {
        format: input.timedLyricsFormat,
        audioDurationMs,
      });
    }
  } catch (error) {
    parseError = error.message;
  }

  const rights = normalizeMusicRights(input.rights);
  const scenePlan = input.scenePlan
    ? validateLiteralScenePlan(input.scenePlan, cues)
    : cues.length ? planLiteralScenes(cues) : [];

  return {
    schema: LYRIC_DETAILS_SCHEMA,
    audioPath: optionalString(input.audioPath),
    audioDurationMs,
    timedLyrics,
    timedLyricsFormat: normalizeTimedLyricsFormat(input.timedLyricsFormat, timedLyrics),
    cues,
    parseError,
    attribution: optionalString(input.attribution),
    rights,
    visualStyle: VISUAL_STYLES.has(input.visualStyle) ? input.visualStyle : 'literal-cinematic',
    useBlender: input.useBlender === true || input.visualStyle === 'blender-literal',
    reducedMotion: input.reducedMotion === true,
    scenePlan,
    operatorSupplied: options.operatorSupplied !== false,
  };
}

export function parseTimedLyrics(input, options = {}) {
  const format = inferTimedLyricsFormat(input, options.format);
  let cues;
  if (format === 'structured') cues = parseStructuredCues(input);
  else if (format === 'lrc') cues = parseLrc(input, options.audioDurationMs);
  else if (format === 'srt') cues = parseSrt(input);
  else throw new Error('timed lyrics must use LRC, SRT, or structured cues');
  return validateTimedCues(cues, options);
}

export function normalizeMusicRights(input = {}) {
  const composition = COMPOSITION_RIGHTS.has(input?.composition)
    ? input.composition
    : 'unknown';
  const master = MASTER_RIGHTS.has(input?.master)
    ? input.master
    : 'unknown';
  return {
    composition,
    master,
    evidence: optionalString(input?.evidence),
    evidenceUrl: optionalHttpUrl(input?.evidenceUrl, 'lyric.rights.evidenceUrl'),
    assertedBy: optionalString(input?.assertedBy) ?? 'operator',
    assertedAt: optionalIso(input?.assertedAt),
  };
}

export function evaluateLyricRights(lyric) {
  const blockers = [];
  const composition = lyric?.rights?.composition ?? 'unknown';
  const master = lyric?.rights?.master ?? 'unknown';

  if (!['owned', 'licensed', 'public-domain'].includes(composition)) {
    blockers.push(composition === 'rejected'
      ? 'Composition and lyric rights are rejected.'
      : 'Record composition and lyric rights.');
  }
  if (!['owned', 'licensed', 'original-recording'].includes(master)) {
    blockers.push(master === 'rejected'
      ? 'Master-recording rights are rejected.'
      : 'Record master-recording rights.');
  }
  if (!lyric?.attribution) blockers.push('Add song and recording attribution.');
  if (!lyric?.rights?.evidence && !lyric?.rights?.evidenceUrl) {
    blockers.push('Add rights evidence. Attribution is not permission.');
  }

  return {
    ready: blockers.length === 0,
    blockers,
    assertion: {
      composition,
      master,
      evidence: lyric?.rights?.evidence ?? null,
      evidenceUrl: lyric?.rights?.evidenceUrl ?? null,
      attribution: lyric?.attribution ?? null,
      independentlyVerified: false,
    },
  };
}

export function evaluateLyricReadiness(lyric, options = {}) {
  const blockers = [];
  lyric ??= {};
  if (!lyric.audioPath) blockers.push('Add an approved local audio file.');
  if (!lyric.timedLyrics && !lyric.cues?.length) {
    blockers.push('Add operator-supplied timed lyrics; the Studio does not fetch lyrics.');
  }
  if (lyric.parseError) blockers.push(`Fix timed lyrics: ${lyric.parseError}`);
  if (!lyric.cues?.length && (lyric.timedLyrics || lyric.parseError)) {
    blockers.push('Timed lyrics must contain at least one valid cue.');
  }
  blockers.push(...evaluateLyricRights(lyric).blockers);
  if (lyric.useBlender && options.blenderReady === false) {
    blockers.push(options.blenderBlocker ?? 'Install a compatible Blender 5.2 runtime.');
  }
  return { ready: blockers.length === 0, blockers };
}

export function planLiteralScenes(cues) {
  let previousObjects = [];
  return cues.map((cue, index) => {
    const words = cue.text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}' -]/gu, '')
      .split(/\s+/)
      .filter(Boolean);
    let objects = literalObjects(words);
    if (
      objects.length === 1
      && objects[0] === 'the exact named subject'
      && previousObjects.length
      && words.some((word) => ['you', 'your', 'it', 'what'].includes(word))
    ) {
      objects = [...previousObjects];
    }
    const action = literalAction(words);
    const environment = literalEnvironment(words);
    const scene = {
      id: `lyric-scene-${index + 1}`,
      cueIndex: index,
      startMs: cue.startMs,
      endMs: cue.endMs,
      lyric: cue.text,
      interpretation: `Show ${objects.join(', ')} ${action} in ${environment}.`,
      objects,
      action,
      environment,
      camera: index % 2 === 0 ? 'slow-push' : 'gentle-orbit',
      palette: index % 2 === 0 ? 'midnight-gold' : 'blue-silver',
      assetSource: 'deterministic-literal-plan',
    };
    previousObjects = objects;
    return scene;
  });
}

export function validateLiteralScenePlan(plan, cues) {
  if (!Array.isArray(plan)) throw new Error('lyric.scenePlan must be an array');
  if (plan.length !== cues.length) throw new Error('literal scene plan must contain exactly one scene per cue');
  return plan.map((scene, index) => {
    if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
      throw new Error(`literal scene ${index + 1} must be an object`);
    }
    if (scene.lyric !== cues[index].text) {
      throw new Error(`literal scene ${index + 1} must preserve its source lyric verbatim`);
    }
    if (Number(scene.cueIndex ?? index) !== index) {
      throw new Error(`literal scene ${index + 1} is out of order`);
    }
    return {
      id: optionalString(scene.id) ?? `lyric-scene-${index + 1}`,
      cueIndex: index,
      startMs: cues[index].startMs,
      endMs: cues[index].endMs,
      lyric: cues[index].text,
      interpretation: requiredString(scene.interpretation, `literal scene ${index + 1} interpretation`),
      objects: boundedStrings(scene.objects, `literal scene ${index + 1} objects`, 8),
      action: requiredString(scene.action, `literal scene ${index + 1} action`),
      environment: requiredString(scene.environment, `literal scene ${index + 1} environment`),
      camera: ['static', 'slow-push', 'gentle-orbit'].includes(scene.camera) ? scene.camera : 'static',
      palette: optionalString(scene.palette) ?? 'midnight-gold',
      assetSource: optionalString(scene.assetSource) ?? 'operator-edited-literal-plan',
    };
  });
}

export function buildLyricProductionManifest(input) {
  const lyric = normalizeLyricDetails(input.lyric);
  const readiness = evaluateLyricReadiness(lyric, input.runtime ?? {});
  if (!readiness.ready) throw new Error(`lyric video is not ready: ${readiness.blockers.join(' ')}`);
  return {
    schema: LYRIC_PRODUCTION_SCHEMA,
    briefId: requiredString(input.briefId, 'briefId'),
    title: requiredString(input.title, 'title'),
    durationMs: lyric.cues.at(-1).endMs,
    lyric,
    rights: evaluateLyricRights(lyric).assertion,
    runtime: input.runtime && typeof input.runtime === 'object' ? structuredClone(input.runtime) : {},
  };
}

function parseLrc(value, audioDurationMs) {
  const text = String(value ?? '').replace(/\r/g, '');
  const cues = [];
  for (const [lineIndex, line] of text.split('\n').entries()) {
    if (!line.trim()) continue;
    const stamps = [...line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) {
      if (/^\[[a-z]+:/i.test(line.trim())) continue;
      throw new Error(`LRC line ${lineIndex + 1} has no timestamp`);
    }
    const lyric = line.replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g, '').trim();
    if (!lyric) throw new Error(`LRC line ${lineIndex + 1} has empty lyric text`);
    assertPlainLyricText(lyric, `LRC line ${lineIndex + 1}`);
    for (const stamp of stamps) {
      cues.push({ startMs: lrcTimestampMs(stamp), endMs: null, text: lyric });
    }
  }
  cues.sort((a, b) => a.startMs - b.startMs);
  for (let index = 0; index < cues.length; index += 1) {
    cues[index].endMs = cues[index + 1]?.startMs
      ?? audioDurationMs
      ?? Math.min(MAX_LYRIC_DURATION_MS, cues[index].startMs + 4000);
  }
  return cues;
}

function parseSrt(value) {
  const blocks = String(value ?? '').replace(/\r/g, '').trim().split(/\n{2,}/);
  return blocks.filter(Boolean).map((block, index) => {
    const lines = block.split('\n');
    if (/^\d+$/.test(lines[0]?.trim())) lines.shift();
    const timing = lines.shift()?.match(
      /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s+-->\s+(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})$/,
    );
    if (!timing) throw new Error(`SRT cue ${index + 1} has invalid timing`);
    const text = lines.join('\n').trim();
    if (!text) throw new Error(`SRT cue ${index + 1} has empty lyric text`);
    assertPlainLyricText(text, `SRT cue ${index + 1}`);
    return {
      startMs: srtTimestampMs(timing.slice(1, 5)),
      endMs: srtTimestampMs(timing.slice(5, 9)),
      text,
    };
  });
}

function parseStructuredCues(value) {
  if (!Array.isArray(value)) throw new Error('structured timed lyrics must be an array');
  return value.map((cue, index) => {
    if (!cue || typeof cue !== 'object' || Array.isArray(cue)) {
      throw new Error(`timed lyric cue ${index + 1} must be an object`);
    }
    const text = requiredString(cue.text, `timed lyric cue ${index + 1} text`);
    assertPlainLyricText(text, `timed lyric cue ${index + 1}`);
    return {
      startMs: numberMs(cue.startMs, `timed lyric cue ${index + 1} startMs`),
      endMs: numberMs(cue.endMs, `timed lyric cue ${index + 1} endMs`),
      text,
    };
  });
}

function validateTimedCues(input, options) {
  if (!input.length) throw new Error('timed lyrics must contain at least one cue');
  if (input.length > MAX_LYRIC_CUES) {
    throw new Error(`timed lyrics exceed the ${MAX_LYRIC_CUES}-cue limit`);
  }
  const audioDurationMs = optionalDurationMs(options.audioDurationMs);
  return input.map((cue, index) => {
    const startMs = numberMs(cue.startMs, `timed lyric cue ${index + 1} startMs`);
    const endMs = numberMs(cue.endMs, `timed lyric cue ${index + 1} endMs`);
    if (endMs <= startMs) throw new Error(`timed lyric cue ${index + 1} must end after it starts`);
    if (index > 0 && startMs < input[index - 1].endMs) {
      throw new Error(`timed lyric cue ${index + 1} overlaps cue ${index}`);
    }
    if (endMs > MAX_LYRIC_DURATION_MS) {
      throw new Error(`timed lyric cue ${index + 1} exceeds the 20-minute limit`);
    }
    if (audioDurationMs !== null && endMs > audioDurationMs + 100) {
      throw new Error(`timed lyric cue ${index + 1} exceeds the audio duration`);
    }
    return { startMs, endMs, text: cue.text };
  });
}

function inferTimedLyricsFormat(input, explicit) {
  if (explicit && !['lrc', 'srt', 'structured'].includes(explicit)) {
    throw new Error(`unsupported timed lyric format: ${explicit}`);
  }
  if (explicit) return explicit;
  if (Array.isArray(input)) return 'structured';
  return /-->/m.test(String(input ?? '')) ? 'srt' : 'lrc';
}

function normalizeTimedLyricsFormat(explicit, source) {
  if (!source) return null;
  return inferTimedLyricsFormat(source, explicit);
}

function normalizeTimedLyricsSource(value) {
  if (Array.isArray(value)) return structuredClone(value);
  return optionalString(value);
}

function literalObjects(words) {
  const known = [
    ['star', 'bright stars'],
    ['diamond', 'a cut diamond'],
    ['world', 'the curved world below'],
    ['sky', 'the open night sky'],
    ['sun', 'the setting sun'],
    ['traveller', 'a lone traveller'],
    ['traveler', 'a lone traveller'],
    ['night', 'the night'],
    ['light', 'a warm light'],
    ['rain', 'falling rain'],
    ['heart', 'a human heart'],
    ['road', 'a winding road'],
  ];
  const matched = known.filter(([token]) => words.some((word) => word.startsWith(token))).map(([, object]) => object);
  return matched.length ? [...new Set(matched)].slice(0, 6) : ['the exact named subject'];
}

function literalAction(words) {
  if (words.some((word) => /^twinkl/.test(word))) return 'twinkling visibly';
  if (words.some((word) => /^wonder/.test(word))) return 'being observed with wonder';
  if (words.some((word) => /^shine/.test(word))) return 'shining with a visible glow';
  if (words.some((word) => /^walk|travel/.test(word))) return 'moving through the scene';
  return 'performing the stated action';
}

function literalEnvironment(words) {
  if (words.some((word) => /sky|star|night|world/.test(word))) return 'a deep, physically grounded night sky';
  if (words.some((word) => /road|travel|walk/.test(word))) return 'a real landscape';
  return 'a concrete, uncluttered environment';
}

function lrcTimestampMs(match) {
  const fraction = String(match[3] ?? '0').padEnd(3, '0').slice(0, 3);
  return Number(match[1]) * 60_000 + Number(match[2]) * 1000 + Number(fraction);
}

function srtTimestampMs(parts) {
  return Number(parts[0]) * 3_600_000
    + Number(parts[1]) * 60_000
    + Number(parts[2]) * 1000
    + Number(parts[3]);
}

function assertPlainLyricText(value, field) {
  if (/<\/?[a-z][^>]*>/i.test(value)) throw new Error(`${field} contains unsupported markup`);
}

function boundedStrings(value, field, limit) {
  if (!Array.isArray(value) || value.length < 1 || value.length > limit) {
    throw new Error(`${field} must contain 1-${limit} items`);
  }
  return value.map((entry, index) => requiredString(entry, `${field}[${index}]`).slice(0, 120));
}

function numberMs(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${field} must be a non-negative integer`);
  return number;
}

function optionalDurationMs(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = numberMs(value, 'lyric.audioDurationMs');
  if (number > MAX_LYRIC_DURATION_MS) throw new Error('lyric.audioDurationMs exceeds the 20-minute limit');
  return number;
}

function optionalHttpUrl(value, field) {
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

function optionalIso(value) {
  const text = optionalString(value);
  if (!text) return null;
  if (!Number.isFinite(Date.parse(text))) throw new Error('lyric.rights.assertedAt must be an ISO date');
  return new Date(text).toISOString();
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredString(value, field) {
  const text = optionalString(value);
  if (!text) throw new Error(`${field} is required`);
  return text;
}
