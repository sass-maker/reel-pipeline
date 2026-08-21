# Reel Pipeline

> Canonical source: this standalone repository. Content Factory is owned here
> under `content-factory/`; Site Health retains the portfolio catalog and
> evidence links but does not embed the product source or UI.

A local-first video-creation product. Its primary loop is request → inspectable
workflow → explicit generation → playable result → reusable history. It also
turns owned or licensed source archives, approved podcast edits, and
source-backed briefs into reviewable vertical-video artifacts and receipts.

Reel Pipeline owns provider-neutral distribution contracts and its native
YouTube and Instagram publishing adapters. Credentials remain outside the
repository and are referenced only by environment-variable name. The agent
can package, schedule, or publish only for a channel listed in the local policy
manifest as `draft_only`, `approval_required`, or `autonomous`.

## Start here

- [`STATUS.md`](STATUS.md) — short operational view.
- [`PROJECT_STATUS.md`](PROJECT_STATUS.md) — durable scope, dependencies, and
  remaining work.
- [`docs/index.md`](docs/index.md) — documentation map.
- [`AGENTS.md`](AGENTS.md) — repository rules and verification commands.

## Quick start

```bash
gh repo clone sass-maker/reel-pipeline
cd reel-pipeline
npm ci
npm test
npm run dev
```

Agent automation begins with `npm run agent` and a `manifest` request using
`fleet.video-agent-operation.v1`. The manifest is generated from the live
recipe and execution registries, so an agent can discover exact required
inputs and fail closed instead of navigating the browser UI.

Useful checks:

```bash
npm run smoke:render-modes
node --test test/reel-agent.test.js test/internal-publisher.test.js
npm run ready:local
npm run docs:validate
```

## Boundary

```text
owned/licensed source archive or approved source package
        ↓
Reel Pipeline: plan/edit → validate → render → review artifact → media receipt
        ↓
policy-gated publisher → configured YouTube/Instagram channel → provider receipt
```

Podcast/archive editorial work belongs to the independent
[`Mashup`](https://github.com/sarthakagrawal927/mashup) product. Reel Pipeline never imports or starts
that runtime; it can only inspect a finished artifact through a verified
`fleet.mashup-media-receipt.v1` handoff.

The production Worker/R2 render flow remains:

```text
Cloudflare Worker + R2 → Rust watcher → render-pro.js → R2 → Worker receipt
```

Frontier image, video, and music generation is manual-import only. Automatic
paid generation spend is $0; every paid run needs a separate per-job budget and
operator approval. Local frontier-model execution is parked, while its proven
code and receipts remain available as historical evidence. Reel Pipeline keeps
deterministic capture and composition, FFmpeg/Chromium/Blender rendering,
Kokoro narration, procedural draft audio, captions, review, provenance,
history, and evidence-gated distribution. See
[`ADR 0006`](docs/architecture/decisions/0006-cost-capped-media-generation-boundary.md).

The local control API also exposes the anonymous brand-reel, review, and studio
surfaces. These are generation tools, not social publishing surfaces.

## Documentation policy

Committed Markdown is the source of truth; Blume only renders it. Executable
configuration is authoritative for commands and readiness checks. Run
`npm run docs:validate` after documentation changes.
