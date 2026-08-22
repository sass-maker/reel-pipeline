# Video Maker

Video Maker is Reel Pipeline's standalone product surface for turning a
natural-language request or standing automation policy into an editable video
brief, routing that brief to the real production workflow, reviewing the
result, and preparing an evidence-gated Postiz draft or exact future schedule.
The original Content Studio tools remain available
under the **Tools** view: ideation, metadata, scripts, brand voice, keyword
research, transcripts, thumbnail concepts, and the saved-ideas manager.

Every tool works offline at $0 via deterministic templates, and upgrades to
LLM output through a provider chain tried in order (override with
`STUDIO_LLM_PROVIDERS`):

1. **free-ai** — the fleet's free gateway; set `FREE_AI_API_KEY` (optional
   `FREE_AI_BASE_URL`, `FREE_AI_MODEL` defaults to `auto`,
   `FREE_AI_PROJECT_ID` defaults to `reel-pipeline`).
2. **codex** — the local Codex CLI on PATH, run non-interactively in a
   read-only sandbox (your ChatGPT subscription; optional
   `STUDIO_CODEX_MODEL`). Slower per call than HTTP providers.
3. **deepseek** — `DEEPSEEK_API_KEY` (optional `DEEPSEEK_BASE_URL` /
   `DEEPSEEK_MODEL` for any OpenAI-compatible endpoint).

Results carry `source: "llm"` (plus the `provider` that answered) or
`source: "template"`. A provider failure falls through to the next, then to
templates — never an error.

For the topic→video→post workflow that consumes these tools, see
[faceless-workflow.md](./faceless-workflow.md).

## Operator workflow

The primary operator entry is Reel Pipeline's `/studio` route. Start Reel
Pipeline with `npm run dev`, then open the Studio URL printed by the server
(port 4317 by default). External consoles may link into this product, but it is not
the owner of the creation experience. Mashup remains a CLI-only editorial
capability and is intentionally absent from every web UI.

1. **Create** — the **Ask Me** lane. Describe a video in plain language, then keep refining the same
   brief with follow-ups such as “make it 30 seconds,” “switch to Instagram,”
   or “turn this into an app demo.” Every turn updates visible normalized
   `fleet.marketing-studio-brief.v1` fields. Nothing renders until the operator
   chooses the named action.
2. **History** — revisit every saved production with its original prompt,
   executed workflow, reviewable artifact, receipt, and a route back to Create.
   The shared production queue and automation lanes remain available under
   **Production operations**.
3. **Recipes** — browse bounded result formats from the existing recipe
   registry and use one as a starting point in Create.
4. **Workflows** — inspect the registered production archetypes and their
   models, steps, readiness, and constraints before reusing them.
5. **Distribute** — prove source, claim, destination, rights, creative
   approval, quality, render, and stable public media before creating an
   unscheduled Postiz draft.
6. **Tools** — use every pre-existing Content Studio form, ideas manager, and
   legacy render view without changing their API routes.

Briefs persist to ignored local state at `tmp/studio/briefs.json` by default.
Changing the video kind clears incompatible media and distribution evidence.
Every field edit or conversational refinement increments the brief revision.
Conversation cannot approve rights, creative review, quality, distribution,
scheduling, or publication.

## Standing-policy automation

`config/studio-automation.json` is the versioned, secret-free authority for
unattended work. The initial policies cover High Signal daily source briefs,
Significant Hobbies weekly editorial posts, and major maintained-project
changelog events. High Signal and Significant Hobbies reuse their existing
content-package extractors. Changelog discovery reads the canonical Fleet
project catalog and durable `PROJECT_STATUS.md` Timeline, rejects ambiguous or
maintenance-only entries, and preserves the same-origin public `/changelog`
URL as evidence.

Every source revision and channel gets a stable idempotency key. Reruns reuse
the existing Idea, Marketing Brief, render evidence, stable-media evidence,
and Postiz receipt. A policy ranks only its allowed recipes within its spend
ceiling, records every bounded attempt, and stops with a named recovery action
when rendering, quality, stable media, or Postiz readiness is missing.

Dry run is the default:

```bash
npm run factory -- autopilot --policy high-signal-daily --dry-run --count 1
npm run factory -- autopilot --all --dry-run
```

Execution requires `--execute`. It may render, advance through the configured
artifact publisher, and create the policy-authorized Postiz draft or future
schedule. It never publishes immediately or contacts a social provider
directly.

