# Handoff：车机远控页加「终端」Tab（真 PTY，不走视频）

- 文档性质：交给**本仓库里的 AI** 执行（改 uurc-web + mac-agent，测完按原流程部署 VPS）。被控机装 Cua / 常驻代理仍看 `doc/handoff_mac_cua_agent.md`。
- 日期：2026-09-06
- 状态：**未开工**。计划已拍板，本文是执行说明书。
- 工作区：`/Users/iveszheng/Downloads/Tesla VibeCoding/`（以本机实际路径为准）
- 计划原文：`.cursor/plans/车机终端_tab_1bb7d74e.plan.md`
- 关联：
  - `doc/handoff_uurc_tesla.md`（主交接、VPS 部署）
  - `doc/handoff_mac_cua_agent.md`（被控机 Cua + 小代理）
  - `doc/handoff_mac_vpn_split.md`（被控机 VPN 不要包 UU）
  - `doc/handoff_install_cua_driver.md`（只装 Driver）

读完再改代码。不要先「优化架构」或把终端塞进 `/pair`。

---

## 0. 你是谁、这票做什么

你是接着改 **uurc-web** 的 AI。用户在特斯拉车机浏览器里远控一台个人 Mac。画面已经能看、能键鼠、能手机配对、能用一句话开 App。现在要补的是：

**在车机远控页（不是手机 `/pair`）加一档「终端」。** 打字走文本 PTY，不走 UU 整屏视频。会话、shell、herdr **只在被控 Mac 上跑**。香港 VPS 只转发字节。

做完后用户应能：连上远控 → 点「终端」→ 看到本机 tmux（优先 `herdr`，否则 `uurc`）→ 触屏敲命令，弱网也比盯桌面打字稳。切回「桌面」时 UU 画面还在，不要重连。

---

## 1. 前因后果（必须懂，否则会接错线）

### 1.1 产品长什么样

特斯拉车机是 kiosk 浏览器：没应用商店、软键盘经常打不进 `<canvas>`、蜂窝网打不到家里的 `Mac.local`。所以：

| 层 | 谁做 | 走哪 |
|---|---|---|
| 网页 UI、登录、手机配对、CUA 面板 | uurc-web，部署在香港 VPS `https://43.161.198.131` | HTTPS |
| 桌面画面 + 声音 + 画布键鼠 | 网易 UU 远程，WebRTC | 车机 ↔ UU（常 TURN）↔ Mac，**不经 VPS 媒体** |
| 开/切 App（微信、Safari…） | Cua Driver 在 Mac 登录会话里 | 车机/手机 → VPS `input-bridge` → `uurc-mac-agent` → `127.0.0.1` 的 `cua-driver` |
| **本票：真终端** | 本机 tmux + PTY | 车机 xterm → VPS `/api/term` → 同一只 mac-agent → **本机 tmux** |

首页 / 设备列表 / 远控页要 Caddy 口令 `1111` / `88888888`，再登 UU（手机号 + 短信）。`/pair` 和 `/api/input-bridge/*` **免这层口令**，方便 iPhone Safari。终端 Tab 在远控页里，**继续要口令 + UU 登录**，不要放进 Caddy `@pair` 白名单。

### 1.2 已经上线、不要弄坏的东西

- `/pair`：底栏四档——键盘 / 触控板 / 应用 / 快捷。自动配对，无 8 位码。
- 远控页：控制中、画质、声音默认开、CUA 抽屉（规则映射：「打开微信」「关掉前台窗口」）。
- `input-bridge`：**两条队列**。`text/move/click/scroll/shortcut` 给车机 UU；`activate/launch/cua` 给 Mac 助手。不要把 PTY 字节塞进这条长轮询。
- `uurc-mac-agent`：`uurc-web/mac-agent/index.mjs`，零 npm 依赖，只出站轮询桥 + 调 `cua-driver`。Cua 没装时列表为空，不崩溃。
- 声音、坐标 fit/fill、触屏语义、舱麦 `Permissions-Policy`：已修过，本票不要顺手改。

### 1.3 为什么要单独做终端页

