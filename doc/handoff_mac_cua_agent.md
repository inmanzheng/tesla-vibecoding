# Handoff：被控 Mac 接通 Cua + uurc-mac-agent

- 文档性质：交给**被控那台 Mac 上的 AI** 执行（本机装 Cua、起小代理；不改 uurc-web、不碰香港 VPS）
- 日期：2026-09-06
- 关联：`doc/handoff_install_cua_driver.md`（只装 Driver 的上一张票，步骤可复用）、`doc/handoff_mac_vpn_split.md`（VPN 分流）、`doc/handoff_car_term_tab.md`（车机远控页终端 Tab，由仓库 AI 改 VPS；本机仍跑本代理）
- 上游 Cua：https://github.com/trycua/cua （MIT）
- 官方安装：https://cua.ai/docs/how-to-guides/driver/install
- 目标机器：个人 Mac（Sonoma 14+，Apple Silicon 或 Intel）。公司 iOA 管控机可能拦辅助功能，不要在未报备机器上硬装。

车机网页、`/pair`、远控 CUA 面板已经在 VPS 上线。**本票只做被控机这一头**：让 Cua 能列/开 App，并让小代理去轮询 VPS。

---

## 给你（被控机 AI）的任务

在**这台 Mac** 上一次做完两件事：

1. 装好并跑通 **Cua Driver**（`cua-driver`）。只要 Driver，不要 Sandbox / Lume。
2. 常驻跑 **uurc-mac-agent**（Node 脚本）。它只连 `127.0.0.1` 的 `cua-driver`，再轮询香港 VPS 的 `input-bridge`。

做完后：车机远控页说「打开微信」，或手机 `/pair` → 应用，应能真正切到/打开本机窗口。画面和声音仍走 UU，不要自己推视频。

---

## 架构（不要接错线）

```
车机 /pair 或远控 CUA 面板
        ↓ HTTPS
香港 VPS  https://43.161.198.131
  /api/input-bridge/active/agent-next   ← 你轮询这个
  /api/input-bridge/active/agent        ← 你上报应用列表
        ↓
本机 uurc-mac-agent（本票要起的进程）
        ↓ 只连 localhost
cua-driver（CuaDriver.app serve）
        ↓
本机微信 / Safari / Chrome / Finder / Cursor / 终端
```

- **不要**把 `cua-driver` 绑到 `0.0.0.0`。
- **不要**自己写 CGEvent / 键鼠注入。打字和触控板由车机 UU 做。
- **不要**改 VPS、Caddy、uurc-web 前端。
- 配对页和 ` /api/input-bridge/* ` **不用** Caddy 口令（`1111` / `88888888`）。首页才要。

---

## 0. 先确认环境

在终端执行并记下结果：

```bash
sw_vers
uname -m
node -v
which cua-driver || true
ls /Applications/CuaDriver.app 2>/dev/null || true
```

- `ProductVersion` 须 ≥ 14。更旧系统停下来告诉用户。
- `node` 须 ≥ 18（脚本用内置 `fetch`）。没有就用官网 LTS 或 `brew install node`，不要用系统自带的极老版本。
- 已有 `cua-driver` 且 `cua-driver --version` 正常：跳到 §2 补权限和验收，不要重复装。

安装 Cua 要出网：`https://cua.ai/driver/install.sh`。若开了 VPN，这条可以走代理；装完后 UU 远控仍建议按 `doc/handoff_mac_vpn_split.md` 分流（UU 进程直连）。

---

## 1. 安装 Cua Driver（稳定版，不要 nightly）

```bash
/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"
source ~/.zshrc
hash -r
cua-driver --version
```

安装器会放下 `/Applications/CuaDriver.app`，并做 `~/.local/bin/cua-driver` 软链。`command not found` 时：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

用户若不需要遥测：

```bash
cua-driver telemetry disable
```

权限模式用默认 **`standard`**。不要加 `--dangerously-bypass-approvals`，除非用户书面要求。

**不要** `pip install cua` 去开 Sandbox / Lume——那些是另开一台假电脑，点不到用户正在用的 Cursor / 浏览器。

---

## 2. 先起守护，再要 macOS 权限（顺序不能反）

必须先起 `CuaDriver.app`，TCC 才会记在 App 上，而不是记在 Terminal：

```bash
open -n -g -a CuaDriver --args serve
cua-driver permissions grant
```

