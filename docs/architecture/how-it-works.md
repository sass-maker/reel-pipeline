---
title: "How a reel moves through the pipeline"
description: "The current generation and Postiz handoff path."
---

# How a reel moves through the pipeline

## 1. Approved input

A source project or operator supplies an approved content package, VideoBrief,
or source-backed podcast edit. Podcast source archives can first pass through
the incorporated editorial planner. The input carries claim or source
evidence, channel intent, and approval evidence.

## 2. Normalize

`src/video-brief.js`, `reel/src/brief.rs`, and `src/podcast-edit.js` reject
malformed or generic input before a renderer starts. Content packages have a
separate versioned contract in Content Factory.

## 3. Render

The selected adapter produces a local or remote artifact. Podcast edits use
the preserved Python multi-clip renderer behind a Node adapter. Other heavy
media work stays in Node/external tools such as Chromium and FFmpeg; Rust is
used for the production Worker watcher and render process control.

## 4. Prove the artifact

Completed renders are hashed and recorded in an immutable artifact manifest.
The quality/review stage records whether the artifact is ready, needs review,
or is rejected.

## 5. Produce a media receipt

The content-package flow binds the approved input to its generated artifact.
This keeps source claims, renderer output, and downstream handoff traceable.

## 6. Create a Postiz draft

`src/postiz-client.js` resolves the configured Postiz integration, uploads the
media when required, and creates a draft. It does not choose a publish time.

## 7. Review and publish outside Reel Pipeline

The operator reviews copy, media, destination, and timing in Postiz. Postiz
then owns scheduling, provider publication, and provider metrics. This avoids a
second social-account or posting system in Fleet.

See [`overview.md`](./overview.md),
[`render-modes.md`](./render-modes.md), and
[`../operations/postiz-handoff.md`](../operations/postiz-handoff.md).
