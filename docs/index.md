# Reel Pipeline Docs

Reel Pipeline generates media artifacts. Postiz owns social review,
scheduling, publishing, and provider analytics.

Start with [`STATUS.md`](../STATUS.md) and
[`PROJECT_STATUS.md`](../PROJECT_STATUS.md). Blume renders this committed
Markdown but does not replace it as the source of truth.

## Product

- [`product/overview.md`](./product/overview.md)
- [`product/anonymous-brand-reel.md`](./product/anonymous-brand-reel.md)
- [`product/podcast-editorial.md`](./product/podcast-editorial.md)
- [`product/content-studio.md`](./product/content-studio.md)
- [`product/faceless-workflow.md`](./product/faceless-workflow.md)
- [`product/lesson-video-pipeline.md`](./product/lesson-video-pipeline.md)
- [`product/creator-mvp.md`](./product/creator-mvp.md)
- [`product/growth-format-playbook.md`](./product/growth-format-playbook.md)

## Architecture

- [`architecture/overview.md`](./architecture/overview.md)
- [`architecture/how-it-works.md`](./architecture/how-it-works.md)
- [`architecture/render-modes.md`](./architecture/render-modes.md)
- [`architecture/studio-agent-arsenal.md`](./architecture/studio-agent-arsenal.md)
- [`architecture/engines.md`](./architecture/engines.md)
- [`architecture/generation-craft.md`](./architecture/generation-craft.md)
- [`architecture/rust-orchestrator.md`](./architecture/rust-orchestrator.md)
- [`architecture/decisions/`](./architecture/decisions/)

## Development

- [`development/setup.md`](./development/setup.md)
- [`development/commands.md`](./development/commands.md)
- [`development/testing.md`](./development/testing.md)
- [`development/submodules.md`](./development/submodules.md)
- [`development/docs-build.md`](./development/docs-build.md)

## Operations

- [`operations/deployment.md`](./operations/deployment.md)
- [`operations/postiz-handoff.md`](./operations/postiz-handoff.md)
- [`operations/runbooks/generation-readiness.md`](./operations/runbooks/generation-readiness.md)
- [`operations/runbooks/target-host-readiness.md`](./operations/runbooks/target-host-readiness.md)
- [`operations/runbooks/content-package-pipeline.md`](./operations/runbooks/content-package-pipeline.md)
- [`operations/runbooks/significant-content-openclaw.md`](./operations/runbooks/significant-content-openclaw.md)

## Knowledge and history

- The parked Local Video Forge runbook remains under `operations/runbooks/` as
  historical evidence; it is not an active setup or execution guide.
- [`knowledge/`](./knowledge/)
- [`feature-suggestions/`](./feature-suggestions/)
- [`archive/`](./archive/)

Run `npm run docs:validate` before committing documentation changes.
