#!/usr/bin/env node
/**
 * Production reel renderer.
 *
 * Features:
 *  - Per-project narrative explainer scripts (~30s, 5-6 scenes).
 *  - Real product proof captured from GitHub repo URL.
 *  - Multi-region Ken Burns on the captured screenshot (different pan/zoom per
 *    proof scene so the camera explores top → middle → bottom).
 *  - Voiceover via Edge TTS (uvx) with the en-US-AvaNeural neural voice; falls
 *    back to macOS `say` if uvx is unavailable.
 *  - Captions burned in with SRT-synced timing (overlay shown exactly during
 *    the cue window from edge-tts subtitles).
 *  - Scene transitions via ffmpeg xfade + acrossfade.
 *  - Honest quality scoring (doesn't pretend posting-ready until we have
 *    music, demo flow, and dynamic UI motion).
 *
 * Usage:
 *   node content-factory/scripts/render-pro.js [reelId ...]
 */
import { execFile } from 'node:child_process';
import { access, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { selectGrokVideoAsset } from '../../reel-pipeline/src/adapters/grok-video.js';
import {
  captureScrollTour,
  recordScreencast,
  recordScrollScreencast,
} from '../../reel-pipeline/scripts/cdp-capture.js';
import { emitArtifactManifest, hashCanonicalJson } from '../src/manifest.js';

const execFileAsync = promisify(execFile);

const BASE =
  process.env.REEL_WORKER_URL ?? 'https://reel-pipeline-artifacts.sarthakagrawal927.workers.dev';
const WORKER_HEADERS = contentFactoryWorkerHeaders();
const BUCKET = process.env.REEL_ARTIFACT_R2_BUCKET ?? 'reel-artifacts';
const WORK_ROOT = path.resolve(process.env.REEL_RENDER_WORK ?? './tmp/render-pro');
const CHROME =
  process.env.REEL_RENDER_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VOICE = process.env.REEL_VOICE ?? 'en-US-AvaNeural';
const VOICE_FALLBACK = process.env.REEL_VOICE_FALLBACK ?? 'en-US-JennyNeural';

function contentFactoryWorkerHeaders() {
  const token = process.env.REEL_INTERNAL_TOKEN;
  if (!token) throw new Error('REEL_INTERNAL_TOKEN is required for the Foundry render handoff');
  return { authorization: `Bearer ${token}` };
}

// Multi-voice rotation. Different Edge TTS voices per scene mood reduce
// single-AI-voice fatigue. Map by scene `kind`. Defaults fall back to VOICE.
const VOICE_BY_KIND = {
  hook_punch: 'en-US-BrianNeural', // shouted single word
  card_pain: 'en-US-BrianNeural', // male, sincere — grabs attention
  card_intro: 'en-US-AndrewNeural', // male, warm, confident — product credibility
  screenshot: 'en-US-AvaNeural', // expressive female explainer (default)
  card_outcome: 'en-US-EmmaNeural', // female, clear, friendly — payoff line
  card_cta: 'en-US-GuyNeural', // male, passion — energetic close
  brand_close: 'en-US-GuyNeural', // matches CTA energy
};

// Single-word hook frame per project — flashes for ~1.2s before the explainer
// proper begins. Pure attention-grab.
const PROJECT_HOOK_WORDS = {
  linkchat: { word: 'STOP.', sub: 'Answering the same DM.' },
  reader: { word: 'FORGOTTEN.', sub: 'Everything you saved.' },
  starboard: { word: 'LOST.', sub: 'That repo you starred.' },
  'high-signal': { word: 'NOISE.', sub: 'Your last five tweets.' },
  codevetter: { word: 'SLOW.', sub: 'Every code review.' },
  default: { word: 'WAIT.', sub: 'This is worth 30 seconds.' },
};

// Outro brand-close per project — shown for ~1.8s at the end. Project name +
// short URL hint.
const PROJECT_BRAND_CLOSE = {
  linkchat: { primary: 'linkchat', secondary: 'Build your profile in 60 seconds.' },
  reader: { primary: 'reader', secondary: 'Make saved into learned.' },
  starboard: { primary: 'starboard', secondary: 'Your stars, searchable.' },
  'high-signal': { primary: 'high-signal', secondary: 'Score before you post.' },
  codevetter: { primary: 'codevetter', secondary: 'Auto-review the PR.' },
  default: { primary: 'the product', secondary: 'Try it now.' },
};

const DEFAULT_REELS = [
  'demo-linkchat-1',
  'demo-reader-1',
  'demo-starboard-1',
  'demo-signalwire-1',
  'demo-codevetter-1',
];

const PROJECT_URLS_CONFIG_PATH = path.resolve('./config/project-urls.json');
const PROJECT_URLS = await loadProjectUrls(PROJECT_URLS_CONFIG_PATH);

async function loadProjectUrls(configPath) {
  try {
    const raw = await readFile(configPath, 'utf8');
    const data = JSON.parse(raw);
    const out = {};
    for (const [slug, entry] of Object.entries(data)) {
      if (slug.startsWith('$')) continue;
      const productUrl =
        typeof entry === 'string' ? entry : entry?.productUrl || entry?.fallbackUrl;
      if (productUrl) out[slug] = productUrl;
    }
    return out;
  } catch (error) {
    console.warn(`! could not load ${configPath}: ${error.message}`);
    return {};
  }
}

const PROJECT_PALETTES = {
  linkchat: { accent: '#22d3ee', bg: '#082f49', text: '#ecfeff' },
  reader: { accent: '#a78bfa', bg: '#1e1b4b', text: '#ede9fe' },
  starboard: { accent: '#fbbf24', bg: '#1c1917', text: '#fef3c7' },
  'high-signal': { accent: '#f87171', bg: '#270a0a', text: '#fee2e2' },
  codevetter: { accent: '#34d399', bg: '#052e16', text: '#dcfce7' },
  default: { accent: '#7dd3fc', bg: '#0c0c10', text: '#ecfeff' },
};

/**
 * Per-project narrative scripts. Each project has 5-6 scenes.
 * Scene fields:
 *   - kind: 'card_pain' | 'card_intro' | 'card_outcome' | 'card_cta' | 'screenshot'
 *   - label: short label badge ("Problem", "Why", "Linkchat", "How", "Outcome", "Try it")
 *   - caption: short caption shown briefly on screen
 *   - voice: longer spoken line (Edge TTS reads this; SRT cues drive caption timing)
 *   - zoomFocus (for screenshot scenes): 'top' | 'middle' | 'bottom'
 */
const PROJECT_SCRIPTS = {
  linkchat: [
    {
      kind: 'card_pain',
      label: 'Problem',
      caption: 'The same DM. Twenty times a day.',
      voice:
        "You're answering the same direct message twenty times a day. Same question. Same energy.",
    },
    {
      kind: 'card_intro',
      label: 'Why',
      caption: 'Your link-in-bio gets repeat asks.',
      voice:
        'Your link in bio gets the same questions over and over. Visitors leave before you can reply.',
    },
    {
      kind: 'screenshot',
      label: 'Linkchat',
      caption: 'An AI chat profile, right on your link.',
      voice:
        'Linkchat puts an A I chat profile right under your link in bio. Visitors can ask anything.',
      zoomFocus: 'top',
    },
    {
      kind: 'screenshot',
      label: 'How',
      caption: 'Answers from your docs and posts.',
      voice:
        'It answers from your own docs, posts, and saved replies. Always your voice. Always on.',
      zoomFocus: 'middle',
    },
    {
      kind: 'card_outcome',
      label: 'Outcome',
      caption: 'DMs drop. Your bio becomes a conversation.',
      voice: 'Your inbox quiets down. Your link in bio becomes an actual conversation, not a wall.',
    },
    {
      kind: 'card_cta',
      label: 'Try it',
      caption: 'Open Linkchat. Build your profile.',
      voice: 'Open Linkchat. Build your profile in sixty seconds. Free to start.',
    },
  ],
  reader: [
    {
      kind: 'card_pain',
      label: 'Problem',
      caption: 'Saved. Forgotten.',
      voice: 'You save articles. You feel productive. You forget you saved them.',
    },
    {
      kind: 'card_intro',
      label: 'Why',
      caption: 'Your read-it-later became a guilt folder.',
      voice: 'Most read it later apps are graveyards. Things go in. Nothing comes back out.',
    },
    {
      kind: 'screenshot',
      label: 'Reader',
      caption: 'Annotate the web. Keep what matters.',
      voice:
        'Reader is a web annotator that resurfaces what you saved, with the highlights and notes you actually made.',
      zoomFocus: 'top',
    },
    {
      kind: 'screenshot',
      label: 'How',
      caption: 'Highlights, notes, and review sessions.',
      voice: 'Every session shows you what is worth re reading, side by side with your notes.',
      zoomFocus: 'middle',
    },
    {
      kind: 'card_outcome',
      label: 'Outcome',
      caption: 'Saved becomes learned.',
      voice: 'What you save turns into what you remember. Saved becomes learned.',
    },
    {
      kind: 'card_cta',
      label: 'Try it',
      caption: 'Open Reader. Pick one saved article.',
      voice: 'Open Reader. Pick one saved article. Start there.',
    },
  ],
  starboard: [
    {
      kind: 'card_pain',
      label: 'Problem',
      caption: "You starred it. You can't find it.",
      voice: 'You starred a repo because it mattered. Six months later, you cannot find it.',
    },
    {
      kind: 'card_intro',
      label: 'Why',
      caption: 'GitHub stars are an island of names.',
      voice: 'Your starred repos on GitHub are just a wall of names. Search there is brutal.',
    },
    {
      kind: 'screenshot',
      label: 'Starboard',
      caption: 'Search your stars by what they do.',
      voice: 'Starboard makes your stars searchable by what each project does, not just its name.',
      zoomFocus: 'top',
    },
    {
      kind: 'screenshot',
      label: 'How',
      caption: 'Type "vector db". Find that repo.',
      voice: 'Type vector D B. Find that repo you forgot about. Type rate limiter. Same answer.',
      zoomFocus: 'middle',
    },
    {
      kind: 'card_outcome',
      label: 'Outcome',
      caption: 'Your stars become your library.',
      voice: 'Your starred repos turn from a list into an actual library you can use.',
    },
    {
      kind: 'card_cta',
      label: 'Try it',
      caption: 'Search one thing you starred.',
      voice: 'Open Starboard. Search one thing you starred. Two minutes.',
    },
  ],
  'high-signal': [
    {
      kind: 'card_pain',
      label: 'Problem',
      caption: 'Your tweets — smart or spam?',
      voice: 'Your last five tweets. Do they sound smart, or just spammy? Most people never check.',
    },
    {
      kind: 'card_intro',
      label: 'Why',
      caption: 'No one audits their own writing.',
      voice: 'No one audits their own writing. They post. They guess. They add to the noise.',
    },
    {
      kind: 'screenshot',
      label: 'High Signal',
      caption: 'Public signal log for AI infra.',
      voice:
        'High Signal is a public log that grades posts against the hype word index and concrete claims.',
      zoomFocus: 'top',
    },
    {
      kind: 'screenshot',
      label: 'How',
      caption: 'Paste a tweet. See the score and the edit.',
      voice:
        'Paste a tweet. See the score, the hype ratio, and the rewrite that would make it better.',
      zoomFocus: 'middle',
    },
    {
      kind: 'card_outcome',
      label: 'Outcome',
      caption: 'Stop adding to the noise.',
      voice:
        'Stop adding to the noise. Start a real signal trail your future self will not regret.',
    },
    {
      kind: 'card_cta',
      label: 'Try it',
      caption: 'Paste one tweet at High Signal.',
      voice: 'Paste one tweet. See your score. Then post the rewrite.',
    },
  ],
  codevetter: [
    {
      kind: 'card_pain',
      label: 'Problem',
      caption: 'Code review is the slow lane.',
      voice:
        'Code review is the slowest part of shipping. Pull requests sit for days. Context evaporates.',
    },
    {
      kind: 'card_intro',
      label: 'Why',
      caption: 'Humans review every diff.',
      voice:
        'Every diff gets opened by a human. Most of what they catch is mechanical. Naming. Missing tests. Risky paths.',
    },
    {
      kind: 'screenshot',
      label: 'CodeVetter',
      caption: 'AI code review, desktop-first.',
      voice:
        'Code vetter is an A I code review platform. Desktop first. Works offline. Reads the diff before a human ever opens it.',
      zoomFocus: 'top',
    },
    {
      kind: 'screenshot',
      label: 'How',
      caption: 'Flags risky changes, surfaces tests.',
      voice:
        'It flags risky changes, missing tests, naming drift. Reviewers see only what actually matters.',
      zoomFocus: 'middle',
    },
    {
      kind: 'card_outcome',
      label: 'Outcome',
      caption: 'You ship faster. Reviewers stay sharp.',
      voice:
        'You ship faster. Reviewers spend their attention on the parts that actually need a human eye.',
    },
    {
      kind: 'card_cta',
      label: 'Try it',
      caption: 'Drop one PR URL into CodeVetter.',
      voice: 'Drop one pull request U R L. See the review. Decide what to merge.',
    },
  ],
};

const TRANSITION = 0.45;
const VARIANT_COUNT = Math.max(1, Math.min(3, Number(process.env.REEL_VARIANT_COUNT ?? 1)));
const CAPTION_CANVAS_HEIGHT = 520;

const SC_FRAME = {
  // Inner device dimensions and offsets for the screencast composite. The
  // outer canvas is 1080×1920; the screencast sits in the middle at
  // SC_FRAME.w × SC_FRAME.h, with SC_FRAME.x / SC_FRAME.y as the top-left
  // offset (so x = (1080 - w) / 2, y = (1920 - h) / 2 to center).
  w: 1000,
  h: 1700,
  x: 40,
  y: 110,
  radius: 36,
  shadowPad: 60,
};

const VARIANT_TRANSFORMS = [
  {
    id: 'v1',
    label: 'Direct',
    transform: (scenes) => scenes,
  },
  {
    id: 'v2',
    label: 'POV',
    transform: (scenes) =>
      scenes.map((scene, idx) =>
        idx === 0
          ? {
              ...scene,
              caption: `POV: ${scene.caption}`,
              voice: `POV. ${scene.voice}`,
            }
          : scene
      ),
  },
  {
    id: 'v3',
    label: 'Question',
    transform: (scenes) =>
      scenes.map((scene, idx) =>
        idx === 0
          ? {
              ...scene,
              caption: `Real question: ${scene.caption}`,
              voice: `Real question. ${scene.voice}`,
            }
          : scene
      ),
  },
];

const AMBIENT_CHORDS = {
  // Each project gets a slightly different chord palette so beds feel distinct.
  // Frequencies are sine partials in Hz. All are minor 7 / sus-style — soft,
  // non-distracting under a voiceover.
  linkchat: [55, 110, 130.81, 164.81, 246.94],
  reader: [49, 98, 116.54, 146.83, 220.0],
  starboard: [58.27, 110, 138.59, 174.61, 220.0],
  'high-signal': [65.41, 130.81, 155.56, 196.0, 246.94],
  codevetter: [61.74, 123.47, 146.83, 185.0, 233.08],
  default: [55, 110, 138.59, 164.81, 220.0],
};

const reelIds = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_REELS;
const results = [];

const useEdgeTts = await edgeTtsAvailable();

for (const reelId of reelIds) {
  try {
    const summary = await renderReel(reelId);
    results.push(summary);
  } catch (error) {
    console.error(`\n× ${reelId} failed:`, error.message);
    results.push({ reelId, ok: false, error: error.message });
  }
}

console.log('\n=== summary ===');
console.log(JSON.stringify(results, null, 2));

async function renderReel(reelId) {
  console.log(`\n▸ ${reelId}`);
  const dir = path.join(WORK_ROOT, reelId);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const reel = await fetchReel(reelId);
  if (!reel) throw new Error(`reel ${reelId} not found`);

  // Prefer the real productUrl on the reel record; fall back to a GitHub URL
  // only when no real product URL is configured (and skip placeholder
  // *.example domains).
  const reelProductUrl = isUsableProductUrl(reel.productUrl) ? reel.productUrl : null;
  const url = reelProductUrl ?? PROJECT_URLS[reel.projectSlug] ?? null;
  const palette = PROJECT_PALETTES[reel.projectSlug] ?? PROJECT_PALETTES.default;
  const script = PROJECT_SCRIPTS[reel.projectSlug];
  if (!script) throw new Error(`no script defined for project ${reel.projectSlug}`);

  // Synthesize a project-flavored ambient music bed (~60s loop). Reused for
  // every scene of this reel, mixed under the voice with sidechain ducking.
  const ambientPath = path.join(dir, 'ambient.mp3');
  console.log('  synthesizing ambient bed…');
  await synthAmbientBed(ambientPath, reel.projectSlug);

  // Transition SFX (swoosh) — synthesized once, mixed at every scene
  // boundary during the final stitch pass.
  const sfxPath = path.join(dir, 'sfx-whoosh.mp3');
  await synthTransitionSfx(sfxPath);

  // ScreenStudio-style frame for the screencast scene — accent-color gradient
  // backdrop + rounded-corner mask + drop shadow. Generated once per reel; the
  // composer uses them only when the scene has a videoBgPath.
  const screencastBackdrop = path.join(dir, 'sc-backdrop.png');
  const screencastMask = path.join(dir, 'sc-mask.png');
  const screencastShadow = path.join(dir, 'sc-shadow.png');
  await renderScreencastFrame(palette, screencastBackdrop, screencastMask, screencastShadow);

  // QR for the brand_close — fetched as a PNG from a free QR API. Embedding
  // as <img> in the HTML is more reliable than loading a JS lib via CDN in
  // headless Chrome (which races virtual-time-budget).
  const qrPath = path.join(dir, 'qr.png');
  const qrTarget = url ?? `https://github.com/sarthakagrawal927/${reel.projectSlug}`;
  try {
    await fetchQrPng(qrTarget, qrPath);
  } catch (error) {
    console.warn(`  QR fetch failed (${error.message?.slice(0, 100)}); brand close will skip QR`);
  }

  // Talking avatar is currently disabled — the stylized circle reads as
  // childish. Re-enable later when a better avatar design exists. Set
  // REEL_AVATAR=1 to opt back in.
  let avatarClosed = null;
  let avatarOpen = null;
  if (process.env.REEL_AVATAR === '1') {
    avatarClosed = path.join(dir, 'avatar-closed.png');
    avatarOpen = path.join(dir, 'avatar-open.png');
    console.log('  rendering talking avatar…');
    await renderTalkingAvatar(palette, avatarClosed, avatarOpen);
  }

  let tour = null;
  let screencastPath = null;
  if (url) {
    console.log(`  capturing scroll tour of ${url}…`);
    try {
      tour = await captureProductTour(url, dir);
    } catch (error) {
      console.warn(
        `  scroll tour failed (${error.message?.slice(0, 120)}); falling back to single screenshot`
      );
      try {
        const singlePath = path.join(dir, 'product.png');
        await captureProductScreenshot(url, singlePath);
        tour = { top: singlePath, middle: singlePath, bottom: singlePath };
      } catch (innerError) {
        console.warn(
          `  single screenshot also failed (${innerError.message?.slice(0, 120)}); using cards`
        );
        tour = null;
      }
    }

    // Real scrolling screencast — used as a moving bg for the "How" scene
    // so at least one scene shows the product in motion, not zoom-on-still.
    console.log(`  recording live scroll screencast (${url})…`);
    try {
      const info = await recordScrollScreencast(url, dir, {
        width: 1080,
        height: 1920,
        durationMs: 6000,
        scrollDeltaPerSec: 320,
        fps: 24,
      });
      if (info.frameCount >= 8) {
        screencastPath = path.join(dir, 'screencast.mp4');
        await run(
          'ffmpeg',
          [
            '-y',
            '-framerate',
            String(info.fps),
            '-i',
            path.join(info.frameDir, 'frame-%05d.png'),
            '-vf',
            'scale=1080:1920:force_original_aspect_ratio=disable,fps=30,setsar=1',
            '-c:v',
            'libx264',
            '-preset',
            'medium',
            '-pix_fmt',
            'yuv420p',
            '-r',
            '30',
            '-movflags',
            '+faststart',
            screencastPath,
          ],
          undefined,
          60_000
        );
      } else {
        console.warn(`  screencast produced only ${info.frameCount} frames; skipping live motion`);
      }
    } catch (error) {
      console.warn(
        `  screencast failed (${error.message?.slice(0, 120)}); proof scenes will stay on still + Ken Burns`
      );
    }
  }

  let grokMotion = null;
  try {
    grokMotion = await selectGrokVideoAsset(
      {
        id: reel.id,
        projectSlug: reel.projectSlug,
        title: reel.title,
        hook: reel.hook ?? reel.title,
        body: reel.body ?? '',
        cta: reel.cta,
        audience: reel.audience,
      },
      {
        sceneHints: script.flatMap((beat) => [beat.label, beat.caption, beat.voice]),
      }
    );
    if (grokMotion) {
      console.log(`  using Grok motion insert ${path.basename(grokMotion.path)}…`);
    }
  } catch (error) {
    console.warn(
      `  Grok motion lookup failed (${error.message?.slice(0, 120)}); continuing without generated inserts`
    );
  }

  // Hook frame at the top + brand close at the bottom of every reel.
  const hookSpec = PROJECT_HOOK_WORDS[reel.projectSlug] ?? PROJECT_HOOK_WORDS.default;
  const closeSpec = PROJECT_BRAND_CLOSE[reel.projectSlug] ?? PROJECT_BRAND_CLOSE.default;
  const introScene = {
    kind: 'hook_punch',
    label: 'Hook',
    caption: hookSpec.word,
    sub: hookSpec.sub,
    voice: hookSpec.word,
    palette,
    project: reel.projectSlug,
  };
  const outroScene = {
    kind: 'brand_close',
    label: 'Close',
    caption: closeSpec.primary,
    sub: closeSpec.secondary,
    voice: `${closeSpec.secondary} Open ${closeSpec.primary}.`,
    qrPath,
    palette,
    project: reel.projectSlug,
  };

  let grokInserted = false;
  const middleScenes = script.map((beat) => {
    const isHowScene = beat.kind === 'screenshot' && beat.label === 'How';
    const usesScreencast = isHowScene && screencastPath;
    const usesGrokMotion =
      !usesScreencast &&
      !grokInserted &&
      grokMotion &&
      (beat.kind === 'screenshot' ||
        /proof|product|how|visual|outcome/i.test(`${beat.label} ${beat.caption}`));
    if (usesGrokMotion) grokInserted = true;
    return {
      ...beat,
      palette,
      project: reel.projectSlug,
      backgroundPath:
        beat.kind === 'screenshot' && tour ? (tour[beat.zoomFocus] ?? tour.top) : null,
      // The "How" scene gets the real-motion screencast when available — it's
      // the one moment in the reel where we show the product responding,
      // not zooming on a still page.
      videoBgPath: usesScreencast ? screencastPath : usesGrokMotion ? grokMotion.path : null,
      motionSource: usesScreencast ? 'product_screencast' : usesGrokMotion ? 'grok_video' : null,
      screencastBackdrop: usesScreencast ? screencastBackdrop : null,
      screencastMask: usesScreencast ? screencastMask : null,
      screencastShadow: usesScreencast ? screencastShadow : null,
    };
  });

  const baseScenes = [introScene, ...middleScenes, outroScene];

  const variantsToRender = VARIANT_TRANSFORMS.slice(0, VARIANT_COUNT);
  const renderedVariants = [];

  for (const variantSpec of variantsToRender) {
    console.log(`  -- variant ${variantSpec.id} (${variantSpec.label}) --`);
    const variantDir = path.join(dir, variantSpec.id);
    await mkdir(variantDir, { recursive: true });
    const scenes = variantSpec.transform(baseScenes).map((scene) => ({ ...scene }));

    for (let index = 0; index < scenes.length; index += 1) {
      console.log(`    scene ${index + 1}/${scenes.length} (${scenes[index].label})…`);
      scenes[index].ambientPath = ambientPath;
      scenes[index].avatarClosed = avatarClosed;
      scenes[index].avatarOpen = avatarOpen;
      await renderScene(scenes[index], index, variantDir, scenes.length);
    }

    const stitchedPath = path.join(variantDir, `${reelId}-${variantSpec.id}-stitched.mp4`);
    console.log('    stitching with xfade…');
    await stitchScenes(scenes, variantDir, stitchedPath);

    const finalPath = path.join(variantDir, `${reelId}-${variantSpec.id}.mp4`);
    console.log('    layering transition SFX…');
    await applyTransitionSfx(stitchedPath, sfxPath, scenes, finalPath);

    const key = `${reelId}-${variantSpec.id}.mp4`;
    console.log('    uploading…');
    await run('npx', [
      'wrangler',
      'r2',
      'object',
      'put',
      `${BUCKET}/${key}`,
      '--file',
      finalPath,
      '--remote',
      '--content-type',
      'video/mp4',
    ]);
    // Append a cache-buster — the worker serves with `cache-control: immutable`
    // so re-rendered MP4s at the same key would otherwise be hidden behind
    // the browser cache.
    const assetUrl = `${BASE}/reels/${key}?v=${Date.now()}`;
    const totalDuration =
      scenes.reduce((total, scene) => total + scene.actualDuration, 0) -
      TRANSITION * (scenes.length - 1);
    renderedVariants.push({ variantSpec, scenes, assetUrl, totalDuration, finalPath });
    console.log(`    ✓ ${assetUrl} (${totalDuration.toFixed(1)}s)`);
  }

  console.log('  patching reel record with variants…');
  await patchReelRecordMultiVariant(
    reel,
    renderedVariants,
    dir,
    useEdgeTts,
    tour !== null,
    Boolean(grokMotion && grokInserted)
  );

  const supportedChannel = ['instagram_reels', 'youtube_shorts'].includes(reel.channel)
    ? [reel.channel]
    : ['instagram_reels', 'youtube_shorts'];
  const { manifest, manifestPath } = await emitArtifactManifest({
    context: {
      brief: { id: reel.id, version: Number(reel.version ?? 1) || 1 },
      projectId: reel.projectSlug,
      campaignId: reel.campaignId ?? reel.marketingPostId ?? `worker-reel:${reel.id}`,
      experimentId: reel.experimentId ?? null,
      inputHash: hashCanonicalJson({
        id: reel.id,
        projectSlug: reel.projectSlug,
        title: reel.title,
        hook: reel.hook,
        body: reel.body,
        cta: reel.cta,
        variantCount: VARIANT_COUNT,
      }),
      channelIntent: supportedChannel,
      provenance: [
        { kind: 'reel-worker-record', id: reel.id, revision: String(reel.version ?? 1) },
      ],
    },
    render: {
      provider: 'render-pro',
      externalTaskId: `render-pro-${reel.id}`,
      status: 'completed',
    },
    variantArtifacts: renderedVariants.map(({ variantSpec, finalPath }) => ({
      id: `${reel.id}-${variantSpec.id}`,
      locations: [finalPath],
      channelIntent: supportedChannel,
    })),
  });

  const summary = renderedVariants.map(({ variantSpec, assetUrl, totalDuration }) => ({
    variantId: `${reel.id}-${variantSpec.id}`,
    label: variantSpec.label,
    assetUrl,
    duration: Number(totalDuration.toFixed(2)),
  }));
  console.log(`  ✓ ${reelId}: ${renderedVariants.length} variant(s)`);
  return {
    reelId,
    ok: true,
    variants: summary,
    scenes: baseScenes.length,
    voiceProvider: useEdgeTts ? VOICE : 'macos-say',
    artifactManifest: manifest,
    artifactManifestPath: manifestPath,
  };
}

async function patchReelRecordMultiVariant(
  reel,
  rendered,
  dir,
  useEdge,
  usedCapture,
  usedGrokMotion = false
) {
  const variants = rendered.map(({ variantSpec, scenes, assetUrl, totalDuration }) => {
    const scores = scoreVariantHonest({
      usedRealCapture: usedCapture,
      voiceProvider: useEdge ? VOICE : 'macos-say',
      syncedCaptions: useEdge,
      sceneCount: scenes.length,
      totalDuration,
    });
    return {
      variantId: `${reel.id}-${variantSpec.id}`,
      template: 'explainer_6_beat',
      templateLabel: `Pain → Why → Product → How → Outcome → CTA (${variantSpec.label})`,
      proofType: usedGrokMotion ? 'recording' : usedCapture ? 'screenshot' : 'generated_card',
      hook: scenes[0].voice,
      cta: scenes[scenes.length - 1].voice,
      captionText: scenes.flatMap((scene) => (scene.cues || []).map((cue) => cue.text)).join(' / '),
      assetUrl,
      thumbnailUrl: null,
      durationSeconds: Math.round(totalDuration),
      qualityScore: scores.overall,
      qualityScores: scores.dimensions,
      qualityReasons: scores.reasons,
      renderLog: [
        'template=explainer_6_beat',
        `variant=${variantSpec.id}`,
        `proof=${usedCapture ? 'scroll-tour' : 'card'}`,
        `grokMotion=${usedGrokMotion}`,
        `voice=${useEdge ? VOICE : 'macos-say'}`,
        `syncedCaptions=${useEdge}`,
        `scenes=${scenes.length}`,
        `durationSec=${totalDuration.toFixed(2)}`,
        `assetUrl=${assetUrl}`,
      ],
      status: 'needs_review',
      provider: 'ffmpeg-pro',
      externalTaskId: `pro_${variantSpec.id}_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
  });

  const updatedReel = {
    ...reel,
    status: 'needs_review',
    renderJobId: `render-pro-${Date.now()}`,
    renderedAt: new Date().toISOString(),
    assetUrl: variants[0]?.assetUrl ?? null,
    variants,
    updatedAt: new Date().toISOString(),
  };
  const recordPath = path.join(dir, 'record.json');
  await writeFile(recordPath, JSON.stringify(updatedReel, null, 2));
  await run('npx', [
    'wrangler',
    'r2',
    'object',
    'put',
    `${BUCKET}/reel-requests/${reel.id}.json`,
    '--file',
    recordPath,
    '--remote',
    '--content-type',
    'application/json; charset=utf-8',
  ]);
}

async function renderScene(scene, index, dir, sceneCount) {
  const tag = String(index + 1).padStart(2, '0');
  const bgPath = path.join(dir, `bg-${tag}.png`);
  const audioPath = path.join(dir, `voice-${tag}.mp3`);
  const srtPath = path.join(dir, `voice-${tag}.srt`);
  const segPath = path.join(dir, `seg-${tag}.mp4`);

  // 1. Background — screenshot or card
  if (scene.kind === 'screenshot' && scene.backgroundPath) {
    await copyFile(scene.backgroundPath, bgPath);
  } else {
    const htmlPath = path.join(dir, `card-${tag}.html`);
    const html =
      scene.kind === 'hook_punch'
        ? hookPunchHtml(scene)
        : scene.kind === 'brand_close'
          ? brandCloseHtml(scene)
          : cardHtml(scene, index, sceneCount);
    await writeFile(htmlPath, html);
    // brand_close loads a CDN QR library + renders to canvas → needs more time.
    const cardBudget = scene.kind === 'brand_close' ? 5000 : 1500;
    await chromeScreenshot({
      url: `file://${htmlPath}`,
      outPath: bgPath,
      width: 1080,
      height: 1920,
      virtualTimeBudget: cardBudget,
      minBytes: 4 * 1024,
    });
  }

  // 2. Voice + SRT — voice rotates per scene kind
  const sceneVoice = VOICE_BY_KIND[scene.kind] ?? VOICE;
  const voiced = await generateVoiceover(
    scene.voice,
    audioPath,
    srtPath,
    scene.palette,
    sceneVoice
  );
  // Hook punch + brand close scenes already burn the headline into the bg —
  // skip the caption overlay so we don't triple the same text on screen.
  const captionsDisabled = scene.kind === 'hook_punch' || scene.kind === 'brand_close';
  const cues = captionsDisabled ? [] : splitLongCues(voiced.cues, 7);
  const voiceDuration = voiced.duration;
  scene.voiceProvider = sceneVoice;

  // 3. Caption overlays per cue — karaoke "build-up" style. Each cue is
  // broken into per-word states; PNG i shows the first (i+1) words of the
  // cue. Overlays stack at the same Y so the later states visually replace
  // the earlier ones, creating a left-to-right reveal in sync with the
  // voice.
  const overlays = [];
  for (let cueIndex = 0; cueIndex < cues.length; cueIndex += 1) {
    const cue = cues[cueIndex];
    const words = cue.text.split(/\s+/).filter(Boolean);
    const states = Math.max(1, words.length);
    const perWordMs = (cue.endMs - cue.startMs) / states;
    for (let wordIndex = 0; wordIndex < states; wordIndex += 1) {
      const visible = words.slice(0, wordIndex + 1).join(' ');
      const captionPath = path.join(dir, `cap-${tag}-${cueIndex + 1}-${wordIndex + 1}.png`);
      const htmlPath = captionPath.replace(/\.png$/, '.html');
      await writeFile(htmlPath, captionHtml(visible, scene.palette));
      await chromeScreenshot({
        url: `file://${htmlPath}`,
        outPath: captionPath,
        width: 1080,
        height: CAPTION_CANVAS_HEIGHT,
        virtualTimeBudget: 600,
        transparent: true,
        minBytes: 1024,
      });
      const stateStart = cue.startMs + wordIndex * perWordMs;
      const stateEnd =
        wordIndex === states - 1 ? cue.endMs : cue.startMs + (wordIndex + 1) * perWordMs;
      overlays.push({
        path: captionPath,
        startSec: stateStart / 1000,
        endSec: stateEnd / 1000,
        // Only the FIRST state of each cue gets the slide-up animation; the
        // word-add states swap in-place at the same Y.
        slideIn: wordIndex === 0,
      });
    }
  }

  // 4. Segment duration — voice length + 0.5s tail for breathing room.
  // Hook punch holds the headline a beat longer than the voice; brand close
  // gives the URL time to land before the outro fade.
  const minDuration = scene.kind === 'hook_punch' ? 1.4 : scene.kind === 'brand_close' ? 2.2 : 4.0;
  const segDuration = Math.max(minDuration, voiceDuration + 0.55);

  // Stash cues + paths on the scene BEFORE composeSegment so the avatar
  // overlay block (which reads scene.cues to time the mouth animation) sees
  // them.
  scene.cues = cues;
  scene.bgPath = bgPath;
  scene.audioPath = audioPath;

  await composeSegment({
    bgPath,
    audioPath,
    overlays,
    segPath,
    duration: segDuration,
    scene,
    index,
    sceneCount,
  });

  scene.segPath = segPath;
  scene.actualDuration = segDuration;
}

async function generateVoiceover(text, audioPath, srtPath, palette, voice) {
  const selectedVoice = voice ?? VOICE;
  if (useEdgeTts) {
    try {
      await run(
        'uvx',
        [
          'edge-tts',
          '--voice',
          selectedVoice,
          '--rate',
          '+4%',
          '--text',
          text,
          '--write-media',
          audioPath,
          '--write-subtitles',
          srtPath,
        ],
        undefined,
        60_000
      );
      const srtRaw = await readFile(srtPath, 'utf8').catch(() => '');
      const cues = parseSrt(srtRaw);
      const duration = await probeDuration(audioPath);
      if (cues.length && duration > 0) return { cues, duration };
    } catch (error) {
      console.warn(`  edge-tts failed (${error.message?.slice(0, 80)}); falling back to say`);
    }
  }
  return generateVoiceoverSay(text, audioPath, srtPath);
}

async function generateVoiceoverSay(text, audioPath, srtPath) {
  const aiff = audioPath.replace(/\.mp3$/, '.aiff');
  try {
    await run('say', ['-v', 'Samantha', '-r', '178', '-o', aiff, text], undefined, 30_000);
    await run('ffmpeg', ['-y', '-i', aiff, '-codec:a', 'libmp3lame', '-q:a', '4', audioPath]);
  } catch {
    await run('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=44100:cl=stereo',
      '-t',
      '3.0',
      '-codec:a',
      'libmp3lame',
      '-q:a',
      '4',
      audioPath,
    ]);
  }
  const duration = await probeDuration(audioPath);
  // No SRT — fake a single cue spanning the duration so caption shows for the whole voice
  const cues = [{ text, startMs: 100, endMs: Math.max(1000, duration * 1000 - 100) }];
  await writeFile(srtPath, srtSerialize(cues));
  return { cues, duration };
}

