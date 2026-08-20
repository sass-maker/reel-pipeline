# Render Engines

Canonical reference for every render engine integrated into Reel Pipeline.
Engine facts live here; the adapter code lives under `src/adapters/` and
`reel/src/engine/`; the operator-facing mode matrix lives in
[`render-modes.md`](./render-modes.md) and `config/render-modes.json`.

## Strategy

- Default to repository-owned local render paths first, then explicit
  specialized handoffs when quality requires them.
- Keep render engines behind adapters under `src/adapters/`. Do not edit
  third-party engine checkouts into this service.
- Every engine integration must have a smoke test that proves
  request → status → artifact metadata.
- `OpenShorts`: rejected UGC actor workflow; adapter and submodule removed (see
  [`decisions/0002-openshorts-removed-parked.md`](./decisions/0002-openshorts-removed-parked.md)).
- Checkout-backed MoneyPrinterTurbo and reel-maker integrations were removed on
  2026-08-01. Neither was initialized on the working host, while repository-owned
  render paths already covered the supported local workflow.

## Grok / Imagine local MP4s

- Source: local MP4 exports generated outside this repo (e.g. Grok Imagine
  science clips). No Grok credentials or API calls live in this repo.
- Role: curated premium/source footage when a finished clip already exists;
  clips can be inserted into normal generated reels or published as a standalone
  `grok-video` render.
- Configure: set `GROK_VIDEO_ASSET_DIR` to a folder containing `.mp4` exports.
- Current status: `grok-video` render mode implemented in Node and Rust;
  `render-pro.js` can also insert one matching Grok clip as a motion scene when
  `GROK_VIDEO_ASSET_DIR` is set.

## ASCII animation inserts

- Source: local generated ASCII/pixel animation inspired by
  `adithyaakrishna/ascii-fable`.
- Role: stylized subsection/interlude footage for explaining abstract ideas
  between higher-fidelity Grok/Imagine or product-proof scenes. Deterministic
  generated motion; no API credentials or external model calls required.
- Configure: render mode `ascii`, `ascii-animation`, `ascii-fable`, or `askai`.
  High-quality path renders HTML terminal art through headless Chrome, then
  assembles MP4s with `ffmpeg`; set `REEL_ASCII_RENDERER=raster` for the faster
  no-Chrome fallback, or `FFMPEG_PATH` if needed.
- Current status: Node adapter implemented; Rust orchestrator shells out to the
  same Node renderer for parity.

## Blender literal scene plates

- Source: a compatible local Blender 5.2 installation.
- Role: deterministic silent visual plates for literal lyric-video scenes.
  Blender does not own lyric text, attribution, captions, or audio.
- Safety: the adapter runs one repository-owned builder against bounded,
  validated JSON with factory startup and automatic script execution disabled.
  Arbitrary Python, add-ons, uploaded `.blend` files, and escaping output paths
  are rejected.
- Configure: render mode `blender`; install with
  `brew install --cask blender`.
- Current status: Node adapter, real local capability probe, literal scene
  builder, standard render receipt, and Blender-backed lyric canary implemented.
  See [`lyric-video-and-blender.md`](./lyric-video-and-blender.md).

## Editframe-inspired HTML composition

- Upstream: `https://editframe.com/`.
- Role: agent-friendly preview format for videos as deterministic HTML/CSS
  scenes with a timeline and word-level caption cues. Not a posting-ready MP4.
- Why not depend on it: keep Reel Pipeline local-first and avoid adding another
  production video runtime before the preview contract proves useful. See
  [`decisions/0004-postiz-editframe-patterns-not-code.md`](./decisions/0004-postiz-editframe-patterns-not-code.md).
- Configure: render mode `html`, `html-composition`, or `web-composition`.
  Output is `composition.html`, `timeline.json`, and `captions.json`.
- Current status: Node adapter implemented; Rust orchestrator shells out to the
  same Node exporter for parity.

## Kokoro local voice

- Source: Kokoro-82M running locally via `kokoro-onnx`
  (`npm run setup:kokoro`, `tools/kokoro/`, gitignored, ~340MB model).
- Role: fully local narration for the faceless workflow and lesson videos; no
  network at synth time. Removes the ElevenLabs live-prerequisite for lessons
  when installed (`LESSON_TTS_PROVIDER=kokoro`).
- Current status: shipped; live proof 40.6s 1080×1920 h264 render end-to-end.

