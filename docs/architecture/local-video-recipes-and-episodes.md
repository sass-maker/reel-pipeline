# Local Video Workflow Recipes and Episode Manifests

Canonical contract reference for the two schemas that describe reproducible
local video generation: the **workflow recipe registry** (which runtime, which
weights, which adjustable inputs) and the **episode manifest** (a multi-shot
plan, its resumable run, and its deterministic assembly).

Engine facts live in [`engines.md`](./engines.md). The operator-facing profile
and theme controls live in
[`../product/content-studio.md`](../product/content-studio.md). This page owns
only the data contracts and their guards.

Code: `src/local-video-workflow-recipes.js`, `config/local-video-workflow-recipes.json`,
`src/local-video-episode.js`, `src/studio/local-video-executors.js`,
`src/adapters/comfy-local.js`, `src/adapters/ltx-mlx-final.js`.

## Standing boundary

Every local generative lane is **parked** under the cost-capped media boundary.
Both shipped recipes carry a `blocker`, `autoEligible` is `false` on both, and
`POST /studio/episodes/:id/render` fails closed with the generative-media
blocker. The contracts below are therefore live and validated, but no automatic
execution path reaches a model on this host. Nothing here authorizes a paid
provider call.

## Recipe registry — `fleet.local-video-workflow-recipes.v1`

`config/local-video-workflow-recipes.json` is the whole registry. Every read
path — listing, summarizing, resolving a run, recovering a graph from an MP4 —
calls `validateWorkflowRecipeRegistry` first, so an invalid registry throws on
the first read rather than partway through a render.

Registry fields:

| Field | Contract |
| --- | --- |
| `$schema` | must equal `fleet.local-video-workflow-recipes.v1` |
| `version` | integer |
| `allowedComfyNodes` | non-empty allowlist of Comfy `class_type` values |
| `recipes` | non-empty, unique `id` per entry |

Per-recipe fields:

| Field | Contract |
| --- | --- |
| `id`, `version` | unique string; positive integer |
| `engine` | `comfy-local` or `local-video-forge` |
| `modelProfileId` | joins the recipe to a Studio model profile |
| `qualityLane` | `preview`, `final`, or `specialist` |
| `autoEligible` | boolean; may not be `true` when `blocker` is set |
| `source` | `{ url, revision }`, both required |
| `runtime` | `{ path, revision }`, both required |
| `models[]` | `{ id, repository, revision, path, license }` required; `sha256` optional but must be 64 hex chars when present |
| `inputs` | object of input definitions (below) |
| `graph` | optional Comfy prompt graph; validated against `allowedComfyNodes` when the engine is `comfy-local` |
| `seedPolicy` | recorded, e.g. `fixed-per-shot` |
| `resourceEnvelope` | **must** be `maxDiskPercent: 85`, `maxRamPercent: 90`, `serial: true` — any other value throws |
| `proofReceipt` | path to the receipt that proved the lane |
| `blocker` | human-readable reason the lane is not runnable |

Input definitions accept `type` (`string`, `number`, `integer`, `enum`,
`path`), `required`, `default`, `min`/`max`, `minLength`/`maxLength`,
`multipleOf`, `multipleOfOffset`, `values`, and an optional
`target: { node, field, basenameOnly }` that says which graph node field the
value patches.

### Shipped recipes

| Recipe | Engine | Lane | Blocker |
| --- | --- | --- | --- |
| `ltx-2.3-mlx-q4-final` | `local-video-forge` | `final` | local final-video generation is parked |
| `ltx-2b-comfy-i2v-preview` | `comfy-local` | `preview` | local model previews are parked |

