# Cloudflare 部署

[English](README.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/iola1999/uurc-web)

本部署方式使用 Cloudflare Worker + Durable Object，不依赖 Cloudflare Containers。

## Cloudflare 运行内容

- 来自 `frontend/dist` 的静态前端
- `/api/proxy/uu` UU API 转发
- `/api/health`
- 基于 Durable Object 的 `/api/remote/signal/*` 状态、事件、诊断和错误回报接口

Worker 版 live signal gateway 已在 Durable Object 内实现，通过 Worker `fetch(..., Upgrade: websocket)` 建立上游 Engine.IO/Socket.IO WebSocket。

## 要求

- Cloudflare Workers 账号，并已启用 Durable Objects。
- 部署/构建 token 需要 `Workers Scripts Edit` 权限。

## 部署

```bash
npx wrangler login
npm run deploy:cloudflare
```

本地 Cloudflare runtime 预览：

```bash
npm run dev:cloudflare
```

## 说明

- 配置位于 `wrangler.jsonc`。
- 部署流程会执行 `npm run build:cloudflare`，构建 `shared` 和 `frontend`。