function parseSrt(srtRaw) {
  const blocks = srtRaw.split(/\r?\n\r?\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) continue;
    const timing = lines.find((line) => line.includes('-->'));
    if (!timing) continue;
    const textLines = lines.slice(lines.indexOf(timing) + 1);
    const match = timing.match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!match) continue;
    const startMs =
      (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000 +
      Number(match[4]);
    const endMs =
      (Number(match[5]) * 3600 + Number(match[6]) * 60 + Number(match[7])) * 1000 +
      Number(match[8]);
    const text = textLines.join(' ').replace(/\s+/g, ' ').trim();
    if (text) cues.push({ text, startMs, endMs });
  }
  return cues;
}

function srtSerialize(cues) {
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${cue.text}\n`
    )
    .join('\n');
}

function formatSrtTime(ms) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const milli = ms % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(milli, 3)}`;
}

function pad(value, width) {
  return String(value).padStart(width, '0');
}

async function captureProductScreenshot(url, outPath) {
  const budgets = [8000, 14000];
  let lastError;
  for (const budget of budgets) {
    try {
      await chromeScreenshot({
        url,
        outPath,
        width: 1080,
        height: 1920,
        virtualTimeBudget: budget,
        minBytes: 16 * 1024,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function captureProductTour(url, dir) {
  // CDP scroll tour: 3 stops (top, middle, bottom) of the live product page.
  // Returns a map { top, middle, bottom } → png paths. Each ~1080×1920.
  const paths = {
    top: path.join(dir, 'product-top.png'),
    middle: path.join(dir, 'product-mid.png'),
    bottom: path.join(dir, 'product-bot.png'),
  };
  const ordered = [paths.top, paths.middle, paths.bottom];
  await captureScrollTour(url, ordered, { width: 1080, height: 1920, settleMs: 700 });
  // Sanity: each capture should be reasonably sized.
  for (const p of ordered) {
    const info = await stat(p);
    if (info.size < 8 * 1024)
      throw new Error(`scroll-tour capture too small: ${path.basename(p)} = ${info.size} bytes`);
  }
  return paths;
}

async function chromeScreenshot({
  url,
  outPath,
  width,
  height,
  virtualTimeBudget = 1500,
  transparent = false,
  minBytes = 1024,
}) {
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-sandbox',
    `--virtual-time-budget=${virtualTimeBudget}`,
    `--window-size=${width},${height}`,
  ];
  if (transparent) args.push('--default-background-color=00000000');
  args.push(`--screenshot=${outPath}`, url);
  let chromeError;
  try {
    await run(CHROME, args, undefined, 120_000);
  } catch (error) {
    chromeError = error;
  }
  try {
    await access(outPath);
  } catch {
    throw new Error(
      `chrome did not produce ${path.basename(outPath)} (${chromeError ? chromeError.message.slice(0, 200) : 'no file'})`
    );
  }
  const info = await stat(outPath);
  if (info.size < minBytes) {
    throw new Error(`chrome screenshot ${path.basename(outPath)} too small (${info.size} bytes)`);
  }
}

function cardHtml(scene, index, sceneCount) {
  const palette = scene.palette;
  const label = escapeHtml(scene.label);
  const caption = escapeHtml(scene.caption);
  const project = escapeHtml(scene.project ?? '');
  const dots = Array.from(
    { length: sceneCount },
    (_, idx) => `<span class="dot${idx === index ? ' on' : ''}"></span>`
  ).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><style>
  html, body { margin: 0; padding: 0; width: 1080px; height: 1920px; overflow: hidden; }
  /* Grid: head pinned top, body fills middle (centered vertically), footer
     pinned bottom. The prior flex-space-between left a huge black gap below
     the caption. */
  body {
    background:
      radial-gradient(760px 540px at 50% 18%, ${palette.accent}38, transparent 64%),
      linear-gradient(180deg, ${palette.bg}, #000 92%);
    color: ${palette.text};
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    display: grid;
    grid-template-rows: auto 1fr auto;
    padding: 120px 72px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
  }
  .project-chip {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid ${palette.accent}55;
    color: ${palette.accent};
    font-size: 24px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: lowercase;
    white-space: nowrap;
  }
  .project-chip::before {
    content: '';
    width: 12px; height: 12px;
    border-radius: 999px;
    background: ${palette.accent};
    box-shadow: 0 0 18px ${palette.accent};
  }
  .body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    gap: 36px;
  }
  .label {
    color: ${palette.accent};
    font-size: 28px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 800;
    padding: 10px 22px;
    border: 2px solid ${palette.accent}88;
    border-radius: 999px;
    white-space: nowrap;
  }
  /* Loosen letter-spacing (was -0.035em which collapsed the space character
     between sentences, e.g. "Saved. Forgotten." → "Saved.Forgotten."). Add
     word-spacing as belt-and-suspenders. */
  .caption {
    font-size: 108px;
    font-weight: 800;
    line-height: 1.06;
    letter-spacing: -0.015em;
    word-spacing: 0.06em;
    text-wrap: balance;
    max-width: 936px;
  }
  .footer {
    display: flex;
    justify-content: center;
    align-items: end;
    gap: 14px;
  }
  .dot { width: 12px; height: 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.16); }
  .dot.on { background: ${palette.accent}; box-shadow: 0 0 16px ${palette.accent}; }
</style></head><body>
  <div class="head">
    <div class="project-chip">${project}</div>
  </div>
  <div class="body">
    <div class="label">${label}</div>
    <div class="caption">${caption}</div>
  </div>
  <div class="footer">${dots}</div>
</body></html>`;
}

function hookPunchHtml(scene) {
  const palette = scene.palette;
  const wordRaw = String(scene.caption ?? '');
  const word = escapeHtml(wordRaw);
  const sub = escapeHtml(scene.sub ?? '');
  // Pick a font size that fits the word inside 960px of safe width. Inter Black
  // condensed averages ~0.5–0.55 em wide per glyph; we conservatively cap so
  // longer words like "FORGOTTEN." don't bleed off the canvas.
  const charCount = Math.max(1, wordRaw.length);
  const fontSize = Math.min(320, Math.floor(1000 / (charCount * 0.55)));
  return `<!doctype html>
<html><head><style>
  html, body { margin: 0; padding: 0; width: 1080px; height: 1920px; overflow: hidden; }
  /* Flat black backdrop — the prior radial-gradient halo read as a "weird
     blob" behind the word. The text shadow already provides accent glow. */
  body {
    background: #000000;
    color: ${palette.text};
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .word {
    font-size: ${fontSize}px;
    font-weight: 900;
    letter-spacing: -0.05em;
    line-height: 0.96;
    color: #ffffff;
    text-shadow:
      -6px 0 0 ${palette.accent}, 6px 0 0 ${palette.accent},
      0 -6px 0 ${palette.accent}, 0 6px 0 ${palette.accent},
      0 0 40px ${palette.accent}66;
    padding: 0 60px;
    max-width: 1000px;
  }
  .sub {
    margin-top: 64px;
    font-size: 52px;
    font-weight: 700;
    color: ${palette.accent};
    letter-spacing: -0.01em;
    text-transform: lowercase;
    max-width: 900px;
  }
</style></head><body>
  <div class="word">${word}</div>
  ${sub ? `<div class="sub">${sub}</div>` : ''}
</body></html>`;
}

function brandCloseHtml(scene) {
  const palette = scene.palette;
  const primary = escapeHtml(scene.caption);
  const sub = escapeHtml(scene.sub ?? '');
  const qrSrc = scene.qrPath ? `file://${scene.qrPath}` : '';
  return `<!doctype html>
<html><head><style>
  html, body { margin: 0; padding: 0; width: 1080px; height: 1920px; overflow: hidden; }
  body {
    background:
      radial-gradient(780px 540px at 50% 30%, ${palette.accent}55, transparent 64%),
      linear-gradient(180deg, ${palette.bg}, #000 92%);
    color: ${palette.text};
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 100px 84px;
  }
  .qr {
    box-sizing: border-box;
    width: 520px;
    height: 520px;
    background: #ffffff;
    padding: 30px;
    border-radius: 36px;
    border: 4px solid ${palette.accent};
    box-shadow: 0 30px 80px ${palette.accent}55;
    margin: 0 auto 70px;
  }
  .qr img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
  }
  .scan {
    color: ${palette.accent};
    font-size: 32px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-bottom: 20px;
  }
  .primary {
    font-size: 124px;
    font-weight: 900;
    letter-spacing: -0.045em;
    line-height: 1;
    color: ${palette.text};
  }
  .sub {
    margin-top: 36px;
    font-size: 42px;
    font-weight: 600;
    color: ${palette.accent};
    line-height: 1.18;
    max-width: 880px;
  }
</style></head><body>
  ${qrSrc ? `<div class="qr"><img src="${qrSrc}" /></div><div class="scan">Scan to open</div>` : ''}
  <div class="primary">${primary}</div>
  ${sub ? `<div class="sub">${sub}</div>` : ''}
</body></html>`;
}

function captionHtml(phrase, palette) {
  // TikTok-style burned-in caption. Canvas is 520px tall to fit up to 4 lines
  // at 72px without clipping; long cues are also split into shorter chunks
  // by splitLongCues before reaching this function.
  return `<!doctype html>
<html><head><style>
  html, body { margin: 0; padding: 0; width: 1080px; height: ${CAPTION_CANVAS_HEIGHT}px; background: transparent; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif;
    padding: 36px 60px;
  }
  .caption {
    max-width: 960px;
    color: #ffffff;
    font-size: 72px;
    font-weight: 900;
    letter-spacing: -0.022em;
    line-height: 1.08;
    text-align: center;
    text-wrap: balance;
    /* Layered text shadow gives a thick black stroke + accent halo + soft
       drop shadow that reads from any background. */
    text-shadow:
      -4px 0 0 #000, 4px 0 0 #000, 0 -4px 0 #000, 0 4px 0 #000,
      -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000,
      -7px 0 0 ${palette.accent}cc, 7px 0 0 ${palette.accent}cc,
      0 -7px 0 ${palette.accent}cc, 0 7px 0 ${palette.accent}cc,
      0 0 30px rgba(0, 0, 0, 0.85);
  }
</style></head><body><div class="caption">${escapeHtml(phrase)}</div></body></html>`;
}

function splitLongCues(cues, maxWords = 7) {
  // Edge TTS hands back one cue per sentence. Long sentences overflow the
  // caption canvas, so we re-segment any cue with >maxWords words into N
  // equal-time sub-cues. Original timing is preserved end-to-end.
  const out = [];
  for (const cue of cues) {
    const words = cue.text.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) {
      out.push(cue);
      continue;
    }
    const chunkCount = Math.ceil(words.length / maxWords);
    const wordsPerChunk = Math.ceil(words.length / chunkCount);
    const chunkDuration = (cue.endMs - cue.startMs) / chunkCount;
    for (let i = 0; i < chunkCount; i += 1) {
      const slice = words.slice(i * wordsPerChunk, (i + 1) * wordsPerChunk).join(' ');
      if (!slice) continue;
      out.push({
        text: slice,
        startMs: Math.round(cue.startMs + i * chunkDuration),
        endMs: Math.round(cue.startMs + (i + 1) * chunkDuration),
      });
    }
  }
  return out;
}

async function renderScreencastFrame(palette, backdropPath, maskPath, shadowPath) {
  // Backdrop: full 1080×1920 with accent radial-gradient on the project's bg.
  const backdropHtml = path.join(path.dirname(backdropPath), 'sc-backdrop.html');
  await writeFile(backdropHtml, screencastBackdropHtml(palette));
  await chromeScreenshot({
    url: `file://${backdropHtml}`,
    outPath: backdropPath,
    width: 1080,
    height: 1920,
    virtualTimeBudget: 1500,
    minBytes: 4 * 1024,
  });

  // Mask: white rounded-rect on solid BLACK bg. ffmpeg alphamerge treats the
  // second input's luma as the alpha channel — black = transparent, white =
  // opaque. Saves us from format-negotiation issues with alphaextract.
  const maskHtml = path.join(path.dirname(maskPath), 'sc-mask.html');
  await writeFile(maskHtml, screencastMaskHtml());
  await chromeScreenshot({
    url: `file://${maskHtml}`,
    outPath: maskPath,
    width: SC_FRAME.w,
    height: SC_FRAME.h,
    virtualTimeBudget: 800,
    transparent: false,
    minBytes: 1024,
  });

  // Shadow: black rounded-rect blurred, sized slightly larger than the
  // device. Overlaid BEFORE the screencast at a small offset so it reads as
  // a drop shadow under the "device."
  const shadowHtml = path.join(path.dirname(shadowPath), 'sc-shadow.html');
  await writeFile(shadowHtml, screencastShadowHtml());
  await chromeScreenshot({
    url: `file://${shadowHtml}`,
    outPath: shadowPath,
    width: SC_FRAME.w + SC_FRAME.shadowPad * 2,
    height: SC_FRAME.h + SC_FRAME.shadowPad * 2,
    virtualTimeBudget: 800,
    transparent: true,
    minBytes: 1024,
  });
}

function screencastBackdropHtml(palette) {
  return `<!doctype html>
<html><head><style>
  html, body { margin: 0; padding: 0; width: 1080px; height: 1920px; overflow: hidden; }
  body {
    background:
      radial-gradient(900px 700px at 50% 28%, ${palette.accent}55, transparent 60%),
      radial-gradient(800px 600px at 50% 80%, ${palette.accent}22, transparent 60%),
      linear-gradient(180deg, ${palette.bg}, #000 96%);
  }
</style></head><body></body></html>`;
}

function screencastMaskHtml() {
  // White rounded-rect on solid BLACK bg. ffmpeg alphamerge uses luma → alpha.
  return `<!doctype html>
<html><head><style>
  html, body { margin: 0; padding: 0; width: ${SC_FRAME.w}px; height: ${SC_FRAME.h}px; background: #000000; }
  .mask {
    width: 100%;
    height: 100%;
    background: #ffffff;
    border-radius: ${SC_FRAME.radius}px;
  }
</style></head><body><div class="mask"></div></body></html>`;
}

function screencastShadowHtml() {
  // Soft black blurred rounded-rect. The CSS box-shadow on a transparent body
  // doesn't capture cleanly via headless Chrome, so we draw the shadow as a
  // semi-transparent rounded box with a generous filter:blur.
  const padding = SC_FRAME.shadowPad;
  return `<!doctype html>
<html><head><style>
  html, body { margin: 0; padding: 0; width: ${SC_FRAME.w + padding * 2}px; height: ${SC_FRAME.h + padding * 2}px; background: transparent; }
  .shadow {
    position: absolute;
    left: ${padding}px;
    top: ${padding + 18}px;
    width: ${SC_FRAME.w}px;
    height: ${SC_FRAME.h}px;
    background: rgba(0, 0, 0, 0.55);
    border-radius: ${SC_FRAME.radius + 4}px;
    filter: blur(30px);
  }
</style></head><body><div class="shadow"></div></body></html>`;
}

async function renderTalkingAvatar(palette, closedPath, openPath) {
  // Stylized SVG avatar — circle face, eyes, mouth in two states (closed, open).
  // Rendered via Chrome to PNG with transparent background. Mouth alternates
  // during voice cues to fake speech without paid lip-sync.
  const tmpClosed = closedPath.replace(/\.png$/, '.html');
  const tmpOpen = openPath.replace(/\.png$/, '.html');
  await writeFile(tmpClosed, avatarHtml(palette, 'closed'));
  await writeFile(tmpOpen, avatarHtml(palette, 'open'));
  await chromeScreenshot({
    url: `file://${tmpClosed}`,
    outPath: closedPath,
    width: 360,
    height: 360,
    virtualTimeBudget: 800,
    transparent: true,
    minBytes: 1024,
  });
  await chromeScreenshot({
    url: `file://${tmpOpen}`,
    outPath: openPath,
    width: 360,
    height: 360,
    virtualTimeBudget: 800,
    transparent: true,
    minBytes: 1024,
  });
}

function avatarHtml(palette, mouthState) {
  const open = mouthState === 'open';
  return `<!doctype html>
<html><head><style>
  html, body { margin: 0; padding: 0; width: 360px; height: 360px; background: transparent; }
  body { display: flex; align-items: center; justify-content: center; }
  .avatar {
    width: 300px; height: 300px;
    border-radius: 50%;
    background: radial-gradient(120px 80px at 50% 38%, ${palette.accent}55, transparent 70%), ${palette.bg};
    border: 6px solid ${palette.accent};
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
    position: relative;
    overflow: hidden;
  }
  .eyes {
    position: absolute;
    top: 38%;
    left: 0; right: 0;
    display: flex;
    justify-content: center;
    gap: 52px;
  }
  .eye {
    width: 22px;
    height: 32px;
    background: #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 6px ${palette.accent}99;
  }
  .mouth {
    position: absolute;
    left: 50%;
    bottom: 22%;
    transform: translateX(-50%);
    background: ${palette.accent};
    box-shadow: 0 0 12px ${palette.accent}aa;
  }
  .mouth.closed {
    width: 70px;
    height: 8px;
    border-radius: 6px;
  }
  .mouth.open {
    width: 70px;
    height: 52px;
    border-radius: 36px 36px 50% 50%;
    background: linear-gradient(180deg, ${palette.accent} 0%, #000 90%);
  }
  .cheek {
    position: absolute;
    width: 26px; height: 18px;
    border-radius: 50%;
    background: ${palette.accent}33;
    top: 55%;
  }
  .cheek.l { left: 14%; }
  .cheek.r { right: 14%; }
</style></head><body>
  <div class="avatar">
    <div class="eyes"><div class="eye"></div><div class="eye"></div></div>
    <div class="cheek l"></div>
    <div class="cheek r"></div>
    <div class="mouth ${open ? 'open' : 'closed'}"></div>
  </div>
</body></html>`;
}

async function fetchQrPng(target, outPath) {
  // Free QR API — encodes the given URL as a PNG. Reliable, no auth required.
  // Drop margin/qzone params (they produce asymmetric padding inside the
  // 480×480 PNG, which made the rendered QR look right-shifted).
  const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&format=png&data=${encodeURIComponent(target)}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`QR API returned ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 256) throw new Error(`QR PNG suspiciously small: ${buf.length} bytes`);
  await writeFile(outPath, buf);
}

async function synthTransitionSfx(outPath) {
  // Bandpass-filtered brown noise burst with quick attack/decay — reads as a
  // soft swoosh. ~0.35s long, mono, low volume so it punctuates without
  // overpowering the voice/music.
  await run(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'anoisesrc=duration=0.35:color=brown:sample_rate=44100',
      '-filter_complex',
      'bandpass=f=600:width_type=h:w=900,volume=0.55,afade=t=in:st=0:d=0.04,afade=t=out:st=0.22:d=0.13,aformat=channel_layouts=mono:sample_rates=44100',
      '-codec:a',
      'libmp3lame',
      '-q:a',
      '4',
      outPath,
    ],
    undefined,
    15_000
  );
}

async function synthAmbientBed(outPath, projectSlug) {
  const tones = AMBIENT_CHORDS[projectSlug] ?? AMBIENT_CHORDS.default;
  const duration = 60;
  // Build N sine inputs and an amix + lowpass + reverb-ish echo + tremolo +
  // volume chain. Output a stereo MP3 ready for downstream mixing.
  const args = ['-y'];
  for (const freq of tones) {
    args.push('-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=44100:duration=${duration}`);
  }
  const weights = ['0.5', '1.0', '0.7', '0.85', '0.4'].slice(0, tones.length).join(' ');
  const filter = [
    `amix=inputs=${tones.length}:weights=${weights}`,
    'lowpass=f=1400',
    'aecho=0.55:0.6:240|480:0.45|0.25',
    'tremolo=f=0.25:d=0.18',
    'volume=0.22',
    'aformat=channel_layouts=stereo:sample_rates=44100',
  ].join(',');
  args.push('-filter_complex', filter, '-codec:a', 'libmp3lame', '-q:a', '5', outPath);
  await run('ffmpeg', args, undefined, 30_000);
}

async function composeSegment({
  bgPath,
  audioPath,
  overlays,
  segPath,
  duration,
  scene,
  index,
  sceneCount,
}) {
  // Force 30 fps on the looped PNG inputs so zoompan's per-input-frame multiplier
  // doesn't blow up segment duration. (Default loop is 25 fps, and zoompan with
  // d>1 multiplies per input frame → 15+ minute segments.)
  const usingVideoBg = Boolean(scene.videoBgPath);
  const usingScFrame = Boolean(
    usingVideoBg && scene.screencastBackdrop && scene.screencastMask && scene.screencastShadow
  );
  const args = usingVideoBg
    ? ['-y', '-stream_loop', '-1', '-t', String(duration), '-i', scene.videoBgPath]
    : ['-y', '-loop', '1', '-framerate', '30', '-t', String(duration), '-i', bgPath];
  // ScreenStudio-style frame inputs: backdrop, alpha mask, drop shadow.
  // Indexed BEFORE captions so the caption inputs still come immediately
  // after the bg in either branch.
  let scBackdropIndex = null;
  let scMaskIndex = null;
  let scShadowIndex = null;
  if (usingScFrame) {
    scBackdropIndex = 1;
    scMaskIndex = 2;
    scShadowIndex = 3;
    args.push(
      '-loop',
      '1',
      '-framerate',
      '30',
      '-t',
      String(duration),
      '-i',
      scene.screencastBackdrop
    );
    args.push('-loop', '1', '-framerate', '30', '-t', String(duration), '-i', scene.screencastMask);
    args.push(
      '-loop',
      '1',
      '-framerate',
      '30',
      '-t',
      String(duration),
      '-i',
      scene.screencastShadow
    );
  }
  const captionInputStart = usingScFrame ? 4 : 1;
  for (const overlay of overlays) {
    args.push('-loop', '1', '-framerate', '30', '-t', String(duration), '-i', overlay.path);
  }
  args.push('-i', audioPath);
  const audioInputIndex = captionInputStart + overlays.length;

  const ambientInputIndex = scene.ambientPath ? audioInputIndex + 1 : null;
  if (scene.ambientPath) {
    // Loop the ambient bed; ffmpeg's stream_loop=-1 makes it tile until -t.
    args.push('-stream_loop', '-1', '-t', String(duration), '-i', scene.ambientPath);
  }

  // Avatar overlays: two PNG inputs, alternated to fake mouth movement during
  // voice cues. Both are loop+t inputs so we can enable/disable per frame.
  const hasAvatar = Boolean(scene.avatarClosed && scene.avatarOpen);
  let avatarClosedIndex = null;
  let avatarOpenIndex = null;
  if (hasAvatar) {
    avatarClosedIndex = (ambientInputIndex ?? audioInputIndex) + 1;
    avatarOpenIndex = avatarClosedIndex + 1;
    args.push('-loop', '1', '-framerate', '30', '-t', String(duration), '-i', scene.avatarClosed);
    args.push('-loop', '1', '-framerate', '30', '-t', String(duration), '-i', scene.avatarOpen);
  }

  const filters = [];
  if (usingScFrame) {
    // Composite: backdrop bg → drop shadow → rounded-masked screencast.
    // Screencast is scaled to SC_FRAME.w × SC_FRAME.h, alpha-merged with the
    // rounded-rect mask, then overlaid onto the gradient backdrop at the
    // centered offset.
    filters.push(
      `[0:v]scale=${SC_FRAME.w}:${SC_FRAME.h}:force_original_aspect_ratio=increase,crop=${SC_FRAME.w}:${SC_FRAME.h},fps=30,setsar=1,trim=duration=${duration},format=yuva420p[scvid]`
    );
    filters.push(`[${scMaskIndex}:v]scale=${SC_FRAME.w}:${SC_FRAME.h},format=gray[scmask]`);
    filters.push(`[scvid][scmask]alphamerge[scrounded]`);
    filters.push(`[${scBackdropIndex}:v]scale=1080:1920,setsar=1[scbg]`);
    filters.push(`[${scShadowIndex}:v]format=rgba[scshadow]`);
    // Shadow is positioned so the device sits on top, with the shadow offset
    // 18px down (matches the offset baked into the shadow HTML).
    const shadowX = SC_FRAME.x - SC_FRAME.shadowPad;
    const shadowY = SC_FRAME.y - SC_FRAME.shadowPad;
    filters.push(`[scbg][scshadow]overlay=${shadowX}:${shadowY}[scbgshadow]`);
    filters.push(`[scbgshadow][scrounded]overlay=${SC_FRAME.x}:${SC_FRAME.y}[bg]`);
  } else if (usingVideoBg) {
    // Real screencast already plays back motion — just normalize aspect/fps.
    filters.push(
      `[0:v]scale=1080:1920:force_original_aspect_ratio=disable,fps=30,setsar=1,trim=duration=${duration}[bg]`
    );
  } else if (scene.kind === 'screenshot') {
    const totalFrames = Math.max(60, Math.round(duration * 30));
    const focus = scene.zoomFocus || 'top';
    // Step zoom across the *total* frame count rather than per input frame
    // (zoompan d=1 means one output per input, which matches our 30 fps input).
    const zoomStep = (0.16 / totalFrames).toFixed(6);
    let xExpr;
    let yExpr;
    if (focus === 'top') {
      xExpr = `(iw-iw/zoom)/2`;
      yExpr = `0`;
    } else if (focus === 'bottom') {
      xExpr = `(iw-iw/zoom)/2`;
      yExpr = `(ih-ih/zoom)`;
    } else {
      xExpr = `(iw-iw/zoom)/2`;
      yExpr = `(ih-ih/zoom)/2`;
    }
    filters.push(
      `[0:v]scale=1620:2880,zoompan=z='min(zoom+${zoomStep},1.16)':x='${xExpr}':y='${yExpr}':d=1:s=1080x1920:fps=30,setsar=1[bg]`
    );
  } else {
    filters.push(`[0:v]scale=1080:1920,setsar=1,fps=30[bg]`);
  }

  let lastLabel = 'bg';
  for (let overlayIndex = 0; overlayIndex < overlays.length; overlayIndex += 1) {
    const overlay = overlays[overlayIndex];
    const start = Math.max(0, overlay.startSec - 0.05);
    const end = Math.min(duration, overlay.endSec + 0.05);
    const inIndex = captionInputStart + overlayIndex;
    // Karaoke word-add states swap in-place and only need a quick alpha fade.
    // The first state of each cue still slides up from below.
    const isSlide = overlay.slideIn !== false;
    const fadeIn = isSlide ? 0.18 : 0.06;
    const fadeOut = 0.14;
    const restY = 'H-h-260';
    let yExpr;
    if (isSlide) {
      const slideDuration = 0.22;
      const slideEnd = start + slideDuration;
      yExpr = `if(lt(t,${slideEnd.toFixed(2)}),H-h-260+150*((${slideEnd.toFixed(2)}-t)/${slideDuration.toFixed(2)}),${restY})`;
    } else {
      yExpr = restY;
    }
    filters.push(
      `[${inIndex}:v]format=rgba,fade=t=in:st=${start.toFixed(2)}:d=${fadeIn}:alpha=1,fade=t=out:st=${Math.max(start, end - fadeOut).toFixed(2)}:d=${fadeOut}:alpha=1[cap${overlayIndex}]`
    );
    const nextLabel = overlayIndex === overlays.length - 1 ? 'vfinal' : `v${overlayIndex}`;
    filters.push(
      `[${lastLabel}][cap${overlayIndex}]overlay=x=(W-w)/2:y='${yExpr}':enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'[${nextLabel}]`
    );
    lastLabel = nextLabel;
  }
  if (overlays.length === 0) {
    filters.push(`[bg]null[vfinal]`);
    lastLabel = 'vfinal';
  }

  // Avatar overlay: small talking head bottom-right. Disabled by default; set
  // REEL_AVATAR=1 to opt in. Two layers — closed mouth always visible, open
  // mouth toggles during cue durations at ~7 Hz to fake speech motion.
  if (hasAvatar && scene.cues && scene.cues.length > 0) {
    const cueRanges = scene.cues.map((cue) => ({
      start: Math.max(0, cue.startMs / 1000),
      end: Math.min(duration, cue.endMs / 1000),
    }));
    const inCueExpr = cueRanges
      .map(({ start, end }) => `between(t,${start.toFixed(2)},${end.toFixed(2)})`)
      .join('+');
    // Mouth open visible only when in a cue AND on the "open" half of the
    // 7 Hz alternation.
    const openExpr = `((${inCueExpr})*mod(floor(t*7),2))`;
    filters.push(
      `[${avatarClosedIndex}:v]scale=220:220,format=rgba,fade=t=in:st=0:d=0.4:alpha=1[avC]`
    );
    filters.push(
      `[${avatarOpenIndex}:v]scale=220:220,format=rgba,fade=t=in:st=0:d=0.4:alpha=1[avO]`
    );
    filters.push(`[${lastLabel}][avC]overlay=W-w-40:H-h-40[vAvC]`);
    filters.push(`[vAvC][avO]overlay=W-w-40:H-h-40:enable='${openExpr}'[vAvOut]`);
    lastLabel = 'vAvOut';
  }

  const fades = [];
  if (index === 0) fades.push(`fade=t=in:st=0:d=0.35`);
  if (index === sceneCount - 1) fades.push(`fade=t=out:st=${(duration - 0.45).toFixed(2)}:d=0.45`);
  if (fades.length) {
    filters.push(`[${lastLabel}]${fades.join(',')}[vout]`);
    lastLabel = 'vout';
  }

  if (ambientInputIndex !== null) {
    // Voice goes to two paths: (1) the final mix, (2) the sidechain that ducks
    // ambient. Ambient is lowered then ducked when voice is present, then
    // mixed back in at lower weight.
    filters.push(
      `[${audioInputIndex}:a]apad=whole_dur=${duration},atrim=0:${duration},afade=t=in:st=0:d=0.12,afade=t=out:st=${(duration - 0.22).toFixed(2)}:d=0.22,asplit=2[voice_mix][voice_sc]`
    );
    filters.push(
      `[${ambientInputIndex}:a]volume=0.55,atrim=0:${duration},afade=t=in:st=0:d=0.6,afade=t=out:st=${(duration - 0.6).toFixed(2)}:d=0.6[amb]`
    );
    filters.push(
      `[amb][voice_sc]sidechaincompress=threshold=0.06:ratio=8:attack=80:release=380:level_sc=0.8[amb_ducked]`
    );
    filters.push(
      `[voice_mix][amb_ducked]amix=inputs=2:weights=1.4 0.6:duration=first:dropout_transition=0[aout]`
    );
  } else {
    filters.push(
      `[${audioInputIndex}:a]apad=whole_dur=${duration},atrim=0:${duration},afade=t=in:st=0:d=0.12,afade=t=out:st=${(duration - 0.22).toFixed(2)}:d=0.22[aout]`
    );
  }

  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    `[${lastLabel}]`,
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-tune',
    'stillimage',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '30',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '44100',
    '-movflags',
    '+faststart',
    segPath
  );
  if (process.env.REEL_RENDER_DEBUG === '1') {
    console.log(
      `[debug] map=[${lastLabel}], hasAvatar=${hasAvatar}, cues=${scene.cues?.length ?? 0}, avatarClosedIndex=${avatarClosedIndex}, avatarOpenIndex=${avatarOpenIndex}`
    );
    console.log(`[debug] filters:\n${filters.join('\n')}`);
  }
  await run('ffmpeg', args, undefined, 180_000);
}

