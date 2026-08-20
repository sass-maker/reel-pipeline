# Testing and Verification

## Local baseline

```bash
npm test
npm run smoke:render-modes
npm run smoke:postiz
npm run docs:validate
```

`npm test` runs the Node and Rust suites. Mashup has independent checks under
the independent Mashup repository; Reel Pipeline does not invoke them. The render-mode smoke calls the
VideoBrief renderer directly; it no longer depends on a marketing queue.
Postiz tests use fixtures and fake HTTP responses and never publish.

## Readiness

```bash
npm run ready:local
npm run ready:proofs
npm run ready:target
```

`ready:target` is meaningful only on a prepared generation host. The report at
`tmp/generation-readiness/report.json` separates local evidence from live and
manual prerequisites.

## Live proofs

| Capability | Evidence |
| --- | --- |
| Worker/R2 render | `npm run render:pro -- <approved-reel-id>` |
| R2 byte-range playback | `npm run smoke:artifact` with artifact URL/key |
| Postiz draft | one approved canary confirmed as an unscheduled draft in Postiz |

Never call the repository production-ready solely from local tests; record
unresolved target-host checks in `PROJECT_STATUS.md`.
