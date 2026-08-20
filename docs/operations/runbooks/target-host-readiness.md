# Target Host Readiness

Use this after local tests pass and before enabling the designated generation
host.

## Required host capabilities

- Node, Rust, FFmpeg/ffprobe, Chromium, and initialized engine submodules.
- Cloudflare access for the existing Worker/R2 render path.
- A single supervised Rust watcher.
- Reachable self-hosted Postiz with an external API key.
- Exact project/channel Postiz integration mappings.

## Acceptance sequence

1. Run `npm test` and `npm run ready:local`.
2. Run `npm run check:cloudflare` and the Worker dry run.
3. Render one real approved Worker reel and verify R2 playback.
4. Run `npm run check:social -- --strict`.
5. Submit one approved package and verify it appears as an unscheduled Postiz
   draft.
6. Run `npm run ready:proofs` and `npm run ready:target`.
7. Record any intentionally deferred optional renderer in `PROJECT_STATUS.md`.

Do not schedule or publish the Postiz canary until a human has reviewed the
copy, media, and destination.