## MLX-Video / LTX local generation

- Upstream: `https://github.com/Blaizzy/mlx-video`.
- Role: Apple Silicon image-to-video generation for short controlled motion
  clips. Generated clips remain assets inside approved, deterministic film
  manifests rather than replacing the compositor.
- Current status: the CodeVetter reference film records an LTX-2.3 Q4
  two-stage generation with model revision, prompt, seed, dimensions, frame
  count, runtime, and hash. Publication rights remain an explicit asset-level
  gate.

## OpenShorts (removed)

- Upstream: `https://github.com/mutonby/openshorts` (MIT).
- Role: UGC actor and publishing workflow reference.
- Why not default: it assumes more paid/hosted services such as Gemini,
  fal.ai, ElevenLabs, Upload-Post, and optional S3.
- Current status: adapter and local submodule removed; the upstream link is
  retained only as historical context. See
  [`knowledge/failed-approaches/openshorts-adapter.md`](../knowledge/failed-approaches/openshorts-adapter.md)
  and [`decisions/0002-openshorts-removed-parked.md`](./decisions/0002-openshorts-removed-parked.md).

## render-pro.js (canonical production renderer)

- Not exposed through the Rust engine factory; it is its own production renderer
  driven by the watcher. `render-pro.js` (~1680 LOC) is self-contained: Chrome
  CDP scroll-tour + live screencast of the product URL, Edge TTS voiceover
  (`uvx`) → SRT-synced burned-in captions, ffmpeg scene cards / Ken Burns /
  xfade stitch / ambient bed / SFX, `npx wrangler r2 object put` upload, and
  Worker reel-record patch. The Rust CLI drives it via
  `RenderProEngine` → `node scripts/render-pro.js <reelId>`.

## Cloudflare artifact hosting

- Worker: `reel-pipeline-artifacts` (`src/worker/index.js`).
- R2 bucket: `reel-artifacts`.
- Live artifact base URL:
  `https://reel-pipeline-artifacts.sarthakagrawal927.workers.dev`.
- Routes: `GET /health`, `GET /reels/:key` (byte-range enabled so MP4 playback
  works in browsers).
- The Rust `artifact.rs` mirrors the Worker's `isSafeKey`/`contentTypeFor`/range
  logic; if the Worker is ever rewritten, keep that logic in sync via a spec.

## Credits & inspiration (patterns, not code)

Design ideas borrowed from other open-source projects — concepts adapted, code
not copied:

- **OpenMontage** (`https://github.com/calesthio/OpenMontage`, AGPLv3) —
  agent-first video production system whose runtime we deliberately did not
  adopt. We reused two quality gates: slideshow-risk scoring
  (`src/reel-quality.js`) and post-render self-review with `ffprobe`
  (`src/reel-self-review.js`).
- **Postiz** (`https://github.com/gitroomhq/postiz-app`, AGPLv3) — social
  publishing workflow reference. We reimplemented selected patterns (provider
  capabilities/preflight, classified posting failures, per-post isolation,
  missed-post recovery, metrics backfill, release IDs) without copying source
  or adopting its NestJS/Prisma/Temporal runtime. See
  [`decisions/0004-postiz-editframe-patterns-not-code.md`](./decisions/0004-postiz-editframe-patterns-not-code.md).
- **Editframe** — see HTML composition above; pattern source only.
- **OpenVid** (`https://github.com/CristianOlivera1/openvid`) — clean-room
  inspiration for focus/zoom framing, layered screen stages, and
  time-addressable composition. Its PolyForm Noncommercial license and
  editor-sized Next/Canvas runtime make it unsuitable as a Fleet production
  dependency, so no source or package was copied.
- **SuperCMO Skills** (`https://github.com/SupercmoHQ/superCMO-skills`,
  Apache-2.0) — cloud-first creative generation skill pack whose runtime we
  did not adopt (local-first stance unchanged; see
  [`decisions/0002-openshorts-removed-parked.md`](./decisions/0002-openshorts-removed-parked.md)).
  We extracted the engine-agnostic generation craft — anchor-reference
  consistency across clips, script-to-duration budgeting, read-supplied-media
  first, intent-based routing with a fallback ladder, and pending-job
  discipline — into [`generation-craft.md`](./generation-craft.md). No code,
  MCP server, installer, telemetry, or credential surface was copied.
