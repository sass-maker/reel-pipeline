# Architecture

Reel Pipeline has one responsibility: convert approved source material into
reviewable media artifacts and receipts.

## System boundary

```text
 source media / source project / approved content package
                  ↓
 Mashup media receipt / VideoBrief / package contract
                  ↓
    render adapter → artifact manifest → quality/review
                  ↓
             media receipt
                  ↓
 Fleet-owned channel publisher
                  ↓
 YouTube / Instagram → provider receipt
```

Reel Pipeline owns generation and the provider-neutral distribution boundary.
Source projects own claims and approval. Provider credentials remain external.

## External Mashup media flow

```text
independent Mashup helper
  → completed MP4 + fleet.mashup-media-receipt.v1
  → src/adapters/podcast-edit.js
  → hash, approval, provenance, and approved-root verification
  → ordinary Reel Pipeline source media
```

Mashup owns its EDL, SQLite state, models, planning, and renderer. Reel Pipeline
does not require Mashup's source tree and never reads its mutable state.

## Worker production flow

```text
Cloudflare Worker + R2
  → approved reel record
  → Rust watcher
  → scripts/render-pro.js
  → Chrome/voice/FFmpeg render
  → R2 artifact
  → Worker record update
```

The Rust layer handles polling and safe process orchestration. Node and external
tools continue to perform media work.

## Package/publication flow

```text
approved fleet.content-package.v1
  → renderer
  → fleet.artifact-manifest.v1
  → fleet.media-receipt.v1
  → src/internal-publisher.js
  → registered YouTube or Instagram adapter
```

The internal publisher requires an explicit brand/channel/account mapping and
resolves credential values only from named environment variables.

## Core modules

| Module | Role |
| --- | --- |
| `src/video-brief.js` / `reel/src/brief.rs` | Validate normalized render input |
| `src/adapters/podcast-edit.js` | Verify a finished external Mashup artifact and receipt without invoking Mashup |
| `src/pipeline.js` | Node render orchestration for local/browser/package surfaces |
| `reel/src/watcher.rs` | Poll approved Worker reels and invoke render-pro |
| `src/adapters/*` | Render-engine adapters |
| `src/artifact-publisher.js` | Local/R2 artifact publication |
| `content-factory/src/manifest.js` | Artifact manifest and provenance contract |
| `src/internal-publisher.js` | Route configured channels to owned provider adapters |
| `src/publishers/*` | YouTube and Instagram preflight and publication |
| `src/distribution.js` | Validate manual or internal distribution requests |

## Safety properties

- Credentials remain external and are never stored in integration maps.
- A completed render must have a verifiable artifact manifest.
- Source approval and artifact review are separate evidence stages.
- Agents cannot infer accounts or channels; policy and channel configuration
  must agree before a provider write.
- Provider failures are classified and returned without exposing credentials.
- Live Rust render/watch paths default to dry-run unless `--execute` is used.
