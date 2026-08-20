# Studio Agent Arsenal

Marketing Studio exposes one read-only discovery contract for human and AI
operators. An agent should inspect this contract instead of separately reading
the recipe catalog, render-mode registry, automation policy file, and UI tool
definitions.

```bash
npm run factory -- arsenal
npm run factory -- arsenal --channel youtube_shorts --spend-ceiling local-compute --readiness ready
```

The control server exposes the same `fleet.studio-arsenal-snapshot.v1` shape:

```text
GET /studio/arsenal
GET /studio/arsenal?channel=youtube_shorts&spendCeiling=local-compute&readiness=ready
GET /studio/arsenal?recipe=image-slideshow
```

Supported filters are `recipe`, `channel`, `owner`, `spendCeiling`, and
`readiness=all|ready|blocked`. Unknown filter values fail instead of silently
widening the candidate set.

## One decision surface

The snapshot contains:

- source-registry schemas and versions;
- Fleet projects and supported social channels;
- individual Studio tools with side-effect and confirmation posture;
- workflow capabilities and their actual execution owners;
- normalized video recipes, options, costs, requirements, readiness, and exact
  blockers;
- general render modes and specialized Forge, Editorial, Three.js, LTX, and
  lyric-compositor runtimes;
- enabled automation policies and the recipes each policy may select;
- the valid discovery, plan, execution, review, and publication operations;
- hard safety guardrails.

`config/studio-arsenal.json` is the canonical decision manifest for workflows,
recipes, and Studio tools. `config/render-modes.json` remains the execution and
smoke-test registry, `config/studio-automation.json` remains the cadence and
policy registry, and `config/brand-channels.json` remains the brand registry.
`src/studio/arsenal.js` validates and joins them, so callers get one response
without duplicating volatile readiness or policy state.

## Agent operating boundary

Discovery is always read-only. It does not create ideas or briefs, render
media, upload artifacts, inspect credentials, or contact a provider.

The intended state progression is:

```text
discover → plan → execute or continue → review → prepare → configured channel
```

- `discover` has no side effect and requires no confirmation.
- `plan` writes local production intent and requires confirmation.
- `execute` may consume local compute or provider credits and requires explicit
  confirmation or a versioned automation-policy grant.
- `review` reads artifacts and evidence without approving them.
- `prepare` remains blocked until source, rights, quality, artifact, and stable
  media evidence passes.
- Scheduling or publication is a network write and requires either explicit
  approval or a versioned autonomous channel policy. Agents call the internal
  publisher contract rather than provider APIs directly.

An agent must use stable ids from the snapshot and must not infer readiness
from a tool name. `ready: null` means the engine has not been probed; it is not
permission to execute.

## Integrity

Arsenal validation fails on duplicate ids, unknown engines, unsupported owners
or spend classes, invalid actions or options, missing Studio handlers,
secret-shaped fields, and automation policies that reference absent recipes.
Add or change capabilities in the canonical registries first, then run:

```bash
node --test test/studio-arsenal.test.js test/studio-production-catalog.test.js
npm run docs:validate
```
