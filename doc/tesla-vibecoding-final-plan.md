# 最终方案：特斯拉车内语音 Vibecoding（个人 Mac + CodeBuddy 网关）

> 定稿日期：2026-09-05
> 整合来源：`tesla-remote-vibecoding.md`（调研）、`tesla-vibecoding-verify-step1.md`（零成本验证）、CodeBuddy Gateway（`codebuddy2api` 127.0.0.1:8787）技术手册。
> 目标：在特斯拉车机浏览器里**控住家里的个人 Mac**，用**语音**做车上 vibecoding，LLM 额度走**你已有的 CodeBuddy 企业订阅**，不额外花钱、不依赖公司 iOA。

---

## 1. 一句话方案

车上用特斯拉浏览器（画面 + 自带软键盘）控住家里**个人 Mac**；**语音**交给手机 UU「麦克风直连」让 Mac 听见你；Mac 上的 coding agent 走**本机 CodeBuddy 网关**（`127.0.0.1:8787`，OpenAI/Anthropic 兼容）调用企业订阅额度——**网关不吃 iOA、无需单独 API key 费用**，即便不连公司网络也能用。

---

## 2. 三层架构（合并后）

```
[特斯拉车机浏览器]              [香港 VPS]                      [个人 Mac / Sonoma+]            [手机]
 打开 desktop.你的域名.com        uurc-web(Docker :8787)           UU 客户端(允许被控)              UU APP(同账号)
 画面 + 软键盘(不依赖特斯拉OSK) ──HTTPS/wss──▶ Caddy(:443 TLS+      Claude/Cursor/Aider  ─┐          │
       │                                    basic_auth)           ↑ 听见你                │          │
       │                                    reverse_proxy          │                      │          │
       └──────────────────────────────────▶ 127.0.0.1:8787 ────────┘                      │ 麦克风直连│
                                            (信令经VPS, 媒体P2P)                           ▼          ▼
                                                                        手机蜂窝 ──► Mac 麦 = 手机麦

[Mac 本机 LLM 后端]  coding agent ──127.0.0.1:8787──▶ CodeBuddy 网关 ──▶ copilot.tencent.com（企业订阅额度）
                      (Claude Code / Codex / Aider / Cursor)   127.0.0.1 硬锁, 不外暴露
```

要点：
- 车机**只连你自己的香港 VPS**（HTTPS），不直接碰 Cloudflare/GFW；VPS 再去连 UU 国内基础设施。
- 画面走 WebRTC（默认 P2P，不经 VPS）；信令经 VPS。
- **CodeBuddy 网关只跑在 Mac 本机回环（127.0.0.1:8787），不外暴露、不经过隧道**——车机看到的只是 Mac 屏幕，agent 在 Mac 本地调网关。安全且简单。

---

## 3. LLM 后端层（核心新增：CodeBuddy 网关）

### 3.1 为什么用它
- 你已有 **CodeBuddy 企业订阅**额度；网关把它转成 OpenAI/Anthropic 兼容 API，让任意 coding agent 复用，**零额外 API 费用**。
- **不吃 iOA**：网关鉴权是「授权文件」（管理面板 `http://127.0.0.1:8787/` 上传/激活），等价于你的 CodeBuddy 登录态的持久化。**不要求登录公司 IOA、不要求当时挂着公司网络**。
- 上游 `copilot.tencent.com` 系腾讯云，从家庭宽带/住宅网络正常可达。

### 3.2 网关关键信息（来自技术手册）
| 项 | 值 |
|---|---|
| 监听 | `127.0.0.1:8787`（仅本机回环，硬锁，不外暴露） |
| 上游 | `https://copilot.tencent.com/v2/chat/completions` |
| 管理面板 | `http://127.0.0.1:8787/`（授权、用量、配置迁移 `/export-config`、`/import-config`） |
| 健康检查 | `GET /health` → `{"status":"ok"}` |

协议端点（按客户端选对，**不要串**）：
- `POST /v1/chat/completions` → OpenAI Chat Completions（Pi、Aider、通用 OpenAI 客户端、Cursor 自定义 base url）
- `POST /v1/responses` → OpenAI Responses（**Codex CLI**，`wire_api="responses"`）
- `POST /v1/messages` → Anthropic Messages（**Claude Code / CC Switch**）

