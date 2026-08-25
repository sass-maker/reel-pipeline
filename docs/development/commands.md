# Command Reference

`package.json` is authoritative. This page groups the supported operator
commands.

## Develop and verify

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local control API and browser surfaces |
| `npm test` | Node and Rust regression suites |
| `npm run smoke:render-modes` | Direct VideoBrief fixture checks for render modes |
| `npm run smoke:postiz` | Postiz adapter, mapping, and draft contract tests |
| `npm run ready:local` | Local generation-case readiness |
| `npm run ready:proofs` | Refresh required readiness evidence |
| `npm run ready:target` | Target-host acceptance; requires prepared live services |
| `npm run docs:validate` | Documentation structure and link validation |
| `npm run render:pro -- <reel-id>` | Canonical Worker/R2 production render |
| `npm run render:pro:rs -- <reel-id>` | Rust wrapper around production render |
| `npm run render:fixture -- --mode <mode>` | Direct local VideoBrief fixture render |
| `npm run render:html -- --brief <file>` | Export HTML composition artifacts |
| `npm run render:package -- --file <package>` | Render an approved content package |
| `npm run inspect:mashup-media -- --receipt <receipt>` | Verify a completed external Mashup artifact and receipt without rendering |
| `npm run probe:engines` | Inspect renderer prerequisites without rendering |

## External Mashup media

| Command | Purpose |
| --- | --- |
Mashup owns podcast/archive planning and rendering under
the independent Mashup repository. Reel Pipeline accepts only its completed media and
`fleet.mashup-media-receipt.v1`; it has no Mashup execution command.

## Source packages and Postiz

| Command | Purpose |
| --- | --- |
| `npm run content` | Extract or inspect content packages |
| `npm run draft:signal` | Convert a High Signal brief into a draft bundle |
| `npm run significant-content -- <command>` | Significant Content intake/receipt/report tooling |
| `npm run check:social` | Validate Postiz base URL, key presence, and integration mapping |
| `npm run distribution -- --file <package> --receipt <receipt> --provider postiz` | Create a Postiz draft from approved inputs |

Distribution supports only `manual` and `postiz`. Native YouTube/Instagram
publishing is intentionally rejected.

## Studio and generation tools

| Command | Purpose |
| --- | --- |
| `npm run studio -- <tool>` | Content studio tools |
| `npm run faceless -- --topic "..."` | Topic-to-video workflow |
| `npm run factory -- <command>` | Local backlog-to-artifact conveyor |
| `npm run factory -- arsenal [filters]` | Read-only machine inventory of projects, tools, workflows, recipes, engines, policies, readiness, guardrails, and next actions |
| `npm run factory -- autopilot --policy <id> --dry-run` | Discover one automation policy without writes, rendering, upload, or Postiz calls |
| `npm run factory -- autopilot --all --execute --count <n>` | Execute bounded enabled policies with persisted retries and evidence gates |
| `npm run factory -- status` | Show backlog stages plus content-lane, policy, run, and recovery status |
| `npm run lesson:render -- ...` | Tutoring lesson renderer |
| `npm run setup:kokoro` | Install the optional local Kokoro model |
| `npm run forge:coherent -- --manifest <json> --output <dir>` | Render an approved skill-bound coherent film with reproducibility and review metadata |
| `npm run demo:cartoon-hand:capture` | Acquire the `guided-app-demo@2` demo capture and its bound pointer trace with local Chrome |
| `npm run demo:cartoon-hand` | Render the cartoon-hand, reduced-motion, and standard-cursor demo outputs and write the review evidence |
| `npm run demo:cartoon-hand:check` | Verify the committed demo hashes, plan digests, and rendered outputs without re-rendering |

Add `--reduced-motion` to `forge:coherent` to render the same manifest with
fixed source frames and direct scene changes.

Frontier image, video, and music setup/execution commands are intentionally not
exposed. Those runtimes are parked under ADR 0006. Import approved media
manually; every paid generation run needs a separate per-job budget and
operator approval.

## Worker and watcher

| Command | Purpose |
| --- | --- |
| `npm run watch:render` | Poll and render approved Worker reels |
| `npm run watch:render:once` | Execute one watcher tick |
| `npm run watch:render:dry` | Print watcher actions without mutation |
| `npm run bootstrap:cloudflare` | Prepare Worker/R2 resources; explicit operator action |
| `npm run check:cloudflare` | Check Cloudflare prerequisites |
| `npm run worker:dry-run` | Wrangler deployment dry run |

The retained Local Video Forge coordinator and model scripts are historical
evidence, not supported operator commands.

## Rust CLI

```text
reel render <reel-id...> [--variant-count N] [--execute]
reel watch [--once] [--execute]
reel plan <brief.json> [--variant-count N]
reel validate-brief <brief.json>
reel score <brief.json>
reel config project-urls
```

Rust render/watch commands default to dry-run and require `--execute` for live
work.
