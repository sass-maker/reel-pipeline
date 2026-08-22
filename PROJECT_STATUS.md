# Reel Pipeline — Project Status

Last updated: 2026-08-23

## Why / What

Reel Pipeline is a provider-neutral media production, review, and publishing
product maintained in its own repository. Its primary loop
turns a plain-language request or approved media import into an inspectable
workflow, deterministic production, browser-playable result, reusable history
entry, and optional evidence-gated provider publication. It also accepts
approved source-backed briefs and podcast edit decisions, renders reviewable
media, and records artifact provenance.

It owns provider-neutral distribution contracts and native YouTube and
Instagram adapters, but not credential values or provider truth. Its machine
interface may request a write only through an explicit per-channel policy.

## Dependencies

### External

- Cloudflare Worker and R2 for production artifact intake/storage.
- YouTube Data API and Instagram Graph API for configured publication.
- FFmpeg/Chromium and optional deterministic render engines, including Blender
  5.2, on production hosts.
- Optional Kokoro narration and approved externally generated media imports.
- Optional finished media from the independent Mashup helper, accepted only
  through a verified `fleet.mashup-media-receipt.v1` handoff.

### Internal

- Source projects provide approved content packages or VideoBrief inputs.
- High Signal and Significant Content provide source-backed creative inputs.
- Content Factory defines approved brief, artifact manifest, and media receipt
  contracts from the repository-owned `content-factory/` component.

## Timeline

- **2026-08-23:** added `guided-app-demo@2` and the opt-in cartoon-hand pointer
  treatment: the `reel-pipeline.pointer-trace.v1` privacy-bounded sidecar,
  hash-bound trace approval on the capture record, a deterministic
  presenter-anchored overlay planner with fingertip/hotspot precision, a
  rights-cleared `fleet-mitt@1` hand style, review gates measured on rendered
  frames, and a recorded standard-cursor fallback. Proved it with a
  reproducible zero-spend demo: a real local Chrome capture of this
  repository's own brand-reel surface, a trace emitted by the same scripted
  runner, and cartoon-hand, reduced-motion, and standard-cursor renders with
  hashes in `fixtures/guided-app-demo/cartoon-hand-pointer/evidence.json`.
  Publication stays blocked pending an owner decision.
  See [`docs/architecture/cartoon-hand-pointer.md`](docs/architecture/cartoon-hand-pointer.md).
- **2026-08-20:** restored this standalone repository as the canonical source,
  moved Content Factory under the same repository boundary, and removed the
  embedded Fleet Console maker/gallery and direct Fleet source imports. Existing
  Cloudflare resources were retained without deployment.
- **2026-08-20:** parked active local frontier image, video, and music model
  execution after the retained LTX proofs failed the accepted-output bar. Set
  automatic paid generation spend to $0 and made hosted generation manual-import
  only with a separate per-job budget and operator approval. Deterministic local
  production, Kokoro narration, procedural draft audio, review, provenance,
  history, and publishing remain supported.
- **2026-08-10:** restored the accepted internal-publishing architecture for
  agent operations: configured channels route through repository-owned YouTube and
  Instagram adapters, while credential values stay outside manifests and
  results. Postiz is not an agent capability.
- **2026-08-09:** shipped the strict `reel-agent` capability, execution,
  packaging, and policy-gated publication contract over the live recipe and
  adapter registries. Added `draft_only`, `approval_required`, and
  `autonomous` channel modes without exposing credentials to the agent.
- **2026-08-09:** separated Mashup into its independent repository. Reel Pipeline
  no longer imports, starts, configures, or owns its Python runtime and instead
  verifies approved finished media through a versioned receipt. Voice intake
  also stopped borrowing Mashup transcription internals.
- **2026-08-09:** reconciled the inherited Mashup maintenance bundle without
  reopening a standalone product. Mixed-source renders now choose the modal
  source format with maximum-quality tie-breaking, archive ingestion reports
  and skips isolated unreadable files, and the unused local media directory was
  removed. Kinetic Type is the selected optional visual direction; the old
  corpus, matched-pair, five-condition, and cross-archive research program is
  retired under the source-faithful CLI boundary.
- **2026-08-09:** completed the safely shippable voice-first Studio workflow:
  Talk and Type now compile to the same persisted eight-stage graph with
  manual/quick execution, pause, retry, checkpoints, and downstream
  invalidation. Added searchable reusable cast controls, explicit soundtrack
  source and mix controls, mature/private readiness boundaries, and responsive
  browser evidence. The generated-music adapter remains intentionally blocked
  pending human listening review of its local ACE-Step canary.
- **2026-08-09:** finalized the product boundary between Video Maker and
  Mashup. `/studio` exposes the prompt-first Video Maker; the incorporated
  podcast editor remains an operator CLI with no
  Mashup navigation, page, or browser API.
- **2026-08-09:** shipped policy-bounded Studio autopilot lanes for High Signal
  daily briefs, Significant Hobbies weekly posts, and major maintained-project
  changelogs. Runs reuse source revisions and prior receipts, stop on explicit
  spend, rights, runtime, or distribution blockers, and can prepare Postiz
  drafts or exact future schedules only when the standing policy covers them.