鉴权：默认网关不校验客户端 key，占位即可（如 `not-needed`）；若启动带 `--api-key`，客户端带 `Authorization: Bearer <secret>`。

### 3.3 各 agent 接入（在 Mac 上配置）
- **Claude Code**：`ANTHROPIC_BASE_URL=http://127.0.0.1:8787`、`ANTHROPIC_API_KEY=not-needed`、模型用后端真名（如 `hy4-preview-ioa`）。
- **Codex CLI**：`~/.codex/config.toml` 加 `model_providers.workbuddy`（`base_url="http://127.0.0.1:8787/v1"`、`wire_api="responses"`、`experimental_bearer_token="not-needed"`），并设 `respect_system_proxy=false`。
- **Aider / Cursor / Pi**：base url 指向 `http://127.0.0.1:8787/v1`，api key 占位，模型用后端真名。

### 3.4 关键坑（必记）
- **`NO_PROXY=127.0.0.1,localhost,::1`**：公司/系统代理会劫持 8787 访问 → 503 且网关无请求记录。所有 agent/客户端都要设 `NO_PROXY`。
- **模型 id 全小写**：`hy4-preview-ioa` 正确，`Hy4-Preview-Ioa` 会 `11102 model service info not found`。（`-ioa` 只是后端模型 id 的一部分，**不是登录要求**。）
- **推理档**：混元 HY4 不带 `reasoning_effort` 时思考 token 为 0；客户端需 `supportsReasoningEffort: true` 或显式带 `reasoning_effort:"high"`。
- 网关只做协议水管，**不要配系统代理、不要做 MCP/编排**。

### 3.5 最小验证（在 Mac 本地跑）
```bash
export NO_PROXY=127.0.0.1,localhost,::1
curl -sS --noproxy 127.0.0.1 http://127.0.0.1:8787/health        # → {"status":"ok"}
curl -sS --noproxy 127.0.0.1 http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"hy4-preview-ioa","reasoning_effort":"high","max_tokens":128,"messages":[{"role":"user","content":"只回复：ok"}]}'
```

---

## 4. 与「iOA / 公司网络」的关系澄清（重要）

| 问题 | 结论 |
|---|---|
| 被控 Mac 能用公司 iOA Mac 吗？ | **能，但只限报备过的 TmuxHub 通道。** iOA 是零信任 EDR，会拦 UU/ToDesk/向日葵等未报备远控并留审计；但 TmuxHub 是公司已安全报备的合规远控，iOA transport 放行其出站流量（见 §11）。普通远控仍不行，被控机也可换个人 Mac。 |
| CodeBuddy 网关需要 iOA 登录吗？ | **不需要。** 它吃的是「授权文件/CodeBuddy 登录态」，激活后即便不挂公司网络也能转。模型名里的 `-ioa` 是 id 一部分，非登录要求。 |
| 那网关为什么还能用企业订阅？ | 授权文件即你的订阅凭证；上游 `copilot.tencent.com` 从住宅网络可达。与是否在线 iOA 无关。 |
| 两个结论是否矛盾？ | 不矛盾：**iOA 拦的是「在它管控的机器上装未报备远控软件」**；而 TmuxHub 是已报备合规通道（放行），网关是「用订阅额度调 LLM」且跑在本机。iOA Mac 现可经 TmuxHub 作被控机（§11），普通远控仍不行。 |

---

## 5. 分阶段落地（复用已有手册）

### 阶段 1（零成本，先跑）— 见 `tesla-vibecoding-verify-step1.md`
1. 个人 Mac 装 UU 客户端 + 开被控 + 授屏幕录制/辅助功能。
2. 手机 UU APP（同账号）控 Mac → 验证被控闭环。
3. 开手机「麦克风直连」→ Mac 侧程序收到手机声音 → 验证语音闭环。
4. Mac 开 coding agent，手机说话让其执行 → 验证「语音→agent」。**此步同时验证网关可用**（agent 已指向 127.0.0.1:8787）。
5. **全绿才进阶段 2**；任一红先止步排查。

