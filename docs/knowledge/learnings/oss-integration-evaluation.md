# OSS Integration Evaluation

Last updated: 2026-07-03

## Scope

Evaluate OSS integrations that improve the text/context-to-short-video workflow:
script structure, caption alignment, audio/media processing, render QA, asset
handoff, and deterministic local previews.

## Shortlist

| Candidate | Source | Fit | Cost | Decision |
| --- | --- | --- | --- | --- |
| WhisperX | https://github.com/m-bain/whisperX | Strong word-level timestamps and diarization for caption alignment QA. | Medium/high: Python/GPU path and model assets; keep behind optional adapter. | Best future caption-alignment adapter. |
| stable-ts | https://github.com/jianfch/stable-ts | Whisper-based transcription, forced alignment, and audio indexing. | Medium: Python dependency but simpler than broader video engines. | Good lightweight alternative to WhisperX. |
| whisper.cpp | https://github.com/ggml-org/whisper.cpp | Local CPU-friendly Whisper inference for cheap transcript/caption checks. | Medium: native binary/model management. | Watchlist for local-first caption QA. |
| OpenAI Whisper | https://github.com/openai/whisper | Reference transcription model and ecosystem anchor. | Medium/high: Python runtime and model downloads. | Reference only; prefer WhisperX/stable-ts for alignment. |
| FFmpeg.wasm | https://github.com/ffmpegwasm/ffmpeg.wasm | Browser/portable ffmpeg operations. | Medium: current pipeline already has Node/CLI render paths; WASM cost may be unnecessary. | Park unless browser-side preview editing becomes required. |
| fluent-ffmpeg | https://github.com/fluent-ffmpeg/node-fluent-ffmpeg | Node wrapper around ffmpeg for deterministic local media operations. | Low/medium, but project maintenance is slower and direct ffmpeg calls are already simple. | Avoid dependency; use direct ffmpeg commands when needed. |
| Subtitle Edit | https://github.com/SubtitleEdit/subtitleedit | Mature subtitle tooling and format reference. | High: desktop/.NET app, not a library fit. | Reference for subtitle formats only. |
| Remotion | https://github.com/remotion-dev/remotion | Mature programmatic video rendering. | Medium: the former checkout-backed adapter was removed. | Re-evaluate only for a repository-owned concrete workflow. |
| Aeneas | https://github.com/readbeyond/aeneas | Forced alignment. | High and AGPL license makes product integration risky. | Reject. |
| Postiz | https://github.com/gitroomhq/postiz-app | Strong social publishing workflow reference: provider capabilities, post preflight, token/error classification, missed-post recovery, analytics, calendar/list UX. | High as a dependency: AGPL-3.0, large NestJS/Prisma/Temporal monorepo, overlaps SaaS Maker control-plane ownership. | Reimplement selected workflow patterns only; do not copy source or adopt runtime. |
| Editframe | https://editframe.com/ | Strong agent/video-as-code reference: HTML/CSS composition, explicit time model, caption cues, local preview, and visual testing workflow. | Low if used as a pattern; unknown/unneeded as a runtime dependency for now. | Reimplement a local HTML composition artifact contract; do not add SDK/runtime dependency yet. |

The provider-neutral distribution seam also has a Postiz contract fixture at
`test/fixtures/postiz-contract.json` and an inert evaluator in
`src/postiz-fixture-adapter.js`. It proves translation, account isolation,
channel-specific settings, publication results, and metrics normalization
without importing Postiz code, making network calls, installing the stack, or
connecting an account. Fixture success is not live Postiz readiness.

## Decision

Do not add a new media or publishing dependency in this pass. For media QA, the
highest-ROI next slice remains a fixture-backed caption QA adapter that can
optionally run WhisperX or stable-ts against an already-rendered mock reel and
compare generated timestamps/captions to the draft bundle.

For social publishing, Postiz is useful as a pattern source, not as code. Its
AGPL license and broad app runtime make direct integration a poor fit. The
worthwhile parts are now reimplemented locally in the existing Node/Rust
posting contracts:

- provider capability declarations for manual, Upload-Post, YouTube, and Instagram;
- provider-specific preflight before posting;
- classified posting failures (`needs_reconnect`, `quota`, `rate_limited`,
  `provider_down`, `bad_caption`, `bad_asset`);
- per-post failure isolation so one broken post no longer aborts the scan;
- explicit missed-post recovery for overdue scheduled posts;
- provider-level analytics hooks for YouTube video statistics and Instagram
  media insights;
- a metrics backfill command that patches the latest post-level metrics into
  SaaS Maker notes;
- a SaaS Maker Cockpit posting-ops summary for missed posts, posting failures,
  synced metrics, and posts waiting for metrics backfill;
- deployment guidance for scheduling daily metrics sync on the posting host;
- structured posting failure notes patched back to SaaS Maker while preserving
  SaaS Maker as the source of truth.

For video authoring, Editframe is useful as a product-pattern source. The
worthwhile piece is not another hosted render dependency; it is a deterministic
intermediate representation that agents can inspect and revise before any
expensive render. Reel Pipeline now has `html` / `html-composition` /
`web-composition` modes that export:

- `composition.html` for local browser preview;
- `timeline.json` for explicit scene start/end/duration metadata;
- `captions.json` with cue-level and word-level timing;
- normal render-result metadata so Rust and Node entrypoints share the same
  request/status contract.

## Suggested Implementation Slice

### Caption QA

1. Keep the existing mock render fixture as the input.
2. Add an optional caption-alignment command adapter behind a capability check.
3. Emit JSON with word/segment timestamps, missing-caption warnings, and drift
   against expected script lines.
4. Attach that JSON to the draft/review bundle before any real render queue or
   autopost work.

### Posting Ops

1. Keep calendar/list UX in SaaS Maker, not this repo, unless the review UI
   becomes the canonical operator surface.

### HTML Composition Previews

1. Use the new preview artifacts for agent-authored storyboard review.
2. Only add MP4 capture from the HTML preview after one product flow proves the
   preview is useful enough to become a render source.

## Verification

Run:

```bash
npm test
```