系统会出辅助功能、屏幕录制两道框。你指导用户点，AI 点不了那个拨杆：

- 对话框里的「打开系统设置」**本身不授权**，还要在列表里把 **CuaDriver 拨到开**。
- 辅助功能：系统设置 → 隐私与安全性 → 辅助功能
- 屏幕录制：隐私与安全性 → 屏幕与系统音频录制
- 拨开后 macOS 可能要退出并重开 CuaDriver。守护没回来就再执行一次 `open -n -g -a CuaDriver --args serve`
- 两道框常常不会一次出齐。缺哪个再跑一遍 grant。

```bash
open -n -g -a CuaDriver --args serve
cua-driver permissions grant
cua-driver permissions status
```

期望：

```
✅ Accessibility: granted.
✅ Screen Recording: granted.
```

没有守护时 `permissions status` 会报 `❓ unknown`，不要当成已授权。列表里没有 CuaDriver 时，用「+」手动加 `/Applications/CuaDriver.app`。

---

## 3. Cua 验收（必须全过，再起代理）

```bash
cua-driver status
cua-driver doctor
cua-driver permissions status
cua-driver call list_apps
```

| 命令 | 期望 |
|---|---|
| `status` | `Cua Driver daemon is running` |
| `doctor` | binary / install dir 为 ok；警告先记下来，error 要修 |
| `permissions status` | 辅助功能 + 屏幕录制均为 granted |
| `call list_apps` | 能看到本机正在开的 GUI 应用名；空列表则先开一个 App 再调 |

只打印出版本号 **不算** 桌面能力已通。`list_apps` 不过，后面的代理只会上报空列表。

建议顺便打开登录自启（官方「Keep Cua Driver running」），避免重启后 Driver 没了。用户没明确拒绝就做。

---

## 4. 放下 uurc-mac-agent

小代理是一段 **单文件 Node 脚本**，不进 Docker，不需要 npm install。

**有本仓库时**（路径可能略有不同，先找文件）：

```bash
find "$HOME" /Users -name 'index.mjs' -path '*uurc-web/mac-agent/*' 2>/dev/null | head
```

找到就用那份。常见位置：

- `…/Tesla VibeCoding/uurc-web/mac-agent/index.mjs`

**没有仓库时**：把附录 A 原样写成：

```bash
mkdir -p "$HOME/uurc-mac-agent"
# 把附录 A 存成 ~/uurc-mac-agent/index.mjs
chmod +x "$HOME/uurc-mac-agent/index.mjs"
```

不要改脚本逻辑。不要给它加 HTTP 监听、不要转发到局域网。

---

## 5. 启动小代理（常驻）

VPS 证书是 IP 自签，Node 默认会校验证书失败。启动时加上 `UURC_TLS_INSECURE=1`：

```bash
export PATH="$HOME/.local/bin:$PATH"
cd "$HOME/uurc-mac-agent"   # 或仓库里的 uurc-web/mac-agent

UURC_BRIDGE_URL=https://43.161.198.131 \
UURC_BRIDGE_ID=active \
UURC_TLS_INSECURE=1 \
node index.mjs
```

期望日志：

```
[uurc-mac-agent] bridge=https://43.161.198.131 id=active
[uurc-mac-agent] 等待车机进入控制后再上报应用
```

接着可能反复出现 `404 配对已过期或码不正确`——**这是正常的**。车机还没点「控制中」时，VPS 上没有 `active` 会话，代理不要自己 `POST /api/input-bridge` 去建会话（会冲掉车机队列）。

车机进入「控制中」之后，应变成分钟级的长轮询，并出现：

```
[uurc-mac-agent] 已上报 N 个应用
```

或执行任务后的 `ok 已打开应用`。

这个进程要一直开着。不要跑完 `list_apps` 就退出。用户关掉终端它就会停；需要的话用 `tmux` / `screen` 挂着，或做一个登录项，**不要**写成 LaunchDaemon（那是系统会话，没有 GUI，Cua 点不到窗口）。用 LaunchAgent 或用户自己的 tmux。

环境变量（一般不用改）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `UURC_BRIDGE_URL` | `https://43.161.198.131` | VPS，不要改成局域网 |
| `UURC_BRIDGE_ID` | `active` | 固定槽位 |
| `UURC_TLS_INSECURE` | 未设 | 自签证书必须 `1` |
| `CUA_DRIVER_BIN` | `cua-driver` | PATH 里找不到再写绝对路径 |