盯桌面视频打 herdr / tmux：带宽高、花屏、车机键盘对不齐画布、嵌套 prefix 难按。UU **官方客户端**自带「终端」列表，底层是它自己的 tmux（`~/Library/Application Support/UURemote/tmux.sock`，只有 `uuyc-cli lterm new` 登记的会话才出现）。那是给 **UU 手机 App** 用的，uurc-web **没有接口**把那一页嵌进来。

有人看过 [uu-term-bridge](https://github.com/limin112/min-skill/tree/main/tools/uu-term-bridge)：它把 iTerm 标签登记进 UU 官方终端。**不要整段搬进 uurc-web。** 我们要的是同等能力——车机网页上的真 PTY——不是去桥 UU 的 `lterm`。

也评估过、已否决的路：

- **TmuxHub / tmuxhub.woa.com**：公司通道，车机过不了 iOA 登录。
- **herdr-web WASM**：另开一套站点，不嵌进现有远控页。
- **VPS 里起一个 shell**：看不到本机 `127.0.0.1:8787`、本地仓库、Cua 登录会话。
- **把终端做进 `/pair`**：手机是键鼠壳；盯 herdr 的人在车机上。

用户已确认两句原话：

1. 不是手机配对页；是车机远控页再加一档。
2. 真终端必须在被控机上执行，会更好。

### 1.4 和 Cua / 桌面的分工（第一期就这样）

- **桌面 Tab**：看 GUI（Cursor、浏览器、微信），媒体仍 UU。
- **终端 Tab**：进本机 tmux/herdr，文本通道。
- **CUA**：自然语言开/切 App，不替代终端。
- **`/pair`**：手机键盘、触控板、应用列表、宏。本票 **一行都不要改**（测试也不要无故改断言）。

切到终端时 **禁止** `stop` / 拆掉 `BrowserRemoteSession`。WebRTC 留在后台，切回桌面要立刻有画面。

---

## 2. 目标架构

```
车机远控页
  ├─ 桌面（现有 RemoteControlStage，UU WebRTC）
  └─ 终端（新，xterm.js）
        │  WSS  同源  /api/term?role=car
        ▼
香港 VPS  uurc-web 容器
  HTTP upgrade：
    /wisp*     → 现有 wisp（不要动策略）
    /api/term  → 本票中继（配对 car ↔ agent）
    其它       → 404（现在就是这样）
        │  WSS  出站  /api/term?role=agent
        ▼
被控 Mac  uurc-mac-agent（登录会话）
        │  node-pty
        ▼
本机 tmux：有 herdr 就 attach herdr，否则 new-session -A -s uurc
```

VPS **不** `tmux`、不 `node-pty`、不把 PTY 放进 Docker 当工作区。镜像里可以有中继代码；PTY 进程只出现在 Mac 上。

---

## 3. 给你（实现 AI）的任务清单

按顺序做。做完一项再下一项。

1. VPS / 后端：`/api/term` WebSocket 中继，与 `/wisp` upgrade 分流。
2. 前端：远控工具栏「终端」+ 舞台切换 + xterm + 软键 + 会话列表。
3. `uurc-mac-agent`：保留 Cua 轮询；再出站连 `/api/term`；PTY attach tmux。
4. 补测试、typecheck；按第 9 节部署。
5. 给 `doc/handoff_mac_cua_agent.md` 加一小节（本机要有 tmux、代理常驻、车机点控制中后再开终端）。

Cua 没装、被控机没组装好：**不要阻塞本票**。没有 agent 时车机终端页显示「等待 Mac 助手」，中继把 car 挂起即可。

---

## 4. 后端怎么改

### 4.1 Upgrade 分流（必做，否则 /api/term 永远 404）

现况：[uurc-web/backend/src/index.ts](../uurc-web/backend/src/index.ts) `createServer(app)` 后只调 `setupWsProxy`。

[uurc-web/backend/src/services/wispProxy.ts](../uurc-web/backend/src/services/wispProxy.ts) 里：

```ts
server.on("upgrade", (req, socket, head) => {
  if (!req.url?.startsWith("/wisp")) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  wisp.routeRequest(req, socket, head);
});
```

要改成：`/api/term` 交给新中继，`/wisp` 仍给 wisp，其余 404。不要注册两个互相抢的 `upgrade` 监听而不分流。推荐一个 `setupTermRelay(server)`，在 `setupWsProxy` **之前或之中**统一入口，避免漏掉 socket。

Caddy `reverse_proxy` 默认会升级 WebSocket，**不必**把 `/api/term` 写进 `@pair`。终端在已登录远控页，跟 `/api/remote` 一样走 basicauth。

### 4.2 中继语义

- 查询：`role=car` | `role=agent`。只要一对。第一期单槽，和 `input-bridge` 的 `active` 一样够用（一台被控机）。
- agent 后上线：把等待中的 car 配对上，发 `{ type: "status", agentOnline: true }`。
- 无 agent：car 连上后发 `{ type: "status", agentOnline: false }`，**不要断**，等 agent。
- 任一侧断开：另一侧收 `status` 或关闭；agent 应自动重连（和现在 404 轮询一样）。
- 只转发下面这些 JSON 文本帧（或等价的短二进制，但第一期 JSON 即可）。`out` 的终端输出建议 base64，避免 JSON 里塞任意字节。

车机 → 中继 → agent：

```json
{ "type": "in", "bytes": "<base64>" }
{ "type": "resize", "cols": 80, "rows": 24 }
{ "type": "attach", "name": "herdr" }
{ "type": "list" }
```

agent → 中继 → 车机：

```json
{ "type": "out", "bytes": "<base64>" }
{ "type": "sessions", "names": ["herdr", "uurc"] }
{ "type": "status", "agentOnline": true, "session": "herdr", "detail": "" }
```

不要复用 [inputBridge.ts](../uurc-web/backend/src/services/inputBridge.ts) 的 `next()` 队列传 PTY。长轮询会卡、会丢、会和触控板抢。

依赖：后端可加 `ws`（`package.json` 里已有 `@types/ws`）。不要为中继引入 node-pty。

测试（[uurc-web/backend/tests/](../uurc-web/backend/tests/)）：

- 两条假 WebSocket（或对 `upgrade` 的轻量封装）能把 `in`/`out` 对传。
- 只有 car、没有 agent 时，车机收到 `agentOnline: false`，连接保持。
- `/wisp` 路径仍进 wisp（至少断言 term 中继不吞掉 `/wisp`）。

---

## 5. 前端怎么改

入口页：[uurc-web/frontend/src/components/RemoteControlPage.tsx](../uurc-web/frontend/src/components/RemoteControlPage.tsx)  
工具栏：[uurc-web/frontend/src/components/RemoteCommandBar.tsx](../uurc-web/frontend/src/components/RemoteCommandBar.tsx)（已有 CUA / 手机输入）  
状态：[uurc-web/frontend/src/controllers/useRemoteControlController.ts](../uurc-web/frontend/src/controllers/useRemoteControlController.ts)  
props：[uurc-web/frontend/src/app/remoteControlPageProps.ts](../uurc-web/frontend/src/app/remoteControlPageProps.ts)

### 5.1 UI

- 工具栏加「终端」（lucide `Terminal` / `SquareTerminal`）。`is-active` 表示当前舞台是终端。
- 点开后舞台区渲染新组件（建议 `RemoteTermPanel.tsx`），**隐藏或 `visibility` 藏起** `RemoteControlStage`，不要卸载到拆掉 video/peer。
- 未控制中也可以看终端吗？第一期：**要求已点「控制中」**（和 CUA 一致），避免没人在控时挂着 PTY。若你做成「只要远控已连上就能开终端」，写在 PR 说明里，但不要因此 `stop` 画面。
- 空态文案：「等待 Mac 助手。本机先跑 uurc-mac-agent。」
- 顶栏：当前 session 名 + 下拉（`sessions.names`）。第一期 **不同屏多路**，切会话即 `attach` 另一个。
- 底栏软键（车机触屏）：`Esc` `Tab` `Ctrl`（粘滞一次）`↑↓←→` `Ctrl-B`。`Ctrl-B` 是用户自己的 tmux/herdr 前缀，不是 UU 那层 `C-]`。
- 依赖：`xterm` + `@xterm/addon-fit`（加进 frontend `package.json`）。`FitAddon` 后发 `resize`。

### 5.2 连接

- `wss://<当前 host>/api/term?role=car`（页面已是 HTTPS，用相对 `wss`）。
- 自签证书：浏览器用户已接受风险，WS 同源即可。
- 断线重连，不要把失败当成要重连 UU 视频。
- 不要把终端字节走 `session.sendTextInput`（那是打进桌面）。

### 5.3 测试

- 切到终端 Tab **不会**调用停远控 / `deleteInputBridge`（可用 controller 单测或页面测 mock）。
- 软键会往 WS 客户端送 `in`（mock WebSocket）。
- **不要**改 [phoneInputBridge.test.tsx](../uurc-web/frontend/tests/phoneInputBridge.test.tsx) 除非你误伤了 `/pair`。

---

## 6. mac-agent 怎么改（活在被控机上）

文件：[uurc-web/mac-agent/index.mjs](../uurc-web/mac-agent/index.mjs)

现有职责保留：轮询 `/api/input-bridge/active/agent-next`，上报 apps，`cua-driver call list_apps` / `launch_app`。**不要**为了终端删掉这些。

新增：

1. 出站 `wss://$UURC_BRIDGE_URL/api/term?role=agent`（同样 `UURC_TLS_INSECURE=1`）。
2. `tmux ls` 得到名字；默认 attach：存在 `herdr` 用 `herdr`，否则 `tmux new-session -A -s uurc`。
3. 用 **PTY** 跑 `tmux attach -t <name>`（或 `new-session -A`）。加 `node-pty`（mac-agent 可以有自己的 `package.json`，**不要**把 native 模块打进 Docker）。编译失败就日志打清楚并给车机 `status.detail`，**禁止**用 `tmux capture-pane` 轮询冒充终端。
4. 把 PTY 输出打成 `out`；把 `in` 写入 PTY；`resize` 调 `pty.resize`。
5. 仍只连 localhost + 出站 VPS。不监听 `0.0.0.0`。不写 CGEvent。

本机前提（写进 Cua handoff 小节即可，本票实现 AI 若只改仓库也要在 README 写清）：

```bash
which tmux || brew install tmux
# 可选：用户已有 herdr 会话
tmux ls
```

启动方式不变，多一条 WS：

```bash
cd uurc-web/mac-agent   # 或 ~/uurc-mac-agent
npm install             # 本票之后才会有 node-pty
UURC_BRIDGE_URL=https://43.161.198.131 UURC_TLS_INSECURE=1 node index.mjs
```

Docker **不要** `COPY mac-agent` 进运行镜像当依赖；rsync 到 `/opt` 无妨，容器不用它。

---

## 7. 协议与默认会话（写死，避免各写各的）

| 规则 | 值 |
|---|---|
| 默认 session | `tmux has -t herdr` 成功 → `herdr`，否则 `uurc` |
| 创建 | `tmux new-session -A -s uurc`（detached 再 attach 到 PTY） |
| 单槽 | 同时只服务一对 car/agent |
| 编码 | JSON + base64 字节 |
| 前缀软键 | 只提供 `Ctrl-B`，不要在代理里翻译 herdr 快捷键 |

不要 attach：

- `~/Library/Application Support/UURemote/tmux.sock`
- `uuyc-cli` / `uuyc-mux`
- Docker 容器里的 bash

---

## 8. 明确不要做

- 改 `/pair` 信息架构、把终端做成第五档底栏。
- 接 UU 官方终端列表或 uu-term-bridge。
- 第二路视频、把 herdr 画面用截屏推到网页。
- 文件上传、多 pane 宫格、可编辑宏市场。
- 在 VPS / 容器里 `node-pty` spawn 工作 shell。
- 跑 `uurc-web-deploy/deploy-vps.sh`（会 `git pull` 上游，冲掉本地改动）。
- 改 Caddy `@pair` 把 `/api/term` 免登（谁都可以连 PTY）。
- 把 Cua 绑 `0.0.0.0`、`--dangerously-bypass-approvals`。
- 「给某某发微信」类 App 内操作。
- 顺手重做声音 / 触控板 / 坐标。
- 没有用户要求就 `git commit` / `push`。

---

## 9. 测试与发布

本地：

```bash
cd uurc-web
npm run test -w backend
npm run test -w frontend
npm run typecheck -w frontend
npm run build -w backend
```

部署（与 `doc/handoff_uurc_tesla.md` 第七节相同）：

1. 企业微信缓存里的 `UU.pem` **复制**到 `/tmp/uurc-vps.pem`，`chmod 600`。不要改原文件。
2. 用户是 `ubuntu@43.161.198.131`。
3. rsync `uurc-web/`（排除 `.git` `node_modules` `dist`）到 `/home/ubuntu/uurc-stage/`。
4. `sudo cp -a /home/ubuntu/uurc-stage/. /opt/uurc-web/`。
5. `cd /opt/uurc-web && sudo docker compose build > /tmp/build.log 2>&1 &`；等日志出现 `Built`。
6. `sudo docker compose up -d`，容器 `uurc-web-uurc-web-1` 为 `healthy`。
7. 删 `/tmp/uurc-vps.pem`。
8. 抽查：`/pair` 仍 200 免口令；首页仍 401；远控页登录后工具栏有「终端」。

`/opt/uurc-web` 是 root 的，不要直接 rsync 上去。不要 `--rsync-path=sudo rsync`。

mac-agent **不进镜像生效**。用户那台被控机要自己 `npm install` 并重开进程。你部署完在回复里写明这条。

---

## 10. 联调怎么算过

1. 无代理：车机开终端 Tab，看到等待态，桌面画面切回去还在。
2. 有代理、本机无 `herdr`：自动出现 `uurc` shell，敲 `echo ok` 有回显。
3. 本机先 `tmux new -s herdr -d`：默认进 `herdr`。
4. 软键 `Ctrl-B` 能把前缀发给 tmux（若 herdr 改过前缀，只保证字节送到，不保证 herdr 语义）。
5. 手机 `/pair` 四档与点「打开微信」（排队）行为与本票前一致。
6. Caddy 未登录不能直接打开一个可用的 PTY（WS 握手应失败或进不了远控页）。

---

## 11. 做完怎么回用户

几段纯文本，不要只说「做好了」：

1. 改了哪些文件（中继 / 远控 UI / mac-agent）。
2. 测试命令和结果。
3. 是否已按第 9 节部署；容器是否 healthy。
4. 被控机还要做什么：`tmux`、`npm install`、`UURC_TLS_INSECURE=1 node index.mjs`。
5. 若没部署：卡在哪（WS upgrade、xterm 体积、node-pty 编译）。

---

## 12. 环境速查（抄错会连不上）

| 项 | 值 |
|---|---|
| VPS | `43.161.198.131`，用户 `ubuntu` |
| 入口 | `https://43.161.198.131` |
| Caddy | `1111` / `88888888`；`/pair` 与 `/api/input-bridge/*` 免登 |
| 容器 | `uurc-web-uurc-web-1`，镜像 `iola1999/uurc-web:latest` |
| 源码落地 | `/opt/uurc-web`（root），暂存 `/home/ubuntu/uurc-stage` |
| 禁止 | `deploy-vps.sh` |
| 工作区 | 本机 `…/Tesla VibeCoding/uurc-web` |
| 语言 | 对用户用中文 |

---

## 13. 给被控机 AI 的一句话（本票实现完再转）

网页和中继在 VPS 上之后，你只要保证：Cua 守护在跑、`tmux` 在 PATH、`uurc-mac-agent` 常驻且能连上 `wss://43.161.198.131/api/term`。不要在这台机器上改 uurc-web，不要把 Cua 绑到局域网。细节仍以 `doc/handoff_mac_cua_agent.md` 为准，实现 AI 会给那份补「终端」小节。
