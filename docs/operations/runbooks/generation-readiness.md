# Generation Readiness

The executable source of truth is `config/live-generation-readiness.json`.

## Local evidence

```bash
npm run smoke:generation-cases
npm run smoke:render-modes
npm run smoke:lesson-local
npm run smoke:postiz
npm run ready:local
```

The direct render-mode smoke verifies repository-owned VideoBrief adapters.
Optional local applications may be reported as skipped when unavailable.

Frontier image, video, and music model readiness is intentionally excluded.
Those lanes are parked under
[`ADR 0006`](../../architecture/decisions/0006-cost-capped-media-generation-boundary.md);
approved outputs enter through manual import.

## Live render proof

```bash
npm run render:pro -- <approved-reel-id>
npm run smoke:artifact
```

Verify that the Worker record, R2 object, manifest, and byte-range playback all
refer to the same output.

## Postiz proof

```bash
npm run check:social -- --strict
npm run distribution -- \
  --file <approved-package.json> \
  --receipt <media-receipt.json> \
  --provider postiz
```

Confirm the result is an unscheduled Postiz draft with the correct media,
copy, and destination integration.

## Final gate

```bash
npm run ready:proofs
npm run ready:target
```

Only `targetHostReady: true` means the prepared host has every required proof.
