# External Mashup Media

Podcast and archive planning is owned by the independent
[`Mashup`](https://github.com/sass-maker/mashup) product. It is not a Reel Pipeline
subsystem, route, or hidden subprocess.

## Boundary

```text
owned / licensed / public-domain source archive
  → Mashup planning, approval, and rendering
  → completed MP4 + fleet.mashup-media-receipt.v1
  → Reel Pipeline receipt inspection
  → optional use as ordinary approved source media
```

The receipt retains artifact hashes, duration, dimensions, captions, source
provenance, rights references, recipe identity, model/runtime revisions,
approval, and validation evidence. Reel Pipeline does not read Mashup's EDL,
SQLite database, caches, models, or workdir.

## Inspect a handoff

```bash
npm run inspect:mashup-media -- \
  --receipt /approved/root/result.receipt.json \
  --approved-root /approved/root
```

Inspection fails when the schema is unsupported, approval is missing, the
artifact is outside the approved root, or its size or SHA-256 hash differs.
The command never renders media.
