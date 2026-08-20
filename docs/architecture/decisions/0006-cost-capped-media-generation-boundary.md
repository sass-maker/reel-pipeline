# ADR 0006: Cost-capped media generation boundary

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

Publishing consistently is already the scarce step. Maintaining frontier image,
video, and music models locally added installation, storage, runtime, and visual
review work without producing dependable accepted outputs. Hosted generation is
more capable, but subscriptions and per-second pricing are not affordable enough
to make unattended generation a safe default.

## Decision

- Automatic paid generative-media spend is **$0**.
- Frontier image, video, and music generation is manual-import only. Every paid
  run needs a separate per-job budget and operator approval; a subscription or
  configured provider never implies permission to spend.
- Active local frontier-model setup and execution paths are parked. Proven code,
  receipts, and machine-local weights may remain for historical reproducibility;
  this decision does not authorize deleting local data.
- Reel Pipeline keeps the parts that lower publishing friction: planning,
  deterministic capture/composition with Chromium, FFmpeg, or Blender, Kokoro
  narration, procedural draft audio, captions, review, provenance, history, and
  evidence-gated distribution.
- No new local frontier model is added unless a new GitHub issue includes an
  accepted-output benchmark and shows a better cost/time result than manual
  import for a real publishing cadence.

## Consequences

Studio exposes the policy and fails closed when a parked image, video, or music
lane is selected. External tools remain operator choices, not dependencies or
automatic provider integrations. This deliberately optimizes for finishing and
posting media rather than owning every generation runtime.
