# Handoff：在被控 Mac 上安装 Cua Driver

- 文档性质：交给**被控那台 Mac 上的 AI** 执行（本机安装，不改 uurc-web、不碰香港 VPS）
- 日期：2026-09-06
- 上游项目：https://github.com/trycua/cua （MIT）
- 官方安装说明：https://cua.ai/docs/how-to-guides/driver/install
- 目标机器：个人 Mac（Sonoma 14+，Apple Silicon 或 Intel）。公司 iOA 管控机可能拦辅助功能，不要在未报备机器上硬装。

---

## 给你（被控机 AI）的任务

在**这台 Mac** 上装好并跑通 **Cua Driver**（`cua-driver`），让本机可以被 Computer Use agent 点窗口、打字、截屏。

只要 Driver。不要装 Cua Sandbox、不要装 Lume 虚拟机——那些是另开一台假电脑，点不到用户正在用的 Cursor / 浏览器。

装完用 `cua-driver doctor`、`permissions status`、`call list_apps` 验收。手机配对页接线、混元/Workbuddy 当脑子，**本票不做**（除非用户另外说）。

---

## 0. 先确认环境

在终端执行并记下结果：

```bash
sw_vers
uname -m
which cua-driver || true
ls /Applications/CuaDriver.app 2>/dev/null || true
```

- `ProductVersion` 须 ≥ 14。更旧系统停下来告诉用户。
- 已有 `cua-driver` 且 `cua-driver --version` 正常：跳到 §3 补权限和验收，不要重复装。

需要出网下载 `https://cua.ai/driver/install.sh`。若开了 VPN，这条安装流量可以走代理；装完后 UU 远控仍建议按 `doc/handoff_mac_vpn_split.md` 分流（UU 进程直连）。

---

## 1. 安装（稳定版，不要 nightly）

```bash
/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"
```

安装器会：

- 放下 `/Applications/CuaDriver.app`
- 做 `~/.local/bin/cua-driver` 软链
- 必要时往 `~/.zshrc`（或 bash/fish rc）加 PATH

然后：

```bash
source ~/.zshrc
hash -r
cua-driver --version
```

若 `command not found`：新开一个终端，或 `export PATH="$HOME/.local/bin:$PATH"` 再试。

默认会发无内容产品遥测。用户若不需要：

```bash
cua-driver telemetry disable
```

权限模式用默认 **`standard`**。不要加 `--dangerously-bypass-approvals`，除非用户书面要求。

---

## 2. 先起守护进程，再要 macOS 权限（顺序不能反）

必须先起 `CuaDriver.app`，TCC 才会记在 App 上，而不是记在 Terminal：

```bash
open -n -g -a CuaDriver --args serve
```

然后（可能要用户点系统设置，你指导即可，AI 点不了那个拨杆）：

```bash
cua-driver permissions grant
```

系统会出辅助功能、屏幕录制两道框。注意：

- 对话框里的「打开系统设置」**本身不授权**，还要在列表里把 **CuaDriver 拨到开**。
- 辅助功能：系统设置 → 隐私与安全性 → 辅助功能
- 屏幕录制：隐私与安全性 → 屏幕与系统音频录制
- 拨开后 macOS 可能要退出并重开 CuaDriver，同意。若守护没回来：再执行一次 `open -n -g -a CuaDriver --args serve`
- 两道框常常不会一次出齐。查状态，缺哪个就再跑一遍 grant：

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

## 3. 验收（必须全过）

```bash
cua-driver status
cua-driver doctor
cua-driver permissions status
cua-driver call list_apps
```

通过标准：

| 命令 | 期望 |
|---|---|
| `status` | `Cua Driver daemon is running` |
| `doctor` | binary / install dir 为 ok；警告先记下来，error 要修 |
| `permissions status` | 辅助功能 + 屏幕录制均为 granted |
| `call list_apps` | 能看到本机正在开的 GUI 应用名；空列表则先开一个 App 再调 |

只打印出版本号 **不算** 桌面能力已通。

---

## 4. 开机自启（建议做）

按官方「Keep Cua Driver running」打开登录自启，避免重启后远控时 Driver 没了。用户没明确拒绝就做。

---

## 5. 本票不要做

- 不要 `pip install cua` 去开 Sandbox / Lume
- 不要改香港 VPS、uurc-web、手机 `/pair` 页
- 不要在 iOA 管控机上绕过安全策略装
- 不要默认 `unrestricted` 权限模式
- 不要把 MCP 强行写进 Cursor/Codex，除非用户接着说「接到某某客户端」

---

## 6. 做完怎么回用户

用几行纯文本回复：

1. `cua-driver --version` 输出  
2. `permissions status` 两行是否 granted  
3. `list_apps` 里 3～5 个应用名  
4. 若失败：卡在安装 / TCC / 守护没起来，贴关键命令输出  

装完 Driver 之后，下一张票是起小代理并和车机联调，见 `doc/handoff_mac_cua_agent.md`。若用户只把那份交给你，按那份做即可（已含本票步骤）。
