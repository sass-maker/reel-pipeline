# Cartoon-hand pointer (`guided-app-demo@2`)

An opt-in guided-app-demo treatment that replaces the cursor with a
presenter-anchored cartoon arm whose fingertip stays on the exact interaction
hotspot. `guided-app-demo@1` is unchanged and still renders without any
treatment.

Specification of record: [issue #14](https://github.com/sass-maker/reel-pipeline/issues/14)
(migrated from the private Fleet Workspace issue #409, which holds the full
proposal, design, and requirement scenarios).

## Contracts

| Schema | Owner | Purpose |
| --- | --- | --- |
| `reel-pipeline.pointer-trace.v1` | `src/pointer-trace.js` | Immutable pointer sidecar: monotonic timebase, normalized coordinates, primary-button transitions, capture dimensions, acquisition method, calibration evidence. |
| `reel-pipeline.cartoon-hand-style.v1` | `assets/cartoon-hand/*.json` | Operator-selected hand style: palette, handedness, pose assets with checksums, license and provenance. |
| `reel-pipeline.cartoon-hand-pointer-plan.v1` | `src/cartoon-hand-pointer.js` | Deterministic per-frame geometry: state, fingertip, cover, hotspot ring, arm curve, legibility. |
| `reel-pipeline.cartoon-hand-pointer-review.v1` | `src/cartoon-hand-pointer.js` | Gate results from measurements taken on rendered frames. |
| `reel-pipeline.cartoon-hand-pointer-proof.v1` | `fixtures/guided-app-demo/cartoon-hand-pointer/evidence.json` | The demo's source, trace, style, plan, output hashes, and review record. |

A trace carries pointer facts only. Validation rejects keystrokes, entered
text, selectors, window titles, application content, and any unrecognized
field, and it rejects a non-monotonic timebase or an out-of-bounds sample that
claims to be in bounds.

## Pipeline

1. **Acquire.** `scripts/capture-cartoon-hand-pointer-source.js` pins a Chrome
   viewport to the encoded capture size, moves the pointer with CDP input
   events, and captures one frame per dispatched sample, so sample time equals
   frame time. Only `monitor` and `browser-viewport` surfaces have a proven
   coordinate mapping; `window` and `browser-tab` keep the standard cursor.
2. **Approve.** `PUT /forge/captures/:id/pointer-trace` validates the sidecar,
   binds it to the approved capture hash, and records eligibility. An
   ineligible trace is still stored with its failure so the job stays
   renderable with the standard cursor.
3. **Plan.** `planCartoonHandPointer` resolves states (point, tap, grab,
   release, idle, off-screen), anchors the arm to the presenter rectangle,
   orients the hand away from title and caption bands, and keeps the fingertip
   on the traced coordinate with an opaque cover and a high-contrast ring.
4. **Render.** The plan is rasterized to transparent plates
   (`src/cartoon-hand-overlay.js`) and composited by the guided encoder
   (`overlay=0:0`). Plans are authored in one reference composition
   (720x1280) and scaled by viewBox, so a preview and its final share one plan
   digest.
5. **Review.** Measurements are taken from rendered frames, not asserted from
   the plan. Gates: `pointer-trace-integrity`,
   `fingertip-hotspot-precision`, `captured-cursor-coverage`,
   `presenter-safe-area`, `mobile-legibility`, `hand-style-rights`,
   `preview-final-binding`, `reduced-motion`, `standard-cursor-fallback`.
6. **Publish.** Unchanged. An automated gate pass is not an approval; the
   existing channel policy and owner decision still gate publication.

## Standard-cursor fallback

The render keeps the ordinary cursor and records the reason instead of
labelling the output as the treatment. Reasons: `operator-disabled`,
`presenter-anchor-missing`, `unsupported-source-mapping`,
`trace-integrity-failure`, `trace-source-binding-mismatch`,
`trace-synchronization-failure`, `trace-dimension-mismatch`,
`cursor-coverage-unproven`, `no-legible-placement`,
`hand-style-rights-missing`, `film-skill-does-not-support-treatment`.

A captured system cursor is covered by verified opaque fingertip geometry or
not at all; no inpainting or pixel reconstruction touches product evidence.

## Reproducible demo

```bash
npm run demo:cartoon-hand:capture   # real Chrome capture + pointer trace
npm run demo:cartoon-hand           # overlay render + measurements + evidence
npm run demo:cartoon-hand:check     # verify committed hashes and plan digests
```

Committed under `fixtures/guided-app-demo/cartoon-hand-pointer/`: the approved
capture, its pointer trace, the capture record, three renders (cartoon hand,
reduced motion, standard cursor), and `evidence.json`. The demonstrated surface
is this repository's own anonymous brand-reel page rendered from
`src/anonymous-video/ui.js`, so the capture is real product UI with real
browser behaviour. The demo costs nothing: local Chrome, local `sips`, local
FFmpeg, no generation API.

## Known limits

- The demo capture reserves and anchors the presenter rectangle but recorded no
  camera frames, so no presenter image is claimed.
- Headless capture composites no system cursor, so
  `captured-cursor-coverage` is reported `not-applicable` rather than proven; a
  display-helper trace with `capturedCursor.present` exercises the covering
  rule and its fallback.
- The coordinator and worker paths for a queued `guided-app-demo@2` job are
  covered by tests but have not been exercised against a live Worker and R2.
- Window and browser-tab pointer mapping stays unsupported.