async function applyTransitionSfx(stitchedPath, sfxPath, scenes, finalPath) {
  // Mix the swoosh at each scene transition boundary into the stitched audio.
  // Transition T happens at offset = (sum of scene durations up to T) - TRANSITION,
  // which is where the xfade between scene T-1 and scene T starts.
  const args = ['-y', '-i', stitchedPath];
  const transitions = [];
  let cumulative = scenes[0].actualDuration;
  for (let index = 1; index < scenes.length; index += 1) {
    transitions.push(Math.max(0, cumulative - TRANSITION / 2));
    cumulative += scenes[index].actualDuration - TRANSITION;
  }
  if (transitions.length === 0) {
    await copyFile(stitchedPath, finalPath);
    return;
  }
  for (const _ of transitions) args.push('-i', sfxPath);

  const filters = [];
  const sfxLabels = ['[0:a]'];
  for (let index = 0; index < transitions.length; index += 1) {
    const delayMs = Math.round(transitions[index] * 1000);
    const inputIndex = index + 1;
    filters.push(`[${inputIndex}:a]adelay=${delayMs}|${delayMs}[sfx${index}]`);
    sfxLabels.push(`[sfx${index}]`);
  }
  filters.push(
    `${sfxLabels.join('')}amix=inputs=${sfxLabels.length}:weights=1.0 ${'0.55 '.repeat(transitions.length).trim()}:duration=first:dropout_transition=0[aout]`
  );

  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    '0:v',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '44100',
    '-movflags',
    '+faststart',
    finalPath
  );
  await run('ffmpeg', args, undefined, 120_000);
}

