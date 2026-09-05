# Tesla 车内 Vibecoding — 最终执行方案（UU 远程 + Web 端）

> 执行环境：**一台全新的、完全脱离公司内网的私人 Mac**（macOS Sonoma 及以上）。
> 执行方式：**在这台新 Mac 上借助 AI（CodeBuddy / Claude / 任意 Agent）逐步执行本 runbook**。
> 目标：特斯拉车机浏览器（纯网页、不能装 App）+ 语音，远程控这台私人 Mac 做 vibecoding；手机同账号也能控。

---

## 0. 方案要点（为什么是这样）

| 维度 | 决策 |
|---|---|
| 受控机 | **私人 Mac，完全脱离公司内网**（同时绕开 iOA 墙 + 合规风险） |
| 远控 | **网易 UU 远程**：官方客户端开"被控" + 官方 Web 端给车机/手机控 |
| 车机入口 | UU 官方 Web 端（车机浏览器直开，**不**需香港 VPS / Caddy / uurc-web） |
| 传输 | 整屏桌面视频（UTUNNEL / WebRTC）；**特斯拉车机流量免费** |
| LLM 后端 | 受控机本机 **CodeBuddy 网关 `127.0.0.1:8787`**（copilot.tencent.com，住宅网可达，不依赖 iOA） |
| 研发现场 | `tmux` → `herdr` → **Pi+Herdr 编队（5 tab / 8 角色）** |
| 语音 | 手机 UU「麦克风直连」→ 私人 Mac 麦 → agent 听见 |

**为什么废弃 TmuxHub**：车机实测 TmuxHub Web 控制台强制 iOA 登录，车机装不了 iOA → 进不去，硬阻断。

---

## 1. 执行前准备物（从公司 Mac 导出，带到新 Mac）

本方案依赖一台已配好的公司 Mac 上的成熟配置。执行前请先在该机导出**迁移包**：

| 迁移内容 | 路径（公司 Mac 上） | 说明 |
|---|---|---|
| CodeBuddy 网关真源 | `~/Documents/codebuddy2api` | 含 `.config` / `.venv` / `Dockerfile` / `README.md` |
| herdr 配置 | `~/.config/herdr` | herdr 用户配置 |
| pi agent 配置 | `~/.pi/agent` | `models.json` / `auth.json` / `bin` / `extensions` / `skills` |
| Pi+Herdr 编队项目 | `~/Documents/Pi+Herdr` | `fleet.yaml` / `spawn-fleet.sh` / `agents/` / `docs/` |
| 运行时期望版本 | node v22.23.1 / npm 10.9.8 / pi 0.84.2 / herdr 0.8.0 / tmux 3.7c | 新 Mac 尽量对齐 |

> 导出建议：把以上打成 `migration-bundle.tar.gz`，拷到新 Mac 后解压到对应位置（路径见 Phase C）。
> **注意**：新 Mac 脱离公司网，**npm 必须用公网 registry**（`npm config set registry https://registry.npmjs.org/`），不要用 `mirrors.tencent.com`。

新 Mac 基础要求：
- macOS Sonoma+，有管理员账户，能装软件、能上网（住宅宽带或手机热点均可，**非公司网络**）。
- 一个 **UU 账号**（手机号注册，收短信）。
- **CodeBuddy 企业订阅授权**（授权文件 / 登录态，随账号走）。

---

## 2. 执行流程（在新 Mac 上，AI 逐步执行）

### Phase A — 远控底座（UU）
```
A1. 浏览器开 uuyc.163.com/download，下载安装「网易 UU 远程」macOS 版，登录 UU 账号。
A2. 打开「允许本设备被控」；按提示到 系统设置 > 隐私与安全性 授予：
       - 屏幕录制（Screen Recording）
       - 辅助功能（Accessibility）
    并设 UU 开机自启（保证离开后仍能连）。
A3. 手机装「网易 UU 远程」APP，登录同一 UU 账号 → 设备列表选这台 Mac → 发起控制。
    验证：手机能看桌面、能触屏 / 虚拟键鼠操作。
A4. ⚠️【关键 Gate V0】车机浏览器开 UU 官方 Web 端（uuyc.163.com 的 Web 控制入口，具体路径以官网当前页为准），
    登录同一账号 → 看到这台 Mac → 出画面。
    → 不通则整条方案止步，回退见 §5（uurc-web 自托管 / 仅手机控）。
```

### Phase B — 运行时与 CodeBuddy 网关
```
B1. 装基础工具（如未装）：
       /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
       brew install node@22 tmux python3
       # 或用 nvm 装 node v22.23.1，尽量对齐
B2. 部署 CodeBuddy 网关（用迁移包里的 codebuddy2api）：
       解压 migration-bundle 中的 codebuddy2api 到 ~/Documents/codebuddy2api
       按 codebuddy2api/README.md 起服务，监听 127.0.0.1:8787
       激活 CodeBuddy 授权（授权文件 / 登录态）
B3. 验证网关：
       curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/   # 期望 200
       curl -s -o /dev/null -w "%{http_code}\n" https://copilot.tencent.com/  # 住宅网应可达
```