- **2026-08-06:** established Reel Pipeline as a standalone product boundary,
  with `/studio` as its product surface rather than a diagnostics-only view.
  Tightened playback truth so History and Productions advertise an MP4 only
  after media probing confirms a decodable video stream; missing and legacy
  mock artifacts remain inspectable without a broken player.
- **2026-08-06:** made Marketing Studio's production archive generic and
  data-driven, keeping every saved prompt, executed workflow, receipt, and
  playable artifact together. Added registry-backed Recipes and Workflows
  libraries plus reproducible guarded sample workflows, including a five-shot
  30-second LTX story canary with original Kokoro voice and ACE-Step music.
- **2026-08-01:** completed the Fleet Console Marketing video arsenal boundary:
  all 49 stable variants now have compact rights-safe vertical MP4 fixtures,
  exact prompt presets, byte-range playback, fixture/real execution envelopes,
  registered owner adapters, and fail-closed completeness checks. Added ordered
  two-to-three-style gallery mixes with deterministic local FFmpeg composition
  and component provenance; the maker UI was later consolidated into `/studio`.
- **2026-08-01:** removed the unused MoneyPrinterTurbo and reel-maker engine
  submodules, their checkout-backed Node/Rust adapters, false readiness gates,
  and the blocked stock-service recipe. Product Proof remains an explicit
  Brand Reel handoff; local video creation remains repository-owned.
- **2026-07-31:** added rights-gated literal lyric videos to Marketing Studio
  with exact timed-text preservation, separate composition and recording
  evidence, deterministic cue-to-scene planning, optional safe Blender 5.2
  plates, local composition, review receipts, and a reproducible public-domain
  “Twinkle, Twinkle, Little Star” canary using a new local recording.
- **2026-07-31:** unified the internal Marketing Studio around a persistent,
  conversational video brief covering faceless lessons, brand reels, guided
  app demos, coherent films, and podcast shorts. Added explicit runtime
  routing, deduplicated production review/playback, fail-closed distribution
  evidence, and Postiz draft or exact future-schedule handoffs for YouTube
  Shorts and Instagram Reels. Postiz remains the owner of credentials, durable
  calendar execution, publication state, rescheduling, cancellation, and
  analytics.
- **2026-07-29:** consolidated Mashup's Python planner, SQLite-backed stage
  state, provenance-gated archive tooling, tests, and operator editor under
  `editorial/`. Added the strict `fleet.podcast-edit.v1` handoff, an
  approval-gated render adapter, source-hash verification, and a render
  receipt. Proved the boundary with a real 46-second ZEROPOD short while
  preserving the original EDL, source audio, source heading, source timing,
  watermark, and sidecar captions.
- **2026-07-27:** added the coherent scene compositor, the immutable
  `evidence-beam@1` film skill, and a reproducible CodeVetter reference film
  with real product evidence, local LTX atmosphere, Kokoro narration,
  phrase-timed captions, review metadata, and a reduced-motion encode. Added
  the authenticated `/forge` operator console for prompt intake, exact skill
  choice, asset rights, queue status, variant decisions, and fail-closed final
  approval.
- **2026-07-27:** added `guided-app-demo@1` and the `/forge` app-recording
  workflow: real window/tab/screen capture, optional same-session camera and
  microphone presenter at bottom right, local preview-before-upload, immutable
  source-hash provenance, and Mac FFmpeg preview/final encoding.
- **2026-07-26:** added the Local Video Forge first vertical slice: pinned
  Apple Silicon LTX-2.3 generation, an approved-keyframe three-variant command,
  reproducibility metadata/review gallery, and an authenticated Worker/R2 queue
  that accepts tasks from either machine and is pulled by the generation Mac.
- **2026-07-26:** added a reproducible Local Video Forge mixed-media proof
  preset with local Kokoro narration, audio-derived subtitle timing, burned and
  external captions, ASCII/Canvas graphics, real variant proof frames, and a
  no-false-lip-sync composition rule.
- **2026-07-21:** removed the SaaS Maker queue, direct YouTube/Instagram
  publishers, OAuth helpers, posting/metrics loops, and duplicate marketing
  control services. Added the Postiz draft adapter and direct render-fixture
  readiness path.
- **2026-07:** completed source-backed content package, render manifest,
  Significant Content, studio, and local render-mode work.
- **Earlier:** established the Worker/R2 render path, Rust watcher, VideoBrief
  adapters, anonymous brand-reel, and review surfaces.

## Products

- Standalone local-first Video Maker (`/studio`) with Create, History, Recipes,
  and Workflows.
- Anonymous brand-reel generator and faceless/lesson workflows.
- Worker/R2 production reel renderer.
- Content-package renderer and Postiz draft or future-schedule handoff.
- Verified ingestion of approved, finished Mashup media.
- Rights-gated literal lyric-video production with optional Blender scenes.
- Standalone Studio execution API with exact gallery previews and deterministic
  ordered style mixes.