async function stitchScenes(scenes, dir, finalPath) {
  const inputs = [];
  for (const scene of scenes) inputs.push('-i', scene.segPath);

  const sceneCount = scenes.length;
  if (sceneCount === 1) {
    await copyFile(scenes[0].segPath, finalPath);
    return;
  }

  const filters = [];
  let prevVideo = '0:v';
  let prevAudio = '0:a';
  let cumulative = scenes[0].actualDuration;
  for (let index = 1; index < sceneCount; index += 1) {
    const offset = (cumulative - TRANSITION).toFixed(3);
    const nextVideo = index === sceneCount - 1 ? 'vout' : `v${index}`;
    const nextAudio = index === sceneCount - 1 ? 'aout' : `a${index}`;
    filters.push(
      `[${prevVideo}][${index}:v]xfade=transition=fade:duration=${TRANSITION}:offset=${offset}[${nextVideo}]`
    );
    filters.push(
      `[${prevAudio}][${index}:a]acrossfade=d=${TRANSITION}:c1=tri:c2=tri[${nextAudio}]`
    );
    prevVideo = nextVideo;
    prevAudio = nextAudio;
    cumulative += scenes[index].actualDuration - TRANSITION;
  }

  await run(
    'ffmpeg',
    [
      '-y',
      ...inputs,
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[vout]',
      '-map',
      '[aout]',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '30',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-ar',
      '44100',
      '-movflags',
      '+faststart',
      finalPath,
    ],
    dir,
    360_000
  );
}