There is no MiniMax H3 recipe and no Wan Remix recipe. Both were removed from
the active registries by the cost-capped generation boundary
(issue #9), and `test/studio-model-options.test.js` plus
`test/studio-local-video-executors.test.js` assert that they stay removed.

### Reads and runs

- `listLocalVideoWorkflowRecipes({ rootDir })` returns each recipe plus
  `graphSha256` and a `readiness` object: `{ ready, state, blocker, missing,
  unhashed }`. A recipe is `blocked` when it declares a `blocker`, when the
  runtime or any model path is absent on disk, or when a model has no captured
  hash.
- `summarizeLocalVideoWorkflowRecipes()` drops the graph and flattens
  `adjustableInputs` for UI use.
- `verifyWorkflowRecipeFiles(recipe)` re-hashes each model file and reports
  `missing model`, `model hash not captured`, or `stale model hash`. It never
  repairs, downloads, or installs.

### Resolved run — `fleet.local-video-workflow-run.v1`

`resolveLocalVideoWorkflowRun(recipeId, inputs)` refuses unknown input names,
normalizes every declared input against its definition, patches the graph
through each input's `target`, and returns:

```
{ schema, recipeId, recipeVersion, engine, modelProfileId, qualityLane,
  inputs, graph, graphSha256, inputSignature,
  provenance: { source, runtime, models }, resourceEnvelope }
```

`inputSignature` is a `sha256` over the recipe id and version, engine, quality
lane, runtime revision, each model's `{ id, revision, sha256 }`, the normalized
inputs, and `graphSha256`. Identical inputs therefore produce an identical
signature, which is what makes shot reuse safe.

Resolution throws on a blocked recipe unless the caller passes
`allowBlocked: true`. Because both shipped recipes are blocked, no ordinary
Studio path resolves a run today.

### Comfy guards

- `validateComfyGraph` rejects any node whose `class_type` is outside
  `allowedComfyNodes` and any node without an `inputs` object. Arbitrary
  custom nodes cannot enter through a recipe or through an imported MP4.
- `extractComfyPromptFromMp4` reads embedded `format_tags=prompt` metadata with
  `ffprobe` and re-validates the recovered graph against the same allowlist
  before returning it.
- `src/adapters/comfy-local.js` additionally probes the live Comfy instance
  (`/system_stats`, `/object_info`) and reports a blocker when the running
  install is missing a node class or does not expose a named checkpoint, CLIP,
  VAE, or UNet file. Execution is serialized through one tail promise, matching
  `resourceEnvelope.serial`.
- Recipe selection is closed: `selectWorkflowRecipe` accepts an explicit
  `workflowRecipeId`, maps `ltx-2b-comfy-preview` to the preview recipe, allows
  `auto` and `ltx-2.3-mlx-q4` to fall through to the final recipe, and throws
  `unsupported local video model profile` for anything else.

## Episode manifest — `fleet.local-video-episode.v1`

`normalizeLocalEpisode` is the only door into the episode contract. Guards:

- `targetDurationSeconds` must be 120–180.
- Shots are 1–8 seconds each, and the summed shot duration must match the
  target within 0.25s.
- `createEpisodeDraft` derives shot count from `targetDurationSeconds /
  shotDurationSeconds` and requires 20–60 shots.
- Shot ids and cast `characterId`s must be unique. A shot may only reference
  declared cast; dialogue may only reference declared shots and cast.
- Each shot carries `previewRecipeId` (default `ltx-2b-comfy-i2v-preview`) and
  `finalRecipeId` (default `ltx-2.3-mlx-q4-final`), a bounded `seed`, and
  `continuity` of `strict` or `flexible`.
- `assembly` defaults to 1080×1920 at 24fps, `libx264` / `aac` / `192k`, with
  bounded overrides.

`resolveEpisodeCast(episode, characterStore)` compiles each cast member from
the character directory, hashes any override reference image, and throws when a
`strict`-continuity shot has no approved reference for one of its characters.
Identity is evidence, not a prompt string.

### Resumable run — `fleet.local-video-episode-run.v1`

`renderEpisodeShots` writes `episode-run.json` after **every** shot, so an
interrupted run resumes. Per shot it computes
`episodeShotSignature(shot, cast, { phase, referenceImageSha256 })` — a hash
over the normalized shot, the resolved cast identity and reference hashes, the
reference image hash, the phase, and the phase's recipe id. Then:

- a prior shot with the same signature, `reviewState: 'accepted'`, and a video
  still on disk is **reused**;
- a shot outside `onlyShotIds` is carried forward or recorded `pending`;
- otherwise `executeShot` is called. It is a required injected adapter — the
  module never picks a renderer itself, and it throws when a shot returns no
  video.

Run `status` is `shots-accepted` only when every shot is `accepted`, otherwise
`needs-review`. `setEpisodeShotReview` accepts `needs-review`, `accepted`, or
`rejected` and rewrites the receipt.

### Assembly — `fleet.local-video-episode-assembly.v1`

`assembleLocalEpisode(run)` fails closed unless the run uses the run schema, is
in the `final` phase, has at least one shot, has every shot `accepted`, and
every shot video still exists on disk.

Soundtrack rights are enforced before any ffmpeg call:
`procedural-draft` music is rejected outright, `platform-sound` cannot be
embedded, `owned-local` requires `rightsEvidence`, and `generated` requires a
selected variation with both an audio path and runtime evidence.

Assembly then concatenates the shots, pads to the manifest frame, renders
dialogue through the injected `voiceRenderer` (default Kokoro, positioned from
the shot timeline plus each line's offset), mixes music and voices with
`loudnorm=I=-16:TP=-1.5:LRA=11`, and writes `assembly-receipt.json` containing
the timeline, shots, dialogue, soundtrack, mix filter, assembly settings, and a
`sha256` plus byte size for the output video, the soundtrack, every shot, and
every dialogue asset. The receipt ships as `reviewState: 'needs-review'`.

Kokoro is not installed on every host; without it, dialogue rendering fails
rather than substituting silence.

## Studio endpoints

Store: `tmp/studio/episodes/<id>/` holding `episode.json`,
`episode-run.json`, and `assembly-receipt.json`.

| Method | Route | Behaviour |
| --- | --- | --- |
| `GET` | `/studio/episodes` | list stored episodes with run and assembly state |
| `POST` | `/studio/episodes` | `createEpisodeDraft` then save; defaults soundtrack to `procedural-draft` |
| `GET` | `/studio/episodes/:id` | load one episode, run, and assembly receipt |
| `PATCH` | `/studio/episodes/:id` | re-normalize and save; `id` is immutable |
| `POST` | `/studio/episodes/:id/render` | requires `confirm: true`, then **fails closed** on the generative-media blocker |
| `POST` | `/studio/episodes/:id/shots/:shotId/review` | set one shot review state and rewrite the run receipt |
| `POST` | `/studio/episodes/:id/assemble` | requires `confirm: true` and an existing run; runs deterministic assembly |

## Tests

`test/local-video-workflow-recipes.test.js`,
`test/local-video-episode.test.js`, `test/studio-episodes-api.test.js`,
`test/studio-episode-sample.test.js`, and `test/comfy-local.test.js` cover the
registry guards, the resource envelope, the node allowlist, MP4 prompt
recovery, signature-based reuse, soundtrack rights refusal, the two-minute
episode canary, and the parked render endpoint.