> 阶段 1 里把 agent 的 LLM 直接配成本机 CodeBuddy 网关（§3.3），等于顺手验证 LLM 后端，无需另测。

### 阶段 2（才花钱）— 部署网页端
1. 买**腾讯云国际站香港** Lighthouse（2C2G/4G，30Mbps 峰值，Ubuntu 22.04）。
2. 注册域名（DNSPod）+ Let's Encrypt（车机拒自签）。
3. VPS 跑 `uurc-web`（Docker 或本地 build）+ Caddy（`basic_auth` 双重保险，8787 仅监听内网）。
4. 车机浏览器开 `desktop.你的域名.com` 控 Mac（画面 + 软键盘）。
5. 车机仅看画面 + 偶尔触屏；**语音交给手机 UU 麦克风直连**；agent 的 LLM 仍走 Mac 本机网关。

---

## 6. 合并后的关键坑（总览）

| 域 | 坑 | 对策 |
|---|---|---|
| 远控 | 特斯拉原生键盘打不进画布 | 用 uurc-web 自带软键盘（不依赖系统 OSK） |
| 网络 | Cloudflare 国内被墙 | 改 frp/uurc-web + 香港 VPS + Caddy，不碰 CF |
| 合规 | 公司 iOA Mac 拦未报备远控 | 走 TmuxHub 合规通道（§11）控 iOA Mac，或换个人 Mac |
| 语音 | 国行车机浏览器无麦克风 | 语音交手机 UU 麦克风直连（手机麦=Mac 麦） |
| 环境 | 单标签 kiosk、无 devtools | 全程在一个网页内完成 |
| LLM | 公司代理劫持 127.0.0.1 → 503 | agent 全设 `NO_PROXY=127.0.0.1,localhost,::1` |
| LLM | 模型 id 大小写错 → 11102 | 用后端真名全小写（`hy4-preview-ioa`） |
| LLM | HY4 不带 reasoning 思考=0 | 客户端 `supportsReasoningEffort` 或显式 `reasoning_effort:"high"` |

---

## 7. 最终验证清单（全绿 = 方案成立）

| 检查项 | 通过标准 |
|---|---|
| 被控 | 手机能看并操作个人 Mac |
| 屏幕录制/辅助功能授权 | Mac 已授予 UU，控制无黑屏/无拒操 |
| 麦克风直连 | Mac 侧 agent 收到手机声音 |
| 语音→agent | 手机说话，Mac 上 coding agent 执行了指令 |
| 网关健康 | Mac 本地 `/health` → ok；chat 接口返回 200 + content |
| 网关模型 | `hy4-preview-ioa` 等后端真名可用、思考 token > 0 |
| 车机画面 | 车机浏览器开 `desktop.你的域名.com` 看到 Mac 画面 + 软键盘可用 |
| 端到端 | 车里看屏 + 手机说话 → Mac agent 改代码（LLM 走本机网关，无 IOA/无额外费用） |

---

## 8. 一句话总结（修订）
**首选被控机 = 公司 iOA Mac，经已报备的 TmuxHub 合规通道（太湖零信任网关 + iOA 出站）控住**；车机用短期 ticket 分享链接进入 `tmuxhub.woa.com` 看到 Herdr TUI，驱动 Pi+Herdr 编队（8 角色/5 tab）；各 pi agent 走本机 CodeBuddy 网关 `127.0.0.1:8787`（复用企业订阅、不吃 iOA）。TmuxHub 原生支持文件上传/Action/Hook，免香港 VPS、免 UU、免个人 Mac。车机 ticket 不可达时回退 herdr-web（个人 Mac + VPS）或 uurc-web+UU 全桌面。

---

## 9. 替代/更优路径：Herdr + herdr-web（纯终端 Web 客户端）

> 来源核查：herdr.dev 官方文档（quick-start / how-to-work / persistence-remote）+ 社区仓库 kcosr/herdr-web、stefanopineda/herdr-web（2026-09-05 检索）。