async function patchReelRecord(reel, scenes, assetUrl, dir, totalDuration) {
  const usedRealCapture = scenes.some(
    (scene) => scene.kind === 'screenshot' && scene.backgroundPath
  );
  const sceneCount = scenes.length;
  const captionText = scenes
    .flatMap((scene) => (scene.cues || []).map((cue) => cue.text))
    .join(' / ');

  // Honest scoring. Even with all upgrades, this is still a slide deck with
  // voice, not a posting-ready UGC reel. Cap accordingly until we have music,
  // demo flow, and dynamic UI motion.
  const scores = scoreVariantHonest({
    usedRealCapture,
    voiceProvider: useEdgeTts ? 'edge-tts' : 'macos-say',
    syncedCaptions: useEdgeTts,
    sceneCount,
    totalDuration,
  });

  const variant = {
    variantId: `${reel.id}-v1`,
    template: 'explainer_6_beat',
    templateLabel: 'Pain → Why → Product → How → Outcome → CTA',
    proofType: usedRealCapture ? 'screenshot' : 'generated_card',
    hook: scenes[0].voice,
    cta: scenes[scenes.length - 1].voice,
    captionText,
    assetUrl,
    thumbnailUrl: null,
    durationSeconds: Math.round(totalDuration),
    qualityScore: scores.overall,
    qualityScores: scores.dimensions,
    qualityReasons: scores.reasons,
    renderLog: [
      'template=explainer_6_beat',
      `proof=${usedRealCapture ? 'screenshot' : 'card'}`,
      `voice=${useEdgeTts ? VOICE : 'macos-say'}`,
      `syncedCaptions=${useEdgeTts}`,
      `scenes=${sceneCount}`,
      `durationSec=${totalDuration.toFixed(2)}`,
      `assetUrl=${assetUrl}`,
    ],
    status:
      scores.overall >= 0.7
        ? 'video_ready'
        : scores.overall >= 0.45
          ? 'needs_review'
          : 'video_rejected',
    provider: 'ffmpeg-pro',
    externalTaskId: `pro_${Date.now()}`,
    createdAt: new Date().toISOString(),
  };

  const updatedReel = {
    ...reel,
    status: variant.status === 'video_rejected' ? 'video_rejected' : variant.status,
    renderJobId: `render-pro-${Date.now()}`,
    renderedAt: new Date().toISOString(),
    assetUrl,
    variants: [variant],
    updatedAt: new Date().toISOString(),
  };
  const recordPath = path.join(dir, 'record.json');
  await writeFile(recordPath, JSON.stringify(updatedReel, null, 2));
  await run('npx', [
    'wrangler',
    'r2',
    'object',
    'put',
    `${BUCKET}/reel-requests/${reel.id}.json`,
    '--file',
    recordPath,
    '--remote',
    '--content-type',
    'application/json; charset=utf-8',
  ]);
}