---

## 6. 联调验收（和用户一起）

代理在跑、Cua 守护在跑之后，让用户在**车机**上：

1. 打开 `https://43.161.198.131`（首页要 Caddy 口令 `1111` / `88888888`，再登 UU）。
2. 连上这台 Mac，点 **控制中**。
3. 打开工具栏 **CUA**，输入「打开微信」或「打开 Safari」，点「交给 Cua」。
4. 本机应对应 App 到前台。代理日志应有 `ok`。

或让用户用手机 Safari 打开（**不要** Caddy 口令）：

`https://43.161.198.131/pair`

底栏点 **应用**：运行中列表应出现本机正在开的窗口（不再是「等待 Mac 助手」）。点「微信」应能激活/打开。

第一期只保证这些名字：微信、Safari、Chrome、Finder、Cursor、终端。不做「给某某发微信」。

回车 / 取消 / 复制 / 粘贴 / 关掉前台窗口：由车机画面键鼠执行，代理看到这类任务应打 `skip`（「这句由车机画面执行」），不要再注入一次。

---

## 7. 本票不要做

- 不要把 Cua 或代理监听 `0.0.0.0` / 对局域网开放
- 不要自己实现键鼠、截屏推流、第二路 WebRTC
- 不要 `pip install cua` 开 Sandbox / Lume
- 不要改香港 VPS、Docker、Caddy、手机 `/pair` 源码
- 不要在 iOA 管控机上绕过安全策略装
- 不要默认 `unrestricted` 或 `--dangerously-bypass-approvals`
- 不要把 MCP 强行写进 Cursor/Codex，除非用户接着说「接到某某客户端」
- 不要用代理去发微信消息、点 App 内部按钮（第一期不做 AX）
- 不要全局 TUN VPN 包住 UU；翻墙按 `handoff_mac_vpn_split.md` 分流
- 不要在这台机器上实现车机「终端」页或改 uurc-web；那张票是 `doc/handoff_car_term_tab.md`，PTY 仍由本代理在本机 attach tmux

---

## 8. 做完怎么回用户

用几行纯文本回复，不要只说「好了」：

1. `cua-driver --version`
2. `permissions status` 两行是否 granted
3. `list_apps` 里 3～5 个应用名
4. 代理启动命令、是否还在跑（pid / tmux）
5. 车机点「控制中」之后，代理是否打出「已上报 N 个应用」或 `404` 是否消失
6. 若失败：卡在安装 / TCC / 守护 / Node 证书 / 404 一直不消失，贴关键命令输出

---

## 附录 A — `index.mjs`（无仓库时使用）

把下面整文件保存为 `~/uurc-mac-agent/index.mjs`，不要改逻辑。

