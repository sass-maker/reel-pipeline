# Development Setup

## Install

```bash
git clone --recurse-submodules <repo-url>
npm ci
npm test
```

Requirements: Node 20+, Rust stable, FFmpeg/ffprobe, and Playwright Chromium
for browser-backed render paths. Optional local applications have their own
prerequisites.

## Environment

Never commit `.env` files or credentials.

- `REEL_INTERNAL_TOKEN` protects internal Worker routes.
- `GROK_VIDEO_ASSET_DIR` points to approved local MP4 assets.
- `POSTIZ_BASE_URL` points to the self-hosted Postiz instance.
- `POSTIZ_API_KEY` authorizes Postiz API requests.
- `POSTIZ_INTEGRATIONS_CONFIG` optionally selects the project/channel mapping.

Real Postiz integration IDs belong in the ignored
`config/postiz-integrations.json`, copied from the committed example.

## Run

```bash
npm run dev
curl -sS http://127.0.0.1:4317/health
```

Use `/`, `/review`, and `/studio` for the local browser surfaces. The hosted
Worker also exposes the authenticated Local Video Forge operator console at
`/forge`. See
[`commands.md`](./commands.md) and [`testing.md`](./testing.md).