### 9.1 Herdr 官方远程能力（不适合车机直连）
- Herdr = 「AI agent 终端多路复用器」（tmux-for-agents），服务端常驻后台、agent 持久运行。
- 官方远程方式**只有 SSH**：手机装 SSH 客户端跑 `ssh you@server herdr`，或本地 `herdr --remote ssh://...` 瘦客户端。**不暴露固定 TCP 端口、无 Web 客户端**。
- → 特斯拉浏览器不能装 App、不能跑 SSH 客户端，**官方方式车机直接用不了**。

### 9.2 社区 Web 客户端（关键：纯浏览器可用）
| 项目 | 端口 | 技术 | Tailscale? | 公网 HTTPS? | 车机可用 |
|---|---|---|---|---|---|
| **kcosr/herdr-web** (MIT, 96★) | 桥接默认 8787（可改） | React+Vite + Rust bridge + Ghostty Web(终端渲染) | 不需要 | 自身 HTTP，可加 Caddy 反代 | ✅ **适合** |
| stefanopineda/herdr-web (PWA) | 8790 `/herdrweb` | Node + xterm.js | **强制 Tailnet**，启动脚本拒绝公网绑定、无认证 | ❌ 拒绝 0.0.0.0 | ❌ 车机不能跑 Tailscale |

→ 选 **`kcosr/herdr-web`**：纯网页、不依赖 Tailscale、可经 Caddy 反代成 HTTPS；自带屏幕功能键栏（Ctrl/⌘/方向/Herdr 和弦）+ 移动文本输入，**正好绕过特斯拉原生键盘打不进画布的坑**。

### 9.3 为什么比 uurc-web+UU 全桌面更契合车机
- **只流终端 UI（WebSocket），不流整屏桌面视频** → 带宽极低，车机 LTE 更稳。
- **键盘天然顺**：终端是「按键流」，herdr-web 自带软功能键栏；无 OSK/画布问题。
- **去 UU 商业依赖**：纯自托管开源（MIT），回到最初「开源/自托管」诉求；免 UU 账号与国内中继。
- **LLM 后端不变**：Herdr 在 Mac 上跑 agent（claude/codex/aider），这些 agent 仍指向本机 **CodeBuddy 网关 127.0.0.1:8787**（§3）。Herdr 只编排，网关只供水。
- **语音改为手机 STT → 注入终端**：不再需要手机 UU「麦克风直连」（那依赖 UU）。手机跑 STT（豆包/讯飞/whisper WASM）把文本发到注入端点写进 Herdr 面板；短指令也可直接车机触屏打字。

### 9.4 端口冲突提醒（重要）
- `herdr-web-bridge` 默认 `127.0.0.1:8787` 与 **CodeBuddy 网关 127.0.0.1:8787 冲突**！必须把 bridge 改端口（如 `HOST=127.0.0.1 PORT=8790`，或 `--port`）。网关端口硬锁不可改。
- Herdr 自身不绑 TCP 端口（用 unix socket / SSH），无冲突。

### 9.5 部署要点（与 §5 阶段 2 同骨架）
1. Mac：跑 Herdr 后台（`herdr`）+ 各 agent 配好 CodeBuddy 网关（§3.3）+ 跑 `herdr-web-bridge`（改端口 8790，仅监听 127.0.0.1）。
2. HK VPS：Caddy `:443`(TLS+`basic_auth`) → `reverse_proxy 127.0.0.1:8790`；安全组只放 80/443。
3. 车机浏览器开 `desktop.你的域名.com` → herdr-web 终端 UI → 驱动 agent。
4. **鉴权不可省**：bridge 自身无认证，必须 Caddy `basic_auth` 挡在前面（同 §13.11.4）。

### 9.6 风险
- herdr-web 是实验性个人项目（MIT），vendored Herdr 兼容层**锁定 Herdr ≥ v0.8.2 且终端协议=20**；Herdr 升级可能破坏 bridge，需跟进。
- 车机 kiosk（单标签/无 devtools/激进缓存）需实测 herdr-web 的 WASM 终端稳定性；加 cache-bust 刷新。
- 国行车机无麦克风 → 语音仍走手机 STT，与桌面方案同约束。

---

## 10. 两条路径决策

