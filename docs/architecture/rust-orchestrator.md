# Rust orchestrator (`reel/`)

Rust owns the production Worker watcher, render process control, brief
validation, planning, and quality logic. It does not own marketing queues,
social providers, scheduling, or metrics ingestion.

## Production flow

```text
reel watch --execute
  → poll approved Worker reels
  → node scripts/render-pro.js <reel-id>
  → update Worker/R2 artifact state
```

Node and external tools still own the pixels. This keeps mature
Chromium/FFmpeg/TTS code behind a small process boundary instead of rewriting
it in Rust.

## Current CLI

```text
reel render <reel-id...> [--variant-count N] [--execute]
reel watch [--once] [--execute]
reel plan <brief.json> [--variant-count N]
reel validate-brief <brief.json>
reel score <brief.json>
reel config project-urls
```

`render` and `watch` are dry-run by default.

## Current modules

| Module | Role |
| --- | --- |
| `brief.rs` | VideoBrief normalization and validation |
| `templates.rs` | Variant plan and templates |
| `quality.rs` | Quality scoring and gate |
| `config.rs` | Project URL configuration |
| `artifact.rs` | Artifact naming and URL helpers |
| `store.rs` | File-backed job store abstraction |
| `runner.rs` | Process runner abstraction |
| `engine/render_pro.rs` | Safe `render-pro.js` command construction |
| `orchestrator.rs` | Render-plan orchestration logic |
| `publisher.rs` | Artifact publisher abstraction |
| `watcher.rs` | Worker poll/render loop |
| `cli.rs` / `main.rs` | CLI contract and dispatch |

The former SaaS Maker client, autopilot, native provider publishers, posting,
metrics, and social-account modules were removed when Postiz became the sole
publication surface.
