# Significant Content OpenClaw handoff

This runbook is the bounded, file-based bridge from an approved Significant
Hobbies content package into Reel Pipeline. It does not grant authority to
approve creative, create a Postiz draft, schedule, upload, post,
publish an article, edit claims, or use credentials.

## Contract

- Reel envelope schema: `significant-content-reels/v1`
- Receipt schema: `significant-content-receipt/v1`
- Variant idempotency key: `<packageId>:<packageRevision>:<variantId>`
- Receipt stages: `render`, `upload`, `metrics`
- `exportedAt` and every receipt `occurredAt` are caller-supplied ISO timestamps.
  Reuse the same timestamp and input file on retry; do not regenerate it.
- Reel Pipeline stores `contentSource` and `approvedVariant` as structured,
  non-updateable Idea Store fields. A package revision with unchanged variant
  content reuses the existing idea. Changed content creates a new attributable
  revision.

## Bounded local loop

Choose explicit scratch paths. Do not point these variables at tracked content
or a production Idea Store.

```bash
export REEL_ENVELOPE=/absolute/path/to/significant-content-reels.json
export REEL_IDEAS=/absolute/path/to/openclaw-reel-ideas.json
export REEL_RECEIPTS=/absolute/path/to/openclaw-receipts.json
```

Validate and import. A retry of the same import must return `imported: 0` and
must not add an idea.

```bash
npm run significant-content -- validate --input "$REEL_ENVELOPE"
npm run significant-content -- import --input "$REEL_ENVELOPE" --store "$REEL_IDEAS"
npm run significant-content -- import --input "$REEL_ENVELOPE" --store "$REEL_IDEAS"
npm run significant-content -- status --store "$REEL_IDEAS"
```

For offline evidence, run the fixture smoke. It validates the envelope,
imports it twice, preserves the approved script, builds attributed render and
metrics receipts, collapses duplicate receipt inputs, and writes a performance
report under a new `tmp/` directory. It never calls a publisher.

```bash
npm run smoke:significant-content
```

To render an imported idea, use the existing factory with the same Idea Store.
The imported path converts approved scenes directly and does not call an LLM.
Rendering is not approval and does not make the result post-ready.

```bash
STUDIO_IDEAS_FILE="$REEL_IDEAS" npm run factory -- produce --count 1 --engine mock
```

Replace `mock` only after a human chooses an existing renderer and its normal
local preflight succeeds. Review `script.json`, `brief.json`, `quality.json`,
and the render before any accepted-queue action.

## Receipt export

Create a JSON input file with exact source attribution and provider output. A
render example is:

```json
{
  "packageId": "hobby:urban-sketching-field-notes",
  "packageRevision": 3,
  "variantId": "permission-slip",
  "provider": "mock",
  "status": "completed",
  "externalId": "render-1",
  "externalUrl": "https://assets.example.test/render-1.mp4",
  "occurredAt": "2026-07-13T07:00:00.000Z"
}
```

Build the receipt without contacting the provider:

```bash
npm run significant-content -- receipt --stage render --input /absolute/path/to/render-fields.json --out /absolute/path/to/render-receipt.json
```

An upload receipt must use `stage: upload`, status `published` or `scheduled`,
and include the real provider `externalId`, `externalUrl`, and `occurredAt`.
Only create it after the existing posting flow returns that evidence. This
command does not upload anything:

```bash
npm run significant-content -- receipt --stage upload --input /absolute/path/to/upload-fields.json --out /absolute/path/to/upload-receipt.json
```

A metrics input uses `stage: metrics`, status `collected`, and `metrics` fields
from the provider: `views`, `watchTimeSeconds`,
`averageViewDurationSeconds`, `retentionRate`, `likes`, `comments`, `shares`,
`saves`, and optional `engagementRate`. Unknown values are `null`, never zero.

```bash
npm run significant-content -- receipt --stage metrics --input /absolute/path/to/metrics-fields.json --out /absolute/path/to/metrics-receipt.json
npm run significant-content -- report --receipts "$REEL_RECEIPTS" --out /absolute/path/to/performance-report.json
npm run significant-content -- follow-up --report /absolute/path/to/performance-report.json --package-id 'hobby:urban-sketching-field-notes' --revision 3 --store "$REEL_IDEAS" --out /absolute/path/to/follow-up-draft.json
```

The follow-up file is always `state: draft`, with draft approval and explicit
false mutation/publication capabilities. It is evidence for a later content
review, not permission to change a published claim or variant approval.

## Cross-repository application

Move receipt files to Significant Hobbies; Reel Pipeline never edits that
checkout. Use the versioned `content apply-receipt` command documented there.
Apply the identical receipt twice during offline verification. The second call
must be a no-op with byte-identical canonical content. Stop if attribution is
unknown or a provider external id conflicts; do not hand-edit either store.

After application, compare both machine-readable status commands. A rendered
variant without an upload receipt must report the missing upload and keep human
review plus the existing accepted-post/provider preflight as the next boundary.

## Retry and recovery

| Condition | Bounded response |
| --- | --- |
| Import command interrupted | Re-run the identical envelope and store path once; verify `imported: 0` on a completed retry. |
| Render failed | Leave the idea unposted, inspect local artifacts/error, and retry the same idea only after correcting the local renderer problem. |
| Receipt export interrupted | Re-run the identical input with the same `occurredAt`; verify the same `receiptId`. |
| Receipt already applied | Treat an identical no-op as success. Never create a replacement timestamp to force another receipt. |
| Unknown attribution | Stop, validate package id/revision/variant in both status outputs, and regenerate from the known source only. |
| Conflicting external ids | Stop. Preserve both files and escalate to a human; never overwrite the canonical provider id. |
| Missing metrics | Report the variant as missing/incomparable. Do not infer values or rank it as comparable. |
| Credential/provider failure | Stop at the existing provider preflight. This handoff grants no reconnect, credential, or posting authority. |

OpenClaw may run each local command once plus one identical retry for an
interrupted/idempotency check. Recurring schedules, unattended posting,
credential changes, and broader retry policies require separate approval.
