# ADR 0003: Local-first, no-credential render modes

- **Status:** Accepted
- **Date:** 2026-07

This decision now applies to deterministic rendering and cost-effective local
utilities, not frontier image, video, or music models. ADR 0006 parks those
models and sets automatic paid generation spend to $0.

## Context

The pipeline needs reviewable artifacts and tests that run without paid
services, API quota, or network egress. Relying solely on MoneyPrinterTurbo
(a running Python service) or `render-pro` (Chrome + ffmpeg + R2) would make
every smoke and draft cycle depend on live infrastructure.

## Decision

Ship a set of local, no-credential render modes that share the same
`VideoBrief` contract as the real renderers:

- `mock` — placeholder renderer for tests and dry runs.
- `html-composition` — deterministic HTML/CSS preview + `timeline.json` +
  word-level `captions.json` (Editframe-inspired pattern, no SDK dependency).
- `ascii` — generated ASCII/pixel interlude MP4s (local Chrome HTML terminal
  art with a raster fallback).
- `grok-video` — copies approved local Grok/Imagine MP4 exports; no Grok
  credentials in repo.
- `kokoro` — fully local faceless renderer: Kokoro-82M narration (local ONNX)
  + Pexels b-roll + FFmpeg compose.
- `brand-video` — source-backed brand motion graphics with local Kokoro,
  Chromium frames, and FFmpeg.

## Consequences

- `npm run smoke:render-modes` proves direct VideoBrief rendering for every
  local mode without external credentials.
- The live-only `render-pro` path is reported separately in the readiness
  matrix because it mutates real state.
- Draft and review cycles can run end-to-end on a laptop at $0; paid services
  are opt-in upgrades, not prerequisites.
- The mode matrix is the operator-facing source of truth
  (`config/render-modes.json`); see
  [`render-modes.md`](../render-modes.md).

## 2026-08-01 amendment

MoneyPrinterTurbo and reel-maker were removed with their uninitialized engine
submodules and checkout-backed adapters. The local-first decision remains; its
supported mode list is now entirely repository-owned.