## AI operator discovery

Future AI operators use one read-only arsenal contract rather than reconciling
the planner, Tools view, render modes, and automation policies independently:

```bash
npm run factory -- arsenal
npm run factory -- arsenal --spend-ceiling local-compute --readiness ready
```

`GET /studio/arsenal` returns the same schema and accepts `recipe`, `channel`,
`owner`, `spendCeiling`, and `readiness` filters. Inspection never creates a
brief, renders, uploads, or contacts Postiz. See
[`studio-agent-arsenal.md`](../architecture/studio-agent-arsenal.md) for the
canonical registry boundary and the agent execution contract.

## Production routing

Marketing Studio owns intent and lifecycle state; it does not duplicate the
specialized runtimes:

| Video kind | Runtime owner | Studio action |
| --- | --- | --- |
| Faceless lesson | Marketing Studio | Render the confirmed brief locally with mock, Kokoro, or a registered local recipe such as Night Out |
| Brand reel | Anonymous Brand Reel | Continue to `/` with the public canonical website source prefilled |
| Guided app demo | Forge | Continue to the authenticated Forge host with the brief id, project, workflow kind, and public source prefilled after source rights are approved |
| Coherent film | Forge | Continue to the authenticated Forge host with safe project/source context and complete Film-style inputs there |
| Podcast short | Editorial | Continue to the configured editorial service with source media |

Continuation states are explicit: `ready`, `needs-input`, `external-step`, or
`blocked`. A specialized workflow is never represented as locally executed
when its actual runtime lives elsewhere. Continuation URLs carry only the
Studio brief id and safe public metadata; unpublished creative copy, approvals,
credentials, and private media never enter the URL.

### Night Out carousel

`night-out-carousel--default` is a local final-video recipe in the existing
maker. The prompt-first path resolves a theme and a compatible ready model,
generates four cards with the pinned WAI Illustrious v17 checkpoint through
`stable-diffusion.cpp`, then renders a reveal hook, a bouncy carousel, an end
prompt, and an original procedural funk bed. The older approved-manifest path
remains available when the operator wants to provide exact images.

The optional Theme, Model, and Content scope controls appear only for eligible
recipes. Auto selects only a compatible, locally ready profile explicitly
approved for Auto; obscure community checkpoints require an explicit operator
selection even when their files are present. Registry reads, selection, brief
saves, and render requests never install or download a runtime. The unproven Wan
Remix and MiniMax H3 profiles were removed from the registry under the
cost-capped generation boundary, so `auto`, `wai-illustrious-v17-sdcpp`,
`ltx-2.3-mlx-q4`, and `ltx-2b-comfy-preview` are the complete profile list. The
model profile, checkpoint hash, runtime revision, sampling settings, theme
posture, and content scope are saved in the render receipt.

`general` excludes nudity and explicit content. `mature-enabled` permits prompts
for fictional consenting adults age 25 or older while retaining hard negative
constraints for minors, uncertain age, non-consensual content, and real-person
likeness. Named-IP themes are private concepts unless separate commercial-rights
evidence is supplied; distribution continues to fail closed without it.

The manifest uses `fleet.night-out-assets.v1`:

```json
{
  "schema": "fleet.night-out-assets.v1",
  "theme": { "id": "party-worlds", "label": "Party worlds" },
  "sourcePosture": "original",
  "rightsEvidence": "Operator review note",
  "images": [
    { "id": "scene-1", "label": "First stop", "path": "assets/01.png" },
    { "id": "scene-2", "label": "Second stop", "path": "assets/02.png" },
    { "id": "scene-3", "label": "Third stop", "path": "assets/03.png" },
    { "id": "scene-4", "label": "Final stop", "path": "assets/04.png" }
  ]
}
```

For the approved-manifest path, relative image paths resolve from the manifest directory. The renderer rejects
remote URLs, unsupported image types, paths outside configured local roots,
fewer than four or more than eight images, and missing rights evidence before
Chrome or FFmpeg starts. Every real render writes image hashes, source posture,
rights evidence, frame timing, audio provenance, and a review-required state to
`fleet.night-out-render.v1`; publication remains behind the normal Postiz gates.

## Postiz boundary

Marketing Studio can prepare the existing approved content-package and media
receipt contracts, then call the existing Postiz adapter to create a draft.
Preparation is local and performs no network call. Draft creation requires an
explicit approver and a stable public HTTPS video URL.

