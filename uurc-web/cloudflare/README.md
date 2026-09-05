# Cloudflare Deploy

[中文](README.zh-CN.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/iola1999/uurc-web)

This deployment mode uses a Cloudflare Worker plus a Durable Object. It does not depend on Cloudflare Containers.

## What Runs On Cloudflare

- Static frontend from `frontend/dist`
- `/api/proxy/uu` UU API forwarding
- `/api/health`
- Durable Object-backed `/api/remote/signal/*` status, event, diagnostics, and error-reporting endpoints

The live signal gateway is implemented in the Worker Durable Object. It uses an upstream Engine.IO/Socket.IO WebSocket opened with Worker `fetch(..., Upgrade: websocket)`.

## Requirements

- Cloudflare Workers account with Durable Objects enabled.
- Deploy/build token with `Workers Scripts Edit`.

## Deploy

```bash
npx wrangler login
npm run deploy:cloudflare
```

For local Cloudflare runtime preview:

```bash
npm run dev:cloudflare
```

## Notes

- Configuration lives in `wrangler.jsonc`.
- The deploy flow runs `npm run build:cloudflare`, which builds `shared` and `frontend`.