function scoreVariantHonest({
  usedRealCapture,
  voiceProvider,
  syncedCaptions,
  sceneCount,
  totalDuration,
}) {
  // Honest dimension-by-dimension self-score. No artificial cap — the human
  // is the final judge during review and can override per-variant.
  const missing = [];

  // Value clarity — a 6-beat explainer gives a real arc. Cap below max
  // because the hook still depends on caption + voice, not visible product
  // value in the first frame.
  const valueClarity = sceneCount >= 5 ? 0.7 : 0.45;
  if (sceneCount < 5) missing.push('script has fewer than 5 beats');

  // Product proof — a real GitHub repo page IS product proof, just not the
  // running product. Without capture we're back to generic cards.
  const productProofStrength = usedRealCapture ? 0.7 : 0.2;
  if (!usedRealCapture) missing.push('no real product capture (used generated cards)');
  if (usedRealCapture) missing.push('proof is a static GitHub repo page, not the running product');

  // Visual trust — real screenshot with Ken Burns motion vs. abstract cards.
  const visualTrust = usedRealCapture ? 0.7 : 0.35;

  // Caption readability — burned-in, safe-area, SRT-synced when Edge TTS is on.
  const captionReadability = syncedCaptions ? 0.82 : 0.55;
  if (!syncedCaptions) missing.push('captions are estimated, not synced to voice timing');

  // Mobile composition — 9:16, duration in the 18–45s explainer band.
  const mobileComposition = totalDuration >= 18 && totalDuration <= 45 ? 0.8 : 0.5;
  if (totalDuration < 18)
    missing.push(
      `duration ${totalDuration.toFixed(1)}s is too short to actually explain a product`
    );
  if (totalDuration > 45)
    missing.push(`duration ${totalDuration.toFixed(1)}s exceeds default short-form ceiling`);

  // Cringe / spam risk — explainer voice, no rocket-emoji hype.
  const cringeRisk = 0.78;

  // Posting readiness — honest gap list. This is where the deck-vs-UGC
  // ceiling lives.
  const postingReadiness = usedRealCapture && syncedCaptions && sceneCount >= 5 ? 0.55 : 0.3;
  missing.push('no background music bed');
  missing.push(
    'no live UI motion or screen recording — proof scene is a static page with Ken Burns'
  );
  missing.push('no human voice / on-camera presence (the next ceiling lift)');
  missing.push('no b-roll cuts or in-product animation');

  const dimensions = {
    valueClarity: round(valueClarity),
    productProofStrength: round(productProofStrength),
    visualTrust: round(visualTrust),
    captionReadability: round(captionReadability),
    mobileComposition: round(mobileComposition),
    cringeRisk: round(cringeRisk),
    postingReadiness: round(postingReadiness),
  };
  const overall = round(
    Object.values(dimensions).reduce((sum, value) => sum + value, 0) /
      Object.keys(dimensions).length
  );

  const reasons = [`${sceneCount}-beat explainer script (${totalDuration.toFixed(1)}s)`];
  if (usedRealCapture) reasons.push('Real GitHub product capture with multi-region Ken Burns');
  if (syncedCaptions) reasons.push(`Captions SRT-synced to ${voiceProvider} voice timing`);
  reasons.push(`Voice: ${voiceProvider}`);
  for (const item of missing) reasons.push(`Missing: ${item}`);

  return { overall, dimensions, reasons };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function isUsableProductUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    const placeholder = /(^|\.)example(\.|$)|localhost|127\.0\.0\.1/;
    return !placeholder.test(parsed.hostname);
  } catch {
    return false;
  }
}

async function edgeTtsAvailable() {
  try {
    await run('uvx', ['--help'], undefined, 8_000);
    return true;
  } catch {
    return false;
  }
}

async function fetchReel(id) {
  for (const status of [
    'generated',
    'approved',
    'video_ready',
    'needs_review',
    'ready_to_post',
    'video_rejected',
  ]) {
    const res = await fetch(`${BASE}/reels?status=${status}`, {
      headers: WORKER_HEADERS,
    });
    if (!res.ok) continue;
    const payload = await res.json();
    const match = (payload.data || []).find((entry) => entry.id === id);
    if (match) return match;
  }
  return null;
}

async function probeDuration(filePath) {
  try {
    const { stdout } = await run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      filePath,
    ]);
    const seconds = Number(stdout.trim());
    return Number.isFinite(seconds) ? seconds : 0;
  } catch {
    return 0;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
}

async function run(command, args, cwd, timeoutMs) {
  return execFileAsync(command, args, {
    cwd,
    timeout: timeoutMs ?? 60_000,
    maxBuffer: 1024 * 1024 * 80,
  });
}
