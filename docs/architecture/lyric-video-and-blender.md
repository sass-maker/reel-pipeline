# Lyric Video and Blender

Marketing Studio supports a `lyric-video` workflow for operator-supplied,
time-aligned lyrics and approved local audio. It can render literal visual
plates natively or through Blender 5.2, then uses the existing local compositor
for synchronized text, attribution, captions, and audio.

## Inputs and rights

The operator must provide:

- a local WAV, MP3, M4A, AAC, or FLAC audio file beneath an allowed project
  root;
- exact timed lyrics as LRC, SRT, or structured cues;
- separate composition/lyric and master-recording rights postures;
- a rights-evidence note or URL; and
- complete attribution.

Rendering fails closed unless the composition is asserted as owned, licensed,
or public domain and the recording is asserted as owned, licensed, or an
original recording. Attribution is retained in the artifact but never counts
as permission. Studio does not find, scrape, transcribe, paraphrase, or
generate missing lyrics.

Each normalized cue preserves its text verbatim and maps one-to-one to a
literal scene record. The record contains concrete objects, actions,
environment, camera, palette, and provenance, so reviewers can inspect the
visual interpretation without changing the lyric.

## Blender boundary

Blender is an optional external runtime, not a Node dependency. Install the
compatible macOS build with:

```bash
brew install --cask blender
```

Studio and the render-mode smoke require Blender `5.2.x`. The adapter invokes
Blender without a shell using background, factory-startup, and disabled
auto-execution flags. It runs only the repository-owned
`scripts/blender/literal_scene_builder.py` against validated JSON.

The manifest allowlists primitives, materials, lights, cameras, palettes,
dimensions, samples, and output paths beneath the run directory. The adapter
rejects arbitrary Python, add-ons, uploaded `.blend` files, and escaping paths.
Its receipt records the Blender version, safe command posture, normalized
manifest hash, render duration, and output hashes.

Blender produces silent visual plates. The lyric compositor remains
authoritative for exact timed text, readability treatment, safe areas,
reduced-motion behavior, captions, attribution, and approved audio.

## Local canary

Run the recognizable rights-safe canary with:

```bash
npm run canary:lyric
```

It uses the public-domain first verse and melody commonly known as “Twinkle,
Twinkle, Little Star,” synthesizes a new local instrumental recording, renders
four literal Blender scenes, and writes the MP4 plus captions, scene plan,
rights record, quality evidence, hashes, and production manifest beneath
`artifacts/lyric-video-canary/`. It downloads or commits no commercial
recording.

## Review and distribution

Productions shows the playable artifact, exact cue count, renderer provenance,
composition posture, recording posture, evidence, attribution, and timed-text
format. The operator must explicitly review and accept quality.

Postiz remains the only downstream draft, future-scheduling, publication-state,
credential, and analytics owner. Studio rechecks all existing source, creative,
quality, artifact, and public-URL requirements plus the lyric rights and
literal-scene evidence. It does not publish immediately.
