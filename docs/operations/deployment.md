# Deployment

Reel Pipeline has two runtime responsibilities:

1. Cloudflare Worker/R2 stores reel records and artifacts.
2. The designated Fleet machine runs generation workers and hands approved
   packages to the separately hosted Postiz service.

## Generation host

```bash
git clone --recurse-submodules <repo-url>
npm ci
cargo test --manifest-path reel/Cargo.toml
npm run ready:local
```

Run `reel watch --execute` as a single supervised process. Do not run two
watchers against the same Worker queue without an explicit lease design.

## Cloudflare

Worker/R2 changes are manual releases:

```bash
npm run check:cloudflare
npm run worker:dry-run
```

Deploy only with explicit release approval, then verify health, a real render,
and byte-range artifact playback.

## Postiz

Postiz is installed and operated separately on the designated Fleet machine.
Reel Pipeline needs only its base URL, external API key, and integration map.
See [`postiz-handoff.md`](./postiz-handoff.md).

## Acceptance

```bash
npm test
npm run smoke:postiz
npm run ready:proofs
npm run ready:target
```

Target readiness also requires one real Worker/R2 render and one unscheduled
Postiz draft canary. Keep secrets and machine service definitions outside git.
