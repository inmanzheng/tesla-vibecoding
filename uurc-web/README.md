# UU Remote Web

[中文](README.zh-CN.md)

Self-hosted web controller for UU Remote.

## Features

- SMS login
- Login-state import and export
- Device list
- Remote control session
- Account management
- Local gateway for UU API and signal traffic

## Docker

```bash
docker run -d \
  --name uurc-web \
  -p 8787:8787 \
  iola1999/uurc-web:latest
```

Or:

```bash
curl -O https://raw.githubusercontent.com/iola1999/uurc-web/main/compose.yml
docker compose up -d
```

## Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/iola1999/uurc-web)

Cloudflare Worker + Durable Object deployment is available.

```bash
npx wrangler login
npm run deploy:cloudflare
```

See [cloudflare/README.md](cloudflare/README.md) for requirements and notes.

## Development

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
docker build -t iola1999/uurc-web:local .
```

## Acknowledgements

The Cloudflare deployment architecture references [AssppWeb](https://github.com/Lakr233/AssppWeb), especially its Cloudflare deployment ergonomics and local-gateway relay mindset.

## License

MIT
