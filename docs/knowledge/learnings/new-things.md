# New things to learn — reel-pipeline

Novel AI + video tech stacked in one pipeline: Workers orchestrating Python engines, Gemini-driven editing, fal GPU bursts, and TTS dubbing — all glued by FFmpeg.

---

## Workers → Long-Running Python Job Interop
- What: CF Workers default to a 30 s CPU limit (max 5 min on paid plan); Python video renders take minutes — solved via async job queue (poll `/tasks/:id`) over HTTP to a Docker/local Python server.
- Why here: TBD
- Gotcha (from code): The Worker itself (`src/worker/index.js`) only does synchronous R2 ops and returns immediately; the blocking poll loop (`src/pipeline.js:195-204`) runs in the Node server, not the Worker. If that loop were ever ported into a Worker handler without Durable Objects, the 30 s default would silently kill it mid-poll.
- Source: https://developers.cloudflare.com/workers/platform/limits/

## Engine checkout lesson
- What: Third-party render-engine submodules added setup and drift without improving the working local product; the engine checkouts were removed on 2026-08-01.
- Why here: Repository-owned adapters and explicit specialized handoffs are easier to test and keep truthful.
- Gotcha: A dropdown option is not a capability when its backing checkout is absent.
- Source: https://git-scm.com/book/en/v2/Git-Tools-Submodules

## Gemini for Vision + Dynamic FFmpeg Generation
- What: Gemini 2.0 Flash analyzes video frames to detect viral moments AND generates FFmpeg filter strings on the fly (`editor.py` in OpenShorts).
- Why here: TBD
- Gotcha (from code): `editor.py:279-370` runs a best-effort sanitizer (`_sanitize_filter_string`) and a zoompan size enforcer before calling FFmpeg, but the filter string still goes straight to `-vf` via `subprocess.run`. A hallucinated unknown filter name (e.g. `colorfix`) crashes FFmpeg with a non-zero exit and raises `CalledProcessError` — no silent fallback to the original clip.
- Source: https://ai.google.dev/api/generate-content

## fal.ai Latency/Pricing Model
- What: fal.ai is a serverless GPU inference platform — billing is per-second of execution for serverless endpoints, or per-hour fixed rate for dedicated Compute; a multi-layer caching system reduces cold starts over time.
- Why here: TBD
- Gotcha: Cold start latency is real but not billed separately — you pay for execution seconds only while a runner is active; setting `min_concurrency > 0` keeps runners warm at the cost of idle GPU time.
- Source: https://fal.ai/docs

## ElevenLabs Dubbing API
- What: ElevenLabs `/v1/dubbing` endpoint translates and re-voices a video in 30+ languages, preserving the original speaker's emotion and timing; the result is polled until ready, then fetched as a separate audio track.
- Why here: TBD
- Gotcha: Dubbing is async — `elevenlabs.dubbing.create()` returns a `dubbing_id` and you must poll status before downloading; forgetting the poll step yields a 404 on the audio fetch.
- Source: https://elevenlabs.io/docs/api-reference/dubbing

## MoneyPrinterTurbo — historical evaluation
- What: MIT-licensed Python engine that chains Edge TTS → stock footage fetch → FFmpeg/MoviePy compose → subtitle burn in one `POST /api/v1/videos` call; no GPU required.
- Why here: TBD
- Gotcha: The integration and submodule were removed on 2026-08-01; this note is retained only as evaluation history.
- Source: https://github.com/harry0703/MoneyPrinterTurbo

## Remotion (React → Video)
- What: Remotion renders React component trees frame-by-frame to MP4 using headless Chromium; every animation is expressed as React state over time, making video edits feel like UI development.
- Why here: TBD
- Gotcha: Remotion Lambda cold renders spawn a Chromium process per composition; local preview is cheap but cloud rendering bills per Chromium-second — a missing `cancelRender` on abort leaves orphaned Lambda invocations.
- Source: https://remotion.dev/docs

## MoviePy (Python Video Editing)
- What: Python library wrapping FFmpeg with a clip/effect/composite object model; evaluated through the former MoneyPrinterTurbo integration.
- Why here: TBD
- Gotcha: MoviePy major versions have incompatible effect APIs; pin versions when evaluating it independently.
- Source: https://zulko.github.io/moviepy/

## FFmpeg Compositing Basics
- What: FFmpeg's `filter_complex` graph lets you layer, crop, scale, and subtitle multiple video/audio streams in a single pass without temp files.
- Why here: TBD
- Source: https://ffmpeg.org/ffmpeg-filters.html

## OpenShorts — UGC + Subject Tracking
- What: OpenShorts adds MediaPipe face detection + YOLOv8 fallback to auto-crop vertical 9:16 from wide footage, with a "Heavy Tripod" stabilizer to prevent jitter.
- Why here: TBD
- Gotcha (from code): Adapter deliberately does not invoke UGC/fal/ElevenLabs/autopost — it writes a guarded job spec only to avoid accidental paid-service calls.
- Source: https://github.com/JonasLoos/openshorts

## R2 for Asset Hosting
- What: Cloudflare R2 is S3-compatible object storage; MP4s, thumbnails, captions, and manifests land here before a receipt or Postiz draft handoff is created.
- Why here: TBD
- Source: https://developers.cloudflare.com/r2/

## Gemini Viral Moment Detection
- What: Gemini identifies 3–15 timestamped "viral moments" (15–60 s each) from a transcript + frames, returning structured JSON used to slice clips with FFmpeg.
- Why here: TBD
- Source: https://ai.google.dev/api/generate-content

## Gemini File API — Video Upload + Processing Poll
- What: Before Gemini can analyze a video it must be uploaded via `client.files.upload()` and then polled until `file.state == "ACTIVE"`; only then can the file reference be passed to `generate_content`.
- Why here: TBD
- Gotcha (from code): `editor.py:30-38` polls in a blocking `while True` with a 2 s sleep — there is no timeout guard, so a video stuck in `PROCESSING` state hangs the entire render worker indefinitely.
- Source: https://ai.google.dev/gemini-api/docs/files
