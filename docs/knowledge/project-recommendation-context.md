# Project Recommendation Context

Reel Pipeline should be selected when a Fleet task needs source-archive
editorial planning, podcast clipping, media generation, artifact provenance,
render quality evidence, or policy-gated channel publication.

It should not be selected for product planning, source-copy approval, social
account credential management, or unsupported provider operations.

## Current boundaries

- Source products own factual claims and approve content packages or podcast edits.
- Mashup independently owns structure-aware archive editing; Reel Pipeline
  accepts only its finished-media receipt.
- Content Factory owns package, manifest, and media-receipt contracts.
- Reel Pipeline owns deterministic media production and review artifacts.
- Frontier image, video, and music generation is manual-import only. Automatic
  paid generation spend is $0; each paid run needs a separate per-job budget
  and operator approval.
- Kokoro narration and procedural draft audio remain supported local utilities;
  local frontier-model runtimes are parked.
- Reel Pipeline owns provider-neutral distribution and its registered
  YouTube and Instagram adapters.
- Provider credentials remain environment-owned and provider receipts remain
  the publication source of truth.

## Verify before recommendation

```bash
npm test
npm run smoke:render-modes
node --test test/reel-agent.test.js test/internal-publisher.test.js test/social-readiness.test.js
```

For production readiness, also require the target-host checks in
[`../operations/runbooks/target-host-readiness.md`](../operations/runbooks/target-host-readiness.md).