| 维度 | 路径 A：uurc-web + UU 全桌面（原方案/fallback） | 路径 B：Herdr + herdr-web 终端（新推荐/首选） |
|---|---|---|
| 车机客户端 | uurc-web（UU 中继） | herdr-web（自有 VPS，纯网页） |
| 流的内容 | 整屏桌面视频(WebRTC) | 终端 UI(WebSocket) |
| 带宽 | 高 | **低** |
| 键盘 | uurc-web 软键盘 | herdr-web 软功能键栏 |
| 语音 | 手机 UU 麦克风直连（需 UU） | 手机 STT→注入终端（**无需 UU**） |
| 依赖 | UU 商业中继 | 纯自托管开源 |
| LLM | CodeBuddy 网关 | 同 |
| 成熟度 | UU 商用稳定 | herdr-web 实验性/版本锁 |

**建议**：路径 B 更契合「车机纯网页 + 开源自托管 + 省带宽 + 语音去 UU」，**作为首选**；路径 A 作 fallback（若 herdr-web 车机实测不稳或 Herdr 升级破坏 bridge）。**零成本先验证**：Mac 本地 `herdr` + agent(指向网关) + `herdr-web-bridge`(改端口 8790) 在笔记本浏览器打开 `127.0.0.1:8790` 跑通，再买 VPS。

---

## 11. 合规主路径（新增，最强）：公司 TmuxHub + iOA 通道接管 Herdr

> 来源：`/Users/iveszheng/Downloads/tmuxhub`（TmuxHub，MIT OSS + `products/tencent` 公司内部包装），2026-09-05 深度调研。
> 背景：公司开放了**基于 tmux 的网页远控接口**，司内远控已向安全报备。本路径借用该合规通道，使 **iOA Mac 也能作为被控机**——推翻 §4/§13.10「iOA Mac 不可控」的结论。

### 11.1 项目本质
- **TmuxHub** = 基于 tmux 的纯网页终端远控（OSS MIT），结构：server（Hono + WebSocket + xterm.js 网页端）+ **outbound client/agent**（被控机运行，主动出站连接服务器，**不开入站端口**）。
- **编程控制面**：`/api/hosts/:host/panes/:target/input`（发文本）、`/keys`（tmux 特殊键）、`/capture`、`/status` → 可程序化驱动任意 tmux pane。
- 网页端 = **PWA + xterm.js**，自带 **Keys（功能键栏）/ Text（文本输入）** 移动控件 → 命中「车机纯网页 + 软键盘」。
- 双 token（server=信任圈 / user=身份，hash→namespace 隔离）或 OAuth。

### 11.2 它专治 iOA 的铁证（Tencent 包装层）
| 能力 | 证据 | 对 iOA 的意义 |
|---|---|---|
| **`AUTH_MODE=tai`** | `server/src/routes/auth.ts` 的 `/api/tai-auth`，TAI JWT（腾讯内部/iOA SSO 认证） | 登录走公司 iOA 身份，被安全体系认可 |
| **`--transport ioa`** | `tmuxhub-agent connect <target> --transport ioa`；spec「registered transport / IOA transport」 | agent 经 **iOA 通道出站**连接服务器，iOA EDR 放行这条远控流量 |
| NOPS/RHRC/TKE/内网镜像 | `oss-component-registry` proposal | 纯公司内部集成 |

→ 这正是「公司开放接口允许 tmux、司内远控安全报备」的技术实现：iOA transport + TAI 认证 = 报备过的**合规远控通道**，iOA 不会以「远控行为识别」拦截它。

> **官方实证（腾讯微创新奖 20260506 期）**：TmuxHub 由 TEG/基础网络中心出品，网页端托管于内网 **`https://tmuxhub.woa.com/home`**，多端接入经**太湖零信任网关（TAI）+ 内部身份体系**鉴权（非裸露入口）。即 `TAI` = 太湖零信任网关，与 `--transport ioa` 出站共同构成合规闭环。能力不止「网页终端」：原生支持 **文件/图片上传下载**（移动端选图自动上传到当前会话）、**Action 自动化**（manual/delay/match 触发，可沉淀「发指令给 brain」「重跑测试」为一键动作）、**Hook 状态回流**（Agent 卡住/等输入/失败主动提醒网页）、**ro/rw 共享 + 多主机工作区 + Agent Skill（HMAC 签名 Token）**。

