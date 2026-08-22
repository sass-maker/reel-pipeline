# Representative Gallery Proofs

The Explore gallery makes a claim about what this repository can actually
render. This page owns the honesty rules behind that claim: what counts as a
proof, where coverage is recorded, and why each unproven capability is unproven.

Code: `src/studio/explore-gallery.js` (fail-closed validators),
`scripts/build-representative-gallery.js` (builder and `--check`).
Ledgers: `config/explore-gallery-representatives.json` (coverage and items),
`config/explore-gallery-quality-review.json` (scored frame review).

## One ledger

`config/explore-gallery-representatives.json` is the **only** representative
coverage ledger. A second derived manifest used to be written to
`fixtures/video-gallery/representatives/manifest.json`; nothing read it, and it
drifted to under-report the unproven set. The builder no longer writes it and
`--check` fails if it reappears.

## What a representative proof must satisfy

`validateRepresentativeExploreGallery` throws — it never downgrades — when any
of these fail:

- **Not a placeholder.** `sourcePosture` may not be `fixture`, `executionMode`
  must be `real`, and the renderer may not be `ffmpeg-svg-fixture@1`.
- **Real recipe and variant.** `recipeId` must be a known production recipe and
  the `variantId` must belong to that recipe.
- **Exactly one primary.** Each proven recipe has one `primary` proof; extras
  are `range`.
- **6–15 seconds**, vertical, with a poster inside the gallery root.
- **Hash-bound evidence.** The media `sha256` must match the file on disk and
  the evidence file's `sha256` and `renderer` must match the item.
- **Coverage arithmetic.** `exactOptionCount` must equal the variant count,
  `totalCapabilityCount` the recipe count, `provenCapabilityCount` the distinct
  proven recipes, `proofCount` the item count, and `unproven` must list exactly
  the recipes with no proof — no more, no fewer.
- **Scored review.** Every visible item needs an entry in the quality review
  ledger, and a `removed` decision may not stay visible.

## Quality tiers are earned, not asserted

The review rubric is composition, meaningful motion, temporal coherence,
legibility, and reusable proof value, scored 0–25 from one frame per second
across the full duration.

`qualityTier: 'showcase'` requires a numeric score of **at least 15**. A proof
that scores lower, or that was never scored, may still ship — but only at
`experiment` tier. The validator enforces this, so a weak proof cannot be
presented as showcase work.

Current experiment-tier proofs:

| Proof | Score | Why it is not showcase |
| --- | --- | --- |
| `representative-three-cel` | 13/25 | Coherent live WebGL motion, but the scene has no payoff. |
| `representative-local-voice-film` | 14/25 | Communicates the workflow; the motion-variant crops need a stronger source render. |
| `representative-podcast-short` | 16/25 | Clears the showcase floor; `scripts/build-representative-gallery.js` still marks it `experiment` explicitly. The tier rule only prevents over-claiming — it never forces an upgrade. |
| `representative-ascii-kinetic` | not scored | Entered as a replacement for three removed ASCII proofs and was never scored on the rubric. |

Raising `three-cel` or `local-voice-film` means producing a better render, not
re-labelling the existing one. Scoring `ascii-kinetic` is an owner review, not
an automated step.

## Absent receipts must say so

Some evidence cites a receipt from a workspace this repository no longer
contains. That is allowed and recorded, but never disguised. An evidence
`source.receipt` must be repository-relative and must not escape the repository
root, and when the path does not resolve on disk the evidence must carry a
non-empty `source.receiptLocation` explaining where it lived. Both the runtime
media validator and `gallery:representatives:check` enforce this.

`podcast-short` is the live example: its receipt points into a retired Fleet
workspace, so its evidence records
`"receiptLocation": "Retired Fleet workspace; the run directory is not present
in this repository."`. The builder likewise preserves a checked-in proof whose
retired source is unreachable instead of failing or silently rebuilding, and
`FLEET_ARCHIVE_ROOT` is the only way to point it at a restored archive.

## Unproven capabilities

9 of 13 production capabilities have a representative proof. The four that do
not, and the exact reason:

| Capability | Why it is unproven |
| --- | --- |
| `grok-asset-film` | Intentionally excluded. No operator-approved Grok MP4 with provenance exists, and none may be fabricated. |
| `guided-app-demo` | Duration-gated. A real hash-bound proof exists — `fixtures/guided-app-demo/cartoon-hand-pointer/evidence.json`, a local Chrome capture of this repository's own surface with zero paid calls — but it runs 5.5s against a 6s floor. Promoting it needs a longer scripted capture, not a new render family. |
| `product-proof` | Quality-gated. The available slideshow did not demonstrate a complete, legible product interaction; its predecessor scored 10/25 and was removed. |
| `night-out-carousel` | An exact option fixture exists, but no substantive owner-approved representative proof does. |

Coverage may only rise by producing a real render and recording its source,
rights, hash, renderer, and review — never by relaxing a rule above.

## Checks

```bash
npm run gallery:check
npm run gallery:representatives:check
npm run gallery:quality:frames   # regenerates contact sheets under artifacts/
node --test test/studio-explore-gallery.test.js
```

Rebuilding the proofs themselves (`npm run gallery:representatives:build`)
requires Blender 5.2, a live browser capture, and reachable retired-workspace
sources. On a host without them the builder preserves the checked-in proofs
rather than substituting anything.
