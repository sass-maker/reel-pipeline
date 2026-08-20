# Source-backed Content Package Pipeline

Each product remains the source of truth for its own facts. Read-only
extractors produce versioned proposed packages with evidence and approval
state.

```text
source project → proposed package → content approval → render
  → artifact manifest → media receipt → Postiz draft → human schedule
```

## Commands

```bash
npm run content -- extract --source all --fleet-root ../ --out tmp/content-packages
npm run render:package -- --file <approved-package.json> --out artifacts/brand-video
npm run check:social
npm run distribution -- \
  --file <approved-package.json> \
  --receipt <media-receipt.json> \
  --provider postiz
```

The final command creates a draft only. The integration mapping is explicit per
project/channel and a missing mapping fails closed.

## Invariants

- Extraction produces proposed content, never approval.
- Content approval authorizes media generation only.
- The artifact manifest hashes the actual output.
- The media receipt binds the approved source revision to the artifact.
- Postiz owns destination review, schedule, publication, and provider metrics.
- This repository contains no direct social-provider fallback.
