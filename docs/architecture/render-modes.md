# VideoBrief Contract & Render Modes

The `VideoBrief` is the normalization boundary between source-backed content
packages, High Signal briefs, Significant Content envelopes, anonymous brand
URLs, and render engines. Every render adapter accepts a `VideoBrief`.

- Contract code: `src/video-brief.js` (Node) and `reel/src/brief.rs` (Rust).
  Both accept camelCase and snake_case keys.
- Validation covers channels (`tiktok`, `instagram_reels`, `youtube_shorts`),
  proof types, render modes, duration bounds, and reel-body shape.
- `POST /reels` and `POST /reels/signal` are the intake endpoints; the latter
  consumes High Signal reel briefs.

## Render mode matrix

`config/render-modes.json` is the operator-facing source of truth for supported
modes, aliases, provider names, smoke coverage, and live-service requirements.
This table mirrors it; update the config first, then this table.

| Mode | Aliases | Category | Surface | Smoke |
| --- | --- | --- | --- | --- |
| `mock` | — | local | video-brief | fixture renders to provider `mock` |
| `html-composition` | `html`, `web-composition` | local | video-brief | fixture exports preview artifacts |
| `ascii` | `ascii-animation`, `ascii-fable`, `askai` | local | video-brief | fixture renders an ASCII animation MP4 |
| `grok-video` | `grok`, `grok-videos` | local-asset | video-brief | script creates a temp MP4 and runs local asset mode |
| `blender` | — | local-asset | video-brief | probes Blender 5.2 and renders validated literal-scene manifests |
| `render-pro` | `renderpro` | production | worker-reel-id | syntax check only; live proof mutates a real Worker reel + R2 object |
| `kokoro` | `kokoro-compose` | local | faceless-workflow | `npm run setup:kokoro` then readiness check |
| `brand-video` | — | local | content-package | `npm run render:package` against an approved content-package fixture |

Local/no-credential modes (`mock`, `html-composition`, `ascii`, `grok-video`,
`blender`) are proven by `npm run smoke:render-modes`. The live `render-pro`
path is tracked separately because it mutates real state. See
[`operations/runbooks/generation-readiness.md`](../operations/runbooks/generation-readiness.md).

The lyric-video workflow composes exact timed text and approved audio outside
the general VideoBrief engine factory while using the `blender` adapter for
optional literal plates. See
[`lyric-video-and-blender.md`](./lyric-video-and-blender.md).

## Live generation readiness

`config/live-generation-readiness.json` maps local smokes, live canaries,
artifact playback, lesson prerequisites, posting prerequisites, and manual
creator review into one current-evidence report at
`tmp/generation-readiness/report.json`. `config/generation-cases.json` defines
the top-level generation cases: `marketing-render-modes`, `worker-render-pro`,
`lesson-video`, and `creator-mvp`.

The report separates `strictReady` (required local/live proofs green) from
`targetHostReady` (no remaining manual/missing target-host items except
documented accepted exclusions). Only `targetHostReady: true` means the host is
fully accepted. See
[`operations/runbooks/generation-readiness.md`](../operations/runbooks/generation-readiness.md)
and
[`operations/runbooks/target-host-readiness.md`](../operations/runbooks/target-host-readiness.md).

## Approved-keyframe video forge

Local Video Forge is deliberately not another `VideoBrief` render mode. It
starts from a shot manifest and an explicitly approved keyframe, produces three
short LTX-2.3 motion variants on Apple Silicon, and records reproducibility
metadata. Its optional Worker/R2 queue accepts tasks from either the generation
Mac or another machine while the Mac remains the only current render worker.
See the
[`Local Video Forge runbook`](../operations/runbooks/local-video-forge.md).
