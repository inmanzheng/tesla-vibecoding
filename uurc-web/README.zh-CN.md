# UU Remote Web

[English](README.md)

UU 远程网页主控端。

## 功能

- 短信登录
- 账号凭证导入导出
- 设备列表
- 远控会话
- 账号管理
- 本地 UU API 和信令网关

## Docker

```bash
docker run -d \
  --name uurc-web \
  -p 8787:8787 \
  iola1999/uurc-web:latest
```

或者：

```bash
curl -O https://raw.githubusercontent.com/iola1999/uurc-web/main/compose.yml
docker compose up -d
```

## Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/iola1999/uurc-web)

支持 Cloudflare Worker + Durable Object 部署。

```bash
npx wrangler login
npm run deploy:cloudflare
```

部署要求和注意事项见 [cloudflare/README.zh-CN.md](cloudflare/README.zh-CN.md)。

## 开发

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
docker build -t iola1999/uurc-web:local .
```

## 致谢

Cloudflare 部署架构参考并致谢 [AssppWeb](https://github.com/Lakr233/AssppWeb)，尤其是 Cloudflare 部署入口体验，以及本地网关 / relay 的架构思路。

## 许可证

MIT
