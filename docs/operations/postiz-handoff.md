# Postiz Handoff

Postiz is the sole social review, scheduling, publishing, and provider-metrics
surface. Reel Pipeline remains responsible for source-backed packages, media
generation, artifact manifests, and media receipts.

## Required external configuration

- `POSTIZ_BASE_URL` — self-hosted Postiz URL.
- `POSTIZ_API_KEY` — stored outside git.
- `POSTIZ_INTEGRATIONS_CONFIG` — optional path to the environment-specific
  project/channel mapping. The default is `config/postiz-integrations.json`.

Start from `config/postiz-integrations.example.json`; do not commit real
integration IDs.

## Draft-only handoff

```bash
npm run check:social
npm run distribution -- \
  --file <approved-content-package.json> \
  --receipt <media-receipt.json> \
  --provider postiz
```

The adapter uploads media when needed and creates a Postiz draft. It never
sets a publication time. An operator must review and schedule the draft in
Postiz.

Channel mapping is explicit:

- `youtube_shorts` uses the mapped Postiz `youtube` integration and starts with
  private visibility plus an explicit not-made-for-kids declaration.
- `instagram_reels` uses the mapped Postiz `instagram` integration; Postiz
  treats the single uploaded video as a Reel.

## Cutover proof

1. Run `npm run smoke:postiz` locally.
2. Validate the target-host mapping with `npm run check:social`.
3. Submit one approved canary package.
4. Confirm the draft, media, copy, and destination integration in Postiz.
5. Schedule only after the human review passes.

Rollback is simple: stop submitting drafts. Existing render artifacts and
source receipts remain intact.

If a create call ends without a definitive response, use the client's bounded
date-window reconciliation against Postiz before resubmitting. The machine
runner quarantines these outcomes and never retries them blindly.