```javascript
#!/usr/bin/env node
/**
 * 被控 Mac 小代理：轮询 VPS input-bridge，只把 activate/launch/cua 交给本机 cua-driver。
 * 不监听 0.0.0.0，不注入键鼠。画面声音仍走 UU。
 *
 *   UURC_BRIDGE_URL=https://43.161.198.131 UURC_TLS_INSECURE=1 node index.mjs
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BRIDGE_URL = (process.env.UURC_BRIDGE_URL || "https://43.161.198.131").replace(/\/$/, "");
const BRIDGE_ID = process.env.UURC_BRIDGE_ID || "active";
const CUA_BIN = process.env.CUA_DRIVER_BIN || "cua-driver";
const WAIT_MS = Number(process.env.UURC_AGENT_WAIT_MS || 20000);
const TLS_INSECURE = process.env.UURC_TLS_INSECURE === "1";

if (TLS_INSECURE) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

async function requestJson(path, init = {}) {
  const response = await fetch(`${BRIDGE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && typeof body.error === "string" ? body.error : `${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function reportAgent(payload) {
  return requestJson(`/api/input-bridge/${encodeURIComponent(BRIDGE_ID)}/agent`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

async function pullAgentEvents() {
  return requestJson(`/api/input-bridge/${encodeURIComponent(BRIDGE_ID)}/agent-next?waitMs=${WAIT_MS}`);
}

async function cuaCall(tool, args = {}) {
  const payload = JSON.stringify(args);
  const attempts = [
    [CUA_BIN, ["call", tool, payload]],
    [CUA_BIN, ["call", tool, `--args=${payload}`]],
    [CUA_BIN, ["call", tool]],
  ];
  let lastError = new Error("cua-driver 调用失败");
  for (const [bin, argv] of attempts) {
    try {
      const { stdout } = await execFileAsync(bin, argv, { timeout: 15_000, maxBuffer: 2_000_000 });
      return parseCuaOutput(stdout);
    } catch (caught) {
      lastError = caught instanceof Error ? caught : new Error(String(caught));
      if (caught && typeof caught === "object" && "code" in caught && caught.code === "ENOENT") {
        throw new Error("本机没有 cua-driver。装好后再开这个助手。");
      }
    }
  }
  throw lastError;
}

function parseCuaOutput(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("[") >= 0 ? text.indexOf("[") : text.indexOf("{");
    if (start >= 0) {
      try {
        return JSON.parse(text.slice(start));
      } catch {
        return text;
      }
    }
    return text;
  }
}

function normalizeApps(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.apps) ? raw.apps : [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name ?? item.app_name ?? item.title ?? "").trim();
      if (!name) return null;
      return {
        name,
        bundleId: item.bundleId ?? item.bundle_id ?? item.bundleID,
        pid: Number.isInteger(item.pid) ? item.pid : undefined,
        running: item.running !== false,
        active: Boolean(item.active ?? item.is_active ?? item.frontmost),
      };
    })
    .filter(Boolean)
    .slice(0, 80);
}

async function listApps() {
  const raw = await cuaCall("list_apps");
  return normalizeApps(raw);
}

async function launchOrActivate(target) {
  const args = {
    ...(target.bundleId ? { bundle_id: target.bundleId, bundleId: target.bundleId } : {}),
    ...(target.name ? { name: target.name, app_name: target.name } : {}),
    ...(target.pid !== undefined ? { pid: target.pid } : {}),
  };
  await cuaCall("launch_app", args);
}

async function snapshotApps() {
  try {
    const apps = await listApps();
    const frontmost = apps.find((app) => app.active)?.name ?? "";
    await reportAgent({ apps, frontmost });
    return { apps, frontmost, ok: true };
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : "无法列出应用";
    await reportAgent({ apps: [], frontmost: "" }).catch(() => undefined);
    return { apps: [], frontmost: "", ok: false, detail };
  }
}

async function handleEvent(event) {
  if (event.type === "launch" || event.type === "activate") {
    await launchOrActivate(event);
    return { text: event.name || event.bundleId || "app", ok: true, detail: event.type === "activate" ? "已切换应用" : "已打开应用" };
  }
  if (event.type !== "cua") {
    return { text: "unknown", ok: false, detail: "不支持的助手事件" };
  }
  const intent = event.intent ?? { kind: "unknown" };
  if (intent.kind === "launch" || intent.kind === "activate") {
    await launchOrActivate(intent);
    return { text: event.text, ok: true, detail: `已${intent.kind === "activate" ? "切换" : "打开"} ${intent.name ?? ""}`.trim() };
  }
  if (intent.kind === "shortcut" || intent.kind === "type") {
    return { text: event.text, ok: false, detail: "这句由车机画面执行，助手不用再点一次" };
  }
  return { text: event.text, ok: false, detail: "还不认识这句" };
}

async function loop() {
  console.log(`[uurc-mac-agent] bridge=${BRIDGE_URL} id=${BRIDGE_ID}`);
  console.log("[uurc-mac-agent] 等待车机进入控制后再上报应用");

  while (true) {
    try {
      const pulled = await pullAgentEvents();
      const events = Array.isArray(pulled?.events) ? pulled.events : [];
      const results = [];
      for (const event of events) {
        try {
          const result = await handleEvent(event);
          results.push({ ...result, at: Date.now() });
          console.log(`[uurc-mac-agent] ${result.ok ? "ok" : "skip"} ${result.detail}`);
        } catch (caught) {
          const detail = caught instanceof Error ? caught.message : "执行失败";
          results.push({ text: event.text || event.name || event.type, ok: false, detail, at: Date.now() });
          console.warn(`[uurc-mac-agent] fail ${detail}`);
        }
      }
      if (results.length > 0) {
        await reportAgent({ results });
      }
      await snapshotApps();
    } catch (caught) {
      const status = caught && typeof caught === "object" && "status" in caught ? caught.status : 0;
      const detail = caught instanceof Error ? caught.message : "轮询失败";
      console.warn(`[uurc-mac-agent] ${status} ${detail}`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

void loop();
```
