# uurc-mac-agent

被控 Mac 上跑的小代理。轮询香港 VPS 的 `input-bridge`，把「打开/切换 App」交给本机 `cua-driver`（只连 localhost）。不要把它打进 Docker。

Cua 还没装好时也可以先起这个进程：应用列表会空着，任务结果会写「Cua 未就绪」。

```bash
cd mac-agent
UURC_BRIDGE_URL=https://43.161.198.131 node index.mjs
```

证书校验失败时（纯 IP HTTPS）再加 `UURC_TLS_INSECURE=1`。装好 Cua 后保持 `cua-driver` 守护在跑，然后重开本进程。