### 11.3 Herdr 借接口被远程控制（核心方案，含 Pi+Herdr 编队嵌套）

实际被控机上的**三层嵌套**（已在 `/Users/iveszheng/Documents/Pi+Herdr` 实证）：
```
tmux (TmuxHub 接管的外层会话)
 └─ herdr  (TUI 多路复用器，跑在 tmux pane 里)
     └─ Pi+Herdr 编队  (/Users/iveszheng/Documents/Pi+Herdr)
         ├─ L1 决策编排:  brain
         ├─ L2 调研:      scout · researcher
         ├─ L3 执行:      implementer · designer
         ├─ L4 逆向:      reverser (deepseek-v4-pro)
         └─ M0 维护观测:  maintainer · critic
              ↑ 每个 pi agent → model: hy4-preview-ioa, provider: codebuddy-gateway (本机 127.0.0.1:8787)
```
> `Pi+Herdr` 是 Herdr fleet 项目（`fleet.yaml` 真源：5 层=5 tab / 8 角色；`spawn-fleet.sh up` 拉起）。`fleet.yaml` 已锁 `defaults.model: hy4-preview-ioa` / `provider: codebuddy-gateway` → **LLM 后端就是本机 8787 网关**，与 §3 一致。

```
[iOA Mac / 个人Mac]                 [公司 TmuxHub 服务器]            [特斯拉车机浏览器]
 tmux new-session → 跑 `herdr`       网页端(PWA, xterm.js)           开 desktop/公司域名
   └─ herdr 内 = Pi+Herdr 编队      (外层 tmux 这 1 个 pane 即整        ←ioa出站─ tmuxhub-agent
      (5 tab / 8 角色 TUI)            个 herdr TUI)              ── transport ioa ─┐  TAI 登录
        ↑                                                              attach 到该 tmux session
        └─ pi agent(8 个) ──127.0.0.1:8787──▶ CodeBuddy 网关 ┘        用 Keys/Text 驱动 herdr TUI
                                                                         语音: 手机STT → /input API 注入
```
1. 被控机开 `tmux` session，里面运行 `herdr`（TUI，被外层 tmux 包成 1 个 pane）；再 `python3 spawn-fleet.sh up` 拉起 Pi+Herdr 编队。
2. 同机跑 TmuxHub agent：`tmuxhub-agent connect <server> --transport ioa`（公司报备通道），把本机 tmux 注册到服务器。
3. 车机浏览器开 TmuxHub 网页端（PWA），**TAI（iOA）登录**，attach 到跑 herdr 的 tmux session → 看到整个 herdr TUI（5 tab / 8 角色）。
4. 用网页终端 **Keys/Text 控件**驱动 herdr TUI（切 tab / 对 brain 发指令 / 调编队）。
5. 编队内 pi agent 仍指向本机 **CodeBuddy 网关 127.0.0.1:8787**（LLM 后端不变）。
6. **语音**：手机 STT → `POST /api/hosts/:host/panes/:target/input` 注入当前 herdr pane（先车机切到 brain tab）；短指令也可车机触屏打字。

#### 11.3a 两个实操细节（裸 herdr 没有、编队才显形）
- **嵌套 prefix 冲突（真实但可解）**：外层 tmux 默认 `ctrl+b` = herdr 也用 `ctrl+b` 作前缀。若 TmuxHub 网页打字走 tmux 客户端前缀拦截，herdr 收不到 `ctrl+b`。解法：①把 herdr 前缀改掉（README 说前缀"可选"）；或 ②靠 TmuxHub 的 `/input`、`/keys` API——它们经 `tmux send-keys` **直接注入 pane、绕过客户端前缀**，编程注入不受影响。建议：外层 tmux 用默认 `ctrl+b`，herdr 改非冲突前缀。
- **网关宿主机的新洞察**：网关上游是 `copilot.tencent.com`。若它**仅公司内网可达**（需 iOA/公司网），则 **iOA Mac 反而是网关最自然的宿主机**（经 iOA 代理直达 `copilot.tencent.com`），再借 TmuxHub+iOA 把它控住 = 两全；个人 Mac 离线反而可能够不到 `copilot.tencent.com`。这**加强了 iOA 路径的权重**（§11 原本就优于 herdr-web/uurc-web）。需实测确认 `copilot.tencent.com` 对个人 Mac 离线是否可达。

