# Product Overview

Reel Pipeline creates reviewable media artifacts for Fleet products. It serves
visitors through the anonymous brand-reel page and internal operators through
generation/review tools.

## Surfaces

| Surface | Audience | Entry point |
| --- | --- | --- |
| Anonymous brand reel | Visitors | `npm run dev` → `/` |
| Review UI | Internal reviewers | `npm run dev` → `/review` |
| Content studio | Internal creators | `npm run studio` or `/studio` |
| Faceless workflow | Internal creators | `npm run faceless` |
| Lesson pipeline | Internal creators | `npm run lesson:render` |
| External podcast media | Internal creators | `npm run inspect:mashup-media -- --receipt <path>` |
| Artifact Worker | Render hosts/integrators | Worker/R2 API |
| Postiz handoff | Marketing operator | `npm run distribution -- --provider postiz` |

## Ownership

- Source projects own product facts and content approval.
- Mashup owns podcast/archive editorial planning and rendering. Reel Pipeline
  owns its native video workflows and verifies external media receipts.
- Postiz owns social connections, review, scheduling, publishing, and provider
  metrics.

## Out of scope

- Native social-provider credentials or publishing.
- Social schedule state or duplicate provider analytics.
- Auth, billing, actor marketplaces, and payouts on the anonymous surface.
- Additional creator automation before output quality is manually validated.

The system is production-capable infrastructure; creative quality still needs
human review and measured iteration.
