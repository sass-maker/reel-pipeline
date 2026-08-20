# Reel Pipeline agent instructions

When this repository is checked out inside the Fleet workspace, also follow
the shared instructions at `../AGENTS.md`.

## Purpose

This repository generates, packages, and publishes media through Fleet-owned
YouTube and Instagram adapters. Its agent interface may publish only through
an explicit configured channel policy; credentials remain environment-owned.

## Agent interface

- Discover registered recipes, adapters, projects, execution modes, and
  channel policies through `npm run agent` with a `manifest` request.
- Send one `fleet.video-agent-operation.v1` JSON object on stdin or with
  `--request`; stdout is one result envelope.
- Validate first. Real execution fails closed when registered inputs are
  missing. Fixture output never substitutes for real output.
- Publication requires a configured `draft_only`, `approval_required`, or
  `autonomous` channel policy. Never infer a destination or bypass the
  provider-specific preflight.
- Commands, source code, executables, and arbitrary plugins are rejected.

## Verify

```bash
npm test
npm run smoke:render-modes
node --test test/reel-agent.test.js test/internal-publisher.test.js
npm run docs:validate
```

Use `npm run ready:target` only on the prepared target host because it checks
live prerequisites.

## Constraints

- Preserve source-package claims and approval evidence.
- Default to local/draft generation; publish only when a configured channel
  policy and the requested operation authorize it.
- Do not add direct social-provider adapters or credential stores.
- Keep engine integrations behind VideoBrief/content-package contracts.
- Do not advance git submodules on `main` without a focused canary.
- Do not touch credentials, `.env` files, or cloud configuration without
  explicit approval.
- Keep root status in `PROJECT_STATUS.md`; do not create parallel ledgers.

Command reference: [`docs/development/commands.md`](docs/development/commands.md).