## Features (shipped)

- Machine-readable agent manifest covering all 13 recipes, 49 registered
  variants, 13 execution adapters, readiness blockers, and configured channel
  policies, with strict validation and arbitrary-execution rejection.
- A focused prompt-first Video Maker browser surface with recipe-derived format
  selection and truthful continuations; Mashup is an independent helper.
- Voice-first and typed brief intake feeding one persisted eight-stage
  workflow with manual or quick progression, readiness rechecks, pause/retry,
  reusable checkpoints, and transitive invalidation after upstream edits.
- Searchable reusable characters and workflow-specific cast overrides with
  source, likeness, mature-readiness, wardrobe, expression, and continuity
  evidence.
- Explicit procedural-draft, owned-local, platform-reference, and parked
  generated soundtrack lanes with retained mix transforms and fail-closed
  commercial-audio and rights blockers.
- Versioned secret-free automation policies, source-revision idempotency,
  bounded retries, dry-run and execute commands, lane-aware Studio status, and
  Project Autopilot / Ask Me / Personal Automations production grouping.
- VideoBrief validation and provider-neutral render adapters.
- Content Factory manifests with hashes and provenance.
- Local render modes: mock, HTML composition, ASCII, Blender, Grok local asset,
  Kokoro, and brand video.
- Worker/R2 render flow with Rust watch/render orchestration.
- Significant Content and High Signal intake contracts.
- Postiz integration mapping, media upload, and draft or exact future-schedule
  adapter for YouTube Shorts and Instagram Reels.
- Conversational `fleet.marketing-studio-brief.v1` intake with revisioned local
  persistence, multi-turn natural-language refinement, normalized
  brand/channel/creative state, explicit source-URL capture without inferred
  approval, and honest readiness across six video workflows.
- Exact LRC, SRT, or structured lyric-cue normalization; separate
  composition/lyric and master-recording rights gates; one-to-one literal scene
  planning; deterministic native or Blender-backed plates; synchronized
  captions, attribution, approved audio, hashes, and quality evidence.
- Safe Blender 5.2 adapter execution through a repository-owned scene builder,
  bounded manifests, factory startup, disabled auto-execution, run-directory
  path controls, versioned provenance, artifact hashes, and eight distinct
  local 3D scene languages.
- A secret-free, byte-range-capable Explore Gallery registry with 49 exact,
  portable, hash-validated rights-safe MP4 previews; style-family filtering;
  exact preset handoff; and ordered two-to-three-style mixes rendered locally
  with component provenance.
- Versioned fixture/real video execution envelopes, complete adapter and input
  registries for all 12 recipes and 48 variants, normalized local and owner
  receipts, contextual blockers, and catalog/gallery/preset completeness that
  fails closed on missing, duplicate, null, unknown, or stale identifiers.
- Unified Create, History, Recipes, Workflows, Distribute, and Tools operator
  views with explicit execution, prompt-to-artifact traceability, registry-backed
  reusable starting points, exact executed composite-workflow evidence,
  specialized runtime continuations, safe public-field prefill for Brand Reel
  and Forge, deduplicated brief-owned artifacts, and the complete legacy Content
  Studio toolset.
- Fail-closed Studio-to-Postiz preparation requiring source, claim,
  destination, rights, creative approval, quality evidence, render evidence,
  and a stable public media URL; draft and scheduled submissions preserve the
  exact UTC timestamp, reject invalid or past times, reject immediate
  publication, and prevent duplicate Postiz submissions.
- Fail-closed rejection of native social-provider distribution.
- Node and Rust regression suites plus focused Postiz and render-mode smokes.
- Parked Local Video Forge manifests, receipts, review gallery, and task
  contract retained as historical reproducibility evidence, with no active
  package or Studio execution path.
- Approved coherent-film manifests with deterministic scene primitives,
  caption/audio bindings, collision-free render packages, input/output hashes,
  engine revisions, review frames, BT.709 delivery, and reduced-motion output.
- Versioned film-skill contracts that pin narrative order, allowed primitives,
  asset requirements, render defaults, and quality gates; `evidence-beam@1` is
  the first registered skill.
- Authenticated hosted `/forge` console backed by the shared R2 queue, so human
  or AI-created tasks from either machine use the same skill, asset, review,
  and final-render state.
- Guided app-demo capture with a button-driven permission/record/preview/
  approve workflow, genuine same-session presenter synchronization, a
  versioned Film style, and deterministic 720×1280 preview / 1080×1920 final
  encoding on the Mac.
- External Mashup media inspection with approved-root, schema, approval, size,
  SHA-256, provenance, and rights validation and no runtime source dependency.
- Robust heterogeneous-source ingestion that reports isolated unreadable
  files, fails when no source is usable, and prevents the first low-resolution
  source from determining the complete render format.

## Work queue

Open work is tracked only in [GitHub Issues](https://github.com/sass-maker/reel-pipeline/issues).
An open issue is a to-do, a linked pull request is in progress, and merge plus
issue closure makes the work done.