### 11.4 一次性解决全部 blocker
| 之前死穴 | TmuxHub（iOA 通道） |
|---|---|
| iOA 拦远控软件 | **iOA Mac 即可**（ioa transport 白名单） |
| iOA 拦入站/隧道 | agent **出站**，无入站端口 |
| iOA 锁 TCC（屏幕录制/辅助功能） | 终端/tmux，**完全不需要** |
| 车机纯网页 | ✅ PWA |
| 车机键盘 | ✅ Keys/Text 控件 |
| 带宽 | 终端流低 ✅ |
| 合规/审计 | **公司已安全报备**，走审计通道 |

→ 唯一让 iOA Mac 成为被控机的可行路径；比 uurc-web / herdr-web 都优（后两者是「绕开公司机器」的妥协）。

### 11.5 必须确认的开放问题（置信度标注，据架构图大幅收敛）
1. **车机能否到达 TmuxHub（✅ 高概率可行）**：官方架构图（微创新奖 20260506）明确写 PC 站点支持 **「办公网 / 外网」**、**「移动端和外网访问走网关链路」**、**「设备不直连内网」**（太湖零信任网关做反向代理/安全代理）。即：外网设备 → 网关公网入口 → 协议转换+鉴权 → 代理到内网 TmuxHub。车机 LTE 属于「外网设备」范畴，**设计上就是给这类场景用的**。待实测：特斯拉浏览器能否打开 `tmuxhub.woa.com`（或其网关对外入口）并维持 WebSocket。
2. **车机登录方式（✅ 高概率：扫码登录）**：架构图移动站点登录方式为 **「企业微信 / 微信 / 手机 iOA」**，标准流程 = 页面展示二维码 → 手机扫码（已有 iOA/企微登录态）→ 确认登录 → 车机拿到 session。**无需车机走完整 SSO**，也无需 ticket 分享链接（那是备选）。这是太湖网关为移动/外网设备设计的标准认证流程。待验：PC 站点是否也展示二维码（大概率是，因 PC 也支持外网）。
3. **安全报备覆盖范围**：报备的是「tmux 远控」，但「远程驱动个人 coding agent / 跑 Herdr / 接 CodeBuddy 网关」是否在范围内——建议向安全/owner 确认，避免超范围。
4. **个人使用与 DLP**：通道合规但内容受审计；个人项目/非工作时间需注意公司政策。
5. **Herdr `ctrl+b` prefix 与 tmux 按键**：TmuxHub 把键发进 pane，Herdr 收到；需同时控 tmux 层级键时在 TmuxHub 侧单独处理——可用性细节，非阻塞。

### 11.6 路径优先级（最终，据官方事实收敛）
1. **首选：TmuxHub + iOA 通道（§11）** —— 官方内部产品（`tmuxhub.woa.com`/太湖网关），iOA Mac 经报备通道直接作被控机，**无需个人 Mac、无需香港 VPS、无需 UU**。车机用**扫码登录**（企微/微信/iOA）进入，架构图明确支持外网设备走网关链路。
2. **次选：Herdr + herdr-web（§9）** —— 仅当 TmuxHub 车机不可达时的纯自托管备选（个人 Mac + 自有 HK VPS）。
3. **回退：uurc-web + UU 全桌面（§13）** —— 仅全桌面刚需且前两者皆不可行时。
- LLM 后端三者统一：**本机 CodeBuddy 网关 127.0.0.1:8787**（§3），不吃 iOA。

### 11.7 落地顺序
1. 先在 PC/手机上打开 `tmuxhub.woa.com`，确认**外网可达** + 登录页展示**二维码**（验证架构图的外网+扫码设计）；
2. 零成本验证（个人 Mac + OSS TmuxHub 自托管）：起 server → tmux 跑 herdr → 浏览器 attach → 确认 herdr TUI 可驱动、agent 走 127.0.0.1:8787 网关可用。
3. 接 iOA transport：agent 改 `--transport ioa` 连公司服务器，验证 iOA Mac 可受控。
4. 语音：手机 STT → `/input` API 注入验证。