The Studio accepts only an unscheduled draft or an exact future schedule after
all evidence gates pass. It rejects immediate-publication inputs and duplicate
receipts. Postiz remains the only calendar, durable scheduler, publisher,
provider-integration, and analytics surface.

## Commands

All tools run through one CLI and print JSON:

```bash
npm run studio -- <command> [flags]
```

| Command | What it does |
| --- | --- |
| `ideas --niche "home espresso" --count 10` | Video ideas: title, angle, hook, format |
| `niche --niche "home espresso"` | Sub-niche suggestions with audience + competition |
| `channel --niche "home espresso"` | Channel name suggestions |
| `titles --topic "latte art" --count 5` | Title variants (≤100 chars) |
| `description --topic "latte art" --hook "..." --cta "..."` | Description with hook, chapters block, CTA, hashtags |
| `tags --topic "latte art" --niche "coffee"` | Tags deduped and fit to YouTube's 500-char budget |
| `organize --tags "tag1,tag2,..."` | Clean/rank an existing tag list into the budget |
| `script --topic "latte art" --duration 60` | Scene-structured script (see below) |
| `voice --samples a.txt,b.txt` | Brand-voice profile from sample transcripts |
| `keywords --seed "latte art"` | Keyword research via free suggest endpoints |
| `transcript --url <youtube-url>` | Fetch + format public captions |
| `thumbnails --topic "latte art" --render tmp/thumbs` | Thumbnail concepts, optional HTML previews |
| `save / list / status` | Ideas manager (see below) |

## Scripts

`script` targets 30 seconds to 20 minutes, scaling narration to ~150 words per
minute. Output is scene-structured (`label`, `narration`, `brollQuery`,
`onScreenText`, `durationSeconds`) — the same shape the lesson pipeline uses,
so it converts directly to a VideoBrief. Scripts default to a single narration
voice; per-scene rotation is opt-in (see the workflow doc).

Extra inputs:

- `--article file.txt` — article-to-script: extracts key points and adapts
  them; also works as "YouTube transcript → new script" when you feed it a
  transcript from the `transcript` command.
- `--inspiration file.txt` — pacing/structure reference (wording never copied).
- `--voice-profile profile.json` — output of `voice`, shapes tone and phrasing.

## Brand voice

`voice` measures sentence length, exclamation/question rates, contraction
usage, repeated phrases, and top vocabulary, then (LLM mode) refines that into
tone descriptors and style notes. Save the JSON and pass it to `script` or
`faceless` runs for consistent channel voice.

## Keyword research

Uses public autocomplete suggest endpoints (no API key): the seed plus
question-style prefixes (`how to`, `what is`, `why`, `best`, `vs`), ranked to
favor long-tail, intent-heavy phrases. Offline or blocked? It returns template
variants instead of failing.

## Transcripts

`transcript` pulls the watch page, finds public caption tracks (English
preferred), and returns a cleaned, paragraph-formatted transcript. Videos
without public captions return `{ "available": false, "reason": ... }` —
this path scrapes public data and may break if YouTube changes its markup;
it is isolated in `src/studio/transcript.js`.

## Thumbnails

`thumbnails` produces concepts (composition, ≤4-word overlay, emotion, color
pair). `--render <dir>` also writes 1280×720 HTML previews you can screenshot
— same spirit as the html-composition render mode, no browser dependency.

## Ideas manager

Saved ideas live in a JSON store (`tmp/studio/ideas.json` by default,
`STUDIO_IDEAS_FILE` to override) with statuses `new → scripted → rendered →
posted`:

```bash
npm run studio -- save --title "Latte art in 60s" --niche coffee
npm run studio -- list --status new
npm run studio -- status --id idea_... --to scripted
```

The faceless workflow saves each rendered topic here automatically.

## Verification

```bash
npm run smoke:studio   # offline smoke: every tool + mock workflow (13 checks)
node --test test/studio-server.test.js test/studio-workflow.test.js \
  test/marketing-studio-briefs.test.js \
  test/marketing-studio-distribution.test.js
```

Module map:
`src/studio/{api,ui,autopilot,autopilot-sources,automation-policy,briefs,capabilities,distribution,llm,ideas,metadata,script,brand-voice,keywords,transcript,thumbnails,idea-store,workflow}.js`.
