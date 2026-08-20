# ADR 0001: Rust orchestrator cutover

- **Status:** Accepted for Worker render/watch; social orchestration superseded by Postiz
- **Date:** 2026-07 (cutover completed; JS glue retired)
- **Context:** [`../rust-orchestrator.md`](../rust-orchestrator.md) ·
  historical plan: [`../../archive/2026-07-rust-rewrite-plan.md`](../../archive/2026-07-rust-rewrite-plan.md)

## Context

The Node implementation was the original orchestration glue for watcher,
render, and social workflows. It worked, but the logic
was spread across ad-hoc scripts with no trait boundaries, making the
"heavy lifting stays out of the orchestrator" rule hard to enforce and test.

## Decision

Add a single Rust crate (`reel/`) that owns pure render/watch orchestration and
engine/publisher trait boundaries, with one shell-out impl each.
The crate was built additively alongside the Node implementation until parity
was reached; the cutover is now complete and the superseded Node glue scripts
(`auto-render-watcher.js` and social queue glue) are deleted. Heavy work
(Chrome, ffmpeg, TTS, R2 upload) stays behind `RenderEngine`,
`ArtifactPublisher`, `CommandRunner`, and `ReelStore` traits, so orchestration is unit-tested without
Chrome/ffmpeg/network by asserting the exact `node`/`wrangler` argv that
*would* run.

## Consequences

- Render, watch, plan, brief validation, score, and project configuration live
  on the Rust CLI. Social review/scheduling/publishing moved to Postiz.
- `render-pro.js` and the `src/server` dev harness
  stay in Node — they are the shell-out targets or one-shot browser flows.
- The Cloudflare Worker (`src/worker/index.js`) stays in JS on purpose: it is
  the one piece that genuinely belongs on the edge runtime, and the Rust
  `artifact.rs` mirrors its key/content-type/range logic.
- Live render actions default to `--dry-run`; `--execute` is required.

## Open follow-ups

- Drop `engines/openshorts` git submodule (explicit approval; see ADR 0002).
- Drop `engines/reel-maker` if `render-pro` fully supersedes Remotion
  (unchanged).
- `FileJobStore` timestamps are sortable placeholders (`@<secs>`), not RFC3339;
  switch to `time`/`chrono` if JS and Rust stores must interoperate on the same
  dir.
- `render-pro.js` writes the reel-record patch itself; the Rust watcher only
  needs exit code + the worker as source of truth. A future `--json` output
  mode on render-pro would let Rust collect richer result data.
