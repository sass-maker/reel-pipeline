# Reel Pipeline

AI reel generation and autopost orchestration for fleet products. Turns
approved SaaS Maker marketing ideas, High Signal briefs, Significant Hobbies
envelopes, and public brand URLs into reviewable short-form video drafts,
rendered MP4s, and gated posting handoff.

The public product does one thing: paste a public HTTPS brand website and get
a presenter-led vertical reel. There is no login, account, billing,
workspace, actor onboarding, or social connection in that flow. The older
review, studio, and fleet marketing utilities are internal tooling; they are
not visitor product surfaces and do not add identity to the anonymous
brand-reel path.

## Start here

- [`AGENTS.md`](AGENTS.md) — agent bootloader: essential commands, critical
  constraints, documentation navigation.
- [`STATUS.md`](STATUS.md) — short executive view (objective, what works,
  blockers, next steps).
- [`PROJECT_STATUS.md`](PROJECT_STATUS.md) — detailed status, dependencies,
  timeline, features shipped, todo/deferred/blocked.
- [`docs/index.md`](docs/index.md) — full documentation navigation hub.

## Quick start

```bash
git clone --recurse-submodules <repo-url>      # engines/* are submodules
npm ci                                          # Node ≥ 20; Rust stable for reel/
npm run dev                                     # local control API on http://127.0.0.1:4317
# root page  → anonymous brand URL → presenter-led reel
# /review    → swipe approve/reject UI
# /studio    → content studio
```

Verify:

```bash
npm test                  # node --test + cargo test
npm run smoke:mock        # no-dependency end-to-end smoke
npm run ready:local       # top-level generation-cases readiness
```

Full command reference: [`docs/development/commands.md`](docs/development/commands.md).
Setup details: [`docs/development/setup.md`](docs/development/setup.md).
Testing & verification: [`docs/development/testing.md`](docs/development/testing.md).

## Surfaces

| Surface | Audience | Doc |
| --- | --- | --- |
| Anonymous brand reel | Visitors | [`docs/product/anonymous-brand-reel.md`](docs/product/anonymous-brand-reel.md) |
| Marketing autopilot | Marketing operators | [`docs/product/marketing-autopilot.md`](docs/product/marketing-autopilot.md) |
| Creator MVP (kids stories) | Creators | [`docs/product/creator-mvp.md`](docs/product/creator-mvp.md) |
| Growth format testing | Marketing operators | [`docs/product/growth-format-playbook.md`](docs/product/growth-format-playbook.md) |
| Content studio | Creators | [`docs/product/content-studio.md`](docs/product/content-studio.md) |
| Faceless workflow | Creators | [`docs/product/faceless-workflow.md`](docs/product/faceless-workflow.md) |
| Tutoring lessons | Tutors | [`docs/product/lesson-video-pipeline.md`](docs/product/lesson-video-pipeline.md) |
| Artifact Worker | Browsers / integrators | `https://reel-pipeline-artifacts.sarthakagrawal927.workers.dev` |

## Architecture (one paragraph)

Two non-overlapping flows. **Worker reel flow** (production render path):
Cloudflare Worker + R2 → Rust watcher → `node scripts/render-pro.js`
(Chrome CDP + Edge TTS + ffmpeg + R2 upload + worker patch). **Marketing
autopilot flow**: SaaS Maker queue → hold-window auto-accept → render
accepted posts via `VideoBrief` contract → R2 artifact → gated post to
YouTube / Instagram. Default render mode is `mock`; local no-credential
modes (`mock`, `html-composition`, `ascii`, `grok-video`, `reel-maker`,
`kokoro`, `brand-video`) are proven by `npm run smoke:render-modes`. Full
architecture: [`docs/architecture/overview.md`](docs/architecture/overview.md).
Engines: [`docs/architecture/engines.md`](docs/architecture/engines.md).
Render modes: [`docs/architecture/render-modes.md`](docs/architecture/render-modes.md).

## Language note

GitHub shows this repo as JavaScript because the code in this repo is a small
Node.js / Cloudflare Workers orchestration layer. The Rust orchestrator
(`reel/`) owns watch, render-accepted, autopilot, and post entrypoints; JS
remains for `render-pro.js`, OAuth bootstrap, and the local dev server. See
[`docs/architecture/rust-orchestrator.md`](docs/architecture/rust-orchestrator.md)
and
[`docs/architecture/decisions/0001-rust-orchestrator-cutover.md`](docs/architecture/decisions/0001-rust-orchestrator-cutover.md).

## Practical caveat

The pipeline is technically working. The generated videos are still
low-quality until creative direction, footage selection, UGC actor support,
and post-render review improve. Treat the current release as infrastructure
and draft production, not final marketing quality.

## Update policy

- Markdown under `docs/` (plus root `README.md`, `AGENTS.md`, `STATUS.md`,
  `PROJECT_STATUS.md`) is the source of truth. Blume only renders it.
- One canonical home per fact. Link, do not restate.
- Code/config (`package.json`, `config/*.json`, `wrangler.jsonc`, CI) is
  authoritative for implementation details and schedules.
- Use `git mv` when reorganizing docs. Prefer `docs/archive/` over deletion.
- Run `npm run docs:validate` before committing doc changes; CI enforces it.

See [`AGENTS.md`](AGENTS.md) for the full documentation maintenance rules.
> [!IMPORTANT]
> This repository was merged into
> [`sass-maker/fleet-workspace`](https://github.com/sass-maker/fleet-workspace)
> at `fleet-ops/services/reel-pipeline/`. It is retained for history and
> attribution only; do not clone it for Fleet setup or development.