### Phase C — herdr / pi / Pi+Herdr 编队
```
C1. 恢复 pi / herdr（确保公网 registry）：
       npm config set registry https://registry.npmjs.org/
       npm install -g --ignore-scripts @earendil-works/pi-coding-agent   # 期望 pi 0.84.2
       # herdr 按原方式安装（与公司 Mac 同版本 0.8.0）
C2. 从迁移包恢复配置：
       恢复 ~/.pi/agent（models.json / auth.json / bin / extensions / skills）
       恢复 ~/.config/herdr
       恢复 ~/Documents/Pi+Herdr 项目
C3. herdr 集成与技能：
       herdr integration install pi
       npx skills add herdrdev/herdr --skill herdr -g -a pi
C4. 起 tmux 现场：
       tmux new -s herdr -d 'herdr'
C5. 拉起编队（在 Pi+Herdr 目录）：
       cd ~/Documents/Pi+Herdr
       python3 spawn-fleet.sh use --workdir <你的目标仓路径>
       python3 spawn-fleet.sh up --dry     # 先 dry-run 看拓扑
       python3 spawn-fleet.sh up           # 真正拉起 5 tab / 8 角色
C6. 验证：
       本地 `tmux attach -t herdr` 应看到 herdr TUI + 5 tab（决策编排/调研/执行/逆向/维护观测）+ 8 角色 pane
       手机 UU 控屏也应能看到同一 herdr TUI
```

### Phase D — 车机实测闭环
```
D1. 车机开 UU Web 端 → 控这台 Mac → 看到桌面上的 herdr TUI。
D2. 用 Web 软键盘 / 触屏，对 `brain` 派一个最小任务，验证编队响应（brain→专家→回收）。
D3. 语音：手机 UU 开「麦克风直连」，车里说话 → 验证 Mac 侧 agent 听见并执行。
```

---

## 3. 验证 Gate 清单（任一红即止步排查）

| Gate | 验证项 | 失败去向 |
|---|---|---|
| V0 | 车机 Web 端看到 Mac 画面 | §5 回退（uurc-web / 仅手机） |
| V1 | 手机 APP 控住 Mac（画面+操作） | 查 UU 账号/权限/版本 |
| V2 | 手机麦克风直连，Mac 收到声音 | 查 UU APP 开关 + 手机麦克风权限；或改 STT 注入 |
| V3 | 网关 127.0.0.1:8787 = 200；copilot.tencent.com 可达 | 查 CodeBuddy 授权 / 网络 |
| V4 | herdr 编队 5 tab / 8 角色起 | 查 spawn-fleet / pi / 技能池 |
| V5 | 车机驱动编队闭环 + 语音 | 调网络 / STT 源 |

---

## 4. 基于 UU Web 端的「功能定制」（Phase E，可选，先确认 UU 能力边界）

- **E1. 受控机本地控制面板（网页）**：编队 `up`/`down`、切 herdr tab、常用 Action 一键按钮，经 UU 画面点。
- **E2. 语音注入端点**：手机 STT → `POST` 注入当前 pane（麦克风直连不稳时的备选）。
- **E3. 排障 / 重跑测试做成 herdr Action**，车机一键触发。
- **E4. 若 UU Web 端开放 API / 嵌入，做轻量外壳串联**。

> 定制依赖 UU Web 端实际能力（是否开放 API / 可嵌入）。**V0 验证时一并确认**。

---

## 5. 风险与回退

- **UU Web 端车机浏览器不兼容**（单标签 kiosk / 无 devtools）→ 回退 `uurc-web` 自托管 + 香港 VPS + Caddy（旧 Path A），或仅用手机控（手机不能当车，仅语音/应急）。
- **copilot.tencent.com 在住宅网不可达** → 确认 CodeBuddy 授权是否绑内网；必要时网关换公网可达的 LLM provider。
- **企业订阅在私人 Mac 使用的 ToS / 合规** → 网络已隔离，但账号层面属个人判断，自行评估。
- **UU 免费版限制**（会话时长 / 分辨率）→ 实测；如需长任务购买对应套餐。
- **新 Mac 休眠 / 断网** → 设防休眠（caffeinate / 系统设置）、UU 开机自启、保持联网。

---

## 6. 给执行 AI 的命令速查

```bash
# 基础
brew install node@22 tmux python3
npm config set registry https://registry.npmjs.org/

# 网关
# （解压 codebuddy2api 后按 README 起 127.0.0.1:8787）
curl -s -o /dev/null -w "gw=%{http_code}\n" http://127.0.0.1:8787/

# herdr / pi
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
herdr integration install pi
npx skills add herdrdev/herdr --skill herdr -g -a pi

# 现场 + 编队
tmux new -s herdr -d 'herdr'
cd ~/Documents/Pi+Herdr
python3 spawn-fleet.sh use --workdir <目标仓>
python3 spawn-fleet.sh up --dry
python3 spawn-fleet.sh up
tmux attach -t herdr
```

> 关键约束回顾：外层 tmux 与 herdr 都可能用 `ctrl+b` 前缀；UU 是整屏视频流、经 `tmux send-keys` 注入不受影响。车机键盘用 UU Web 端自带软键盘，绕开特斯拉原生 OSK 打不进画布的坑。
