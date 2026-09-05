# 调研 — 特斯拉车机远程控制电脑做语音 Vibecoding（开源方案）

> 需求：在特斯拉车机浏览器里，**语音输入 + 键鼠控制**一台家用电脑，用 Claude Code / Cursor / Aider 等做"车上 vibecoding"。
> 要求：方案尽量开源、可自托管、客户端是纯网页（车机不能装 App）。
> 调研时间：2026-09-05（cwd `/Users/iveszheng/Documents/One`）
> 证据等级：**FACT** = 读自 GitHub/官方 docs；**VENDOR** = 项目/作者自称；**UNVERIFIED** = 单一车主 anecdote / 未证实。
> 本文只做调研，不写实现代码。

---

## 0. 结论速读（TL;DR）

**可行，但仅限较新车（AMD Ryzen + 固件 2026.26+），且语音大概率只能"停车时用"。** 已经有开源项目把整套跑通了：

- **核心参考实现 = `thegridbase-ai/cockpit`**（GitHub，开源）：自托管"车机浏览器启动器 + noVNC 远程桌面 + 自定义屏幕键盘 + Web Speech API 语音听写注入按键"。**这就是本需求的开源雏形**，直接 fork 改即可。
- **远程桌面**：纯网页客户端首选 **noVNC + websockify**（Linux/macOS VNC）或 **Apache Guacamole**（Windows RDP，Apache-2.0，最稳）。两者都是"打开网页即可，无需安装"。
- **语音 STT**：车机里最简单可用的是 **Web Speech API**（Cockpit 已验证在特斯拉浏览器可用，车机本身在线走 Google 语音）；若要完全自托管/离线，用 **whisper.cpp WASM** 在浏览器内跑。
- **网络打通**：家→车之间用 **Cloudflare Tunnel**（最简单，免费，无需公网 IP，Cockpit 即用）或 **Headscale + Tailscale**（完全自托管的 L3 VPN）。
- **最大坑**：特斯拉**原生屏幕键盘打不进远程桌面画布** → 必须自带一个 Web 键盘覆盖层（Cockpit 已做）；**麦克风/摄像头会议仅停车可用**；Intel 老车（MCU1）被排除；蓝牙键鼠配对未证实。

---

## 1. 需求拆解（三层）

| 层 | 作用 | 开源候选 |
|---|---|---|
| **A. 车机客户端** | 特斯拉浏览器里打开一个网页，显示远程桌面 + 语音输入 | 纯网页远程桌面 + Web 键盘 + STT |
| **B. 家用电脑服务端** | 被控机运行桌面流（VNC/RDP）+ STT（可选）+ 隧道入口 | noVNC/Guacamole + frp/CF Tunnel |
| **C. 网络** | 车（LTE/WiFi）↔ 家（NAT 后）的稳定长连接 | Cloudflare Tunnel / Headscale |

---

## 2. 远程桌面方案对比（GitHub 开源，纯网页客户端）

| 方案 | 仓库 / License | 客户端纯网页 | 自托管服务端 | 协议 | 键鼠/剪贴板/音频 | 车机契合 |
|---|---|---|---|---|---|---|
| **noVNC + websockify** | `novnc/noVNC` (MPL-2.0) + `novnc/websockify` (LGPL-3) | ✅ 纯 HTML5 | ✅ websockify + 主机 VNC | VNC | 键鼠✅ / 剪贴板✅(有限) / 音频❌ | **高**（最简单纯网页，Cockpit 用此） |
| **Apache Guacamole** | `apache/guacamole-server`+`client` (Apache-2.0) | ✅ 纯 HTML5 "clientless" | ✅ Tomcat + guacd 守护 | RDP/VNC/SSH/Telnet | 键鼠✅ / 剪贴板✅ / 音频✅(RDP/VNC) | **高**（RDP 到 Windows 家用机最稳） |
| **RustDesk Web** | `rustdesk/rustdesk` (AGPL-3.0) + `rustdesk/rustdesk-web` | ✅ 浏览器版 | ✅ 需自建 hbbs/hbbr 中继 | 专有(WS 中继) | 键鼠✅ / 剪贴板✅ / 音频🔶(web 部分) | 中（需中继，嵌入式浏览器成熟度待验证） |
| **Kasm Workspaces** | `kasmtech/kasm_workspaces` (CE 受限许可) | ✅ 纯网页 | ✅ Docker 栈 | KasmVNC/流 | 全✅ / 多屏✅ | 中（CE 仅非商用+5会话，重） |
| **MeshCentral** | `Ylianst/MeshCentral` (Apache-2.0) | ✅ 网页 | ✅ Node 服务 + 被控端 agent | RDP/VNC + WebRTC | 全✅ | 中（需 agent；WebRTC 在受限浏览器可能受阻） |
| **Pi-KVM** | `pikvm/pikvm` (GPL-2.0) | ✅ 网页控制 | ✅ 需树莓派硬件接 HDMI/USB | 硬件 KVM-over-IP | BIOS 级键鼠✅ | 中（需硬件，非纯软件） |
| **Remotely** | `immense/Remotely` (GPL-3.0) | ✅ Web UI | ✅ ASP.NET + 被控端 .NET agent | 专有(SignalR) | 屏幕/文件/终端✅ | 低（强依赖 agent，非瘦客户端 KVM） |

**建议**：Linux/macOS 家用机 → **noVNC**；Windows 家用机或要音频 → **Guacamole(RDP)**。两者都不依赖 WebRTC（避开车机 WebRTC 不确定性），走 WebSocket，已被 Cockpit 证明可在车机长连。

---

## 3. 语音 STT 方案（开源，尽量不依赖付费 API）

| 工具 | 仓库 / License | 跑在哪 | 实时 | 备注 |
|---|---|---|---|---|
| **Web Speech API** | 浏览器内置（无仓库） | 车机 Chromium | ✅ 流式 | **特斯拉浏览器可用**（Cockpit 已验证，车机在线走 Google 语音）；Chrome 139+ 有实验性本地模式。最省事。 |
| **whisper.cpp WASM** | `ggml-org/whisper.cpp` (MIT) | 浏览器 WASM / 原生 | ✅（`./stream` 麦克风示例） | 完全自托管、离线；车机 CPU 弱，需 tiny/base 模型，延迟 UNVERIFIED |
| **transformers.js / whisper-web** | `xenova/whisper-web` (MIT) | 浏览器 WASM / WebGPU | 🔶 示例为批量 | 全离线；实时流式 UNVERIFIED |
| **faster-whisper** | `SYSTRAN/faster-whisper` (MIT) | 服务端(Python) | 需 WhisperLive 等 | 比 openai/whisper 快~4x；高准确度，吃家用机算力 |
| **OpenAI Whisper** | `openai/whisper` (MIT) | 服务端 | ❌ 批量 | 基准模型，不直接实时 |

**集成模式（设计说明，非代码）**：
1. 车机网页捕获麦克风 → STT → 文本。
2. 文本落地到远程 coding agent 有两种：
   - **(a) 剪贴板**：远程桌面协议本就传键鼠；配套网页把听写文本写入远程剪贴板再粘贴进 Claude Code/Cursor/Aider。
   - **(b) 按键注入**：家用机跑一个小服务（经同一条隧道可达），接收文本并以 `xdotool`/`pyautogui` 注入为按键 → "按下说话→打字"体验更顺。
3. **语音只需变成文本**，远程桌面协议负责把它当键击送达。

> ⚠️ 注意：voice 分支原判断"Web Speech API 在剥离/离线 Chromium 不能用"——但**特斯拉浏览器是联网的 Chromium（带 Google 语音服务）**，且 Cockpit 实测可用，故对特斯拉场景 Web Speech API 反而是最省事的真选项。

---

## 4. 网络打通方案（自托管优先）

| 工具 | 仓库 / License | 自托管？ | 给什么 | 个人免费 |
|---|---|---|---|---|
| **Cloudflare Tunnel** | `cloudflare/cloudflared` (Apache-2.0) | 🔶 需 CF 边缘账号 | L7 HTTP(S) 隧道，出站（不开端口） | ✅ 免费（非完全自托管） |
| **Headscale + Tailscale** | `juanfont/headscale` (BSD-3) + `tailscale/tailscale` 客户端 | ✅ 完全自托管控制面 | L3 WireGuard VPN（整网可达） | ✅ |
| **frp** | `fatedier/frp` (Apache-2.0) | ✅ 需公网 VPS | L7 反代/隧道 | ✅ |
| **rathole** | `rapiz1/rathole` (Apache-2.0) | ✅ 需 VPS | L4 高性能反代 | ✅ |
| **bore** | `ekzhang/bore` (MIT) | ✅ 需 VPS | L4 TCP 隧道 | ✅ |

**建议**：不想折腾 VPS → **Cloudflare Tunnel**（Cockpit 即用，免费、不开端口、给一个 `*.trycloudflare.com` 或自定义域名）。要完全自控 → **Headscale**（自建协调服务器，Tailscale 客户端 BSD-3 开源）。

---

## 5. 特斯拉浏览器能力 / 限制（可行性关键）

| 维度 | 结论 | 等级 |
|---|---|---|
| 引擎 | Chromium 系（2019 起弃 WebKit；2022.12.1 升新版）；AMD Ryzen 车快，Intel MCU1 老车卡 | FACT(厂商/社区) |
| 麦克风 `getUserMedia` | **2026.26** 起浏览器可申请车内麦克风（仅 AMD；Intel 排除）；但标准 `getUserMedia()` 能否直接拿到仍 UNVERIFIED（有开发者称摄像头未被标准 API 拾取） | FACT(厂商)+UNVERIFIED |
| WebRTC | 2026.26 起 Meet/Teams/Discord 可用 → WebRTC 实可用；老车主也跑过 Chrome Remote Desktop | FACT(厂商) |
| WebSocket | Cockpit 证明车机浏览器内**长连 WebSocket（noVNC↔websockify）成立** → 远程桌面传输可行 | FACT(项目实证) |
| 原生屏幕键盘 | **打不进 VNC/远程画布**；且缺符号键（无 `@`）；Cockpit 自带 HTML QWERTY 覆盖层经 noVNC `RFB.sendKey` 发 X11 keysym 绕过 | FACT(项目实证)+UNVERIFIED |
| 蓝牙键鼠 | 官方蓝牙仅手机/媒体；USB 键鼠车主报告参差；**BT HID 键盘/鼠标配对无权威证实** | UNVERIFIED |
| 剪贴板 API | 单一车主称复制粘贴 UI 可用；`navigator.clipboard` 未实测；Cockpit 刻意避开剪贴板改用按键注入 | UNVERIFIED |
| 多标签/后台 | 实质单标签 kiosk：无扩展、无 devtools、切走可能挂起 → 整个会话必须在一个精心构建的网页里 | FACT(社区) |
| 停车限制 | 摄像头/麦克风会议被描述为**仅停车可用**；行驶中视频被挡 | FACT(社区) |

---

## 6. 现有开源参考实现：Cockpit ⭐

> **`github.com/thegridbase-ai/cockpit`**（开源，VENDOR 级项目自称 + 实证可用）

它**直接命中本需求**：自托管一个"车机浏览器启动器"，内含 **noVNC 远程桌面**（经 Cloudflare Tunnel + websockify 到家机 macOS Screen Sharing）+ **自定义屏幕键盘**（绕过原生键盘打不进画布的问题）+ **Web Speech API 听写**（把语音转文本注入为按键）。

- 不是特斯拉官方项目；带"停车使用"免责声明。
- 已知硬限制同 §5：kiosk、无扩展/devtools、无车辆 API、Intel 车排除、浏览器缓存激进（Cockpit 加 cache-bust 刷新）。
- **建议动作**：直接 fork Cockpit 作起点，把被控端从 macOS Screen Sharing 换成 Linux/macOS 的 VNC（或 Windows 的 Guacamole RDP），把听写落地目标从"通用按键"改成"聚焦到 Claude Code/Cursor/Aider 输入框"。

---

## 7. 推荐架构（落地草图，非代码）

```
[特斯拉车机浏览器]  ──HTTPS/WebSocket──▶  [Cloudflare Tunnel / Headscale]  ──▶  [家用电脑]
   Cockpit 网页                                         隧道入口                    VNC/RDP 服务
   ├─ noVNC 画布 (鼠标=触屏, 键盘=自定义覆盖层)                                  ├─ TigerVNC/x11vnc 或 RDP
   ├─ Web Speech API 听写 → 文本                                                  └─ Claude Code / Cursor / Aider
   └─ 文本 → RFB.sendKey / 剪贴板 / 按键注入服务                                      (语音变成的代码在此跑)
```

**组件清单（开源）**：
- 车端：Cockpit fork（noVNC + 自定义键盘 + Web Speech 听写）
- 家端：VNC 服务（Linux：`tigervnc`/`x11vnc`；macOS：Screen Sharing；Windows：开 RDP 或用 Guacamole）或 Guacamole(RDP)
- 隧道：Cloudflare Tunnel（最快）或 Headscale（最自控）
- （可选）家端 whisper.cpp 服务做高质量 STT，车端只传音频片段

---

## 8. 已知缺口 / 风险（Gaps）

1. **语音行驶中不可用**：麦克风/摄像头会议被描述为仅停车 → "开车时 vibecoding 语音"大概率不行，只能停车用。（FACT 社区）
2. **老车排除**：Intel MCU1 车无 2026.26 麦克风权限，且性能弱。（FACT）
3. **原生键盘打不进画布**：必须自带 Web 键盘覆盖层（Cockpit 已解）。（FACT 实证）
4. **蓝牙键鼠未证实**：别指望直接配对物理键鼠，优先用触屏+Web 键盘。（UNVERIFIED）
5. **剪贴板粘贴进远程 OS 未证实**：优先用按键注入而非剪贴板。（UNVERIFIED）
6. **单标签 kiosk**：整个会话必须在一个网页内，无扩展/devtools。（FACT）
7. **whisper.cpp WASM 车机实时延迟未实测**：需在小模型(tiny/base)上跑基准。（UNVERIFIED）
8. **2026.26 版本号**来自本次检索语料，落地前请核对你的车实际固件版本与浏览器能否申请麦克风。

---

## 9. 证据分级汇总

| 章节 | 等级 |
|---|---|
| §2 远程桌面对比 | FACT（repo/license/docs）+ VENDOR（Kasm CE 许可） |
| §3 STT 对比 | FACT（repo/license）+ FACT（Web Speech 离线限制说明） |
| §4 隧道对比 | FACT（repo/license） |
| §5 特斯拉浏览器 | FACT（厂商发布说明/项目实证）+ UNVERIFIED（单一车主 anecdote） |
| §6 Cockpit | VENDOR（项目自称）+ FACT（repo 存在、README 描述） |
| §7/§8 架构与缺口 | 分析（基于 FACT 推导）+ UNVERIFIED（风险项） |

---

## 10. 引用

- Cockpit（参考实现）：https://github.com/thegridbase-ai/cockpit
- noVNC：https://github.com/novnc/noVNC · websockify：https://github.com/novnc/websockify
- Apache Guacamole：https://guacamole.apache.org · https://github.com/apache/guacamole-server
- RustDesk：https://github.com/rustdesk/rustdesk · web：https://github.com/rustdesk/rustdesk-web
- Kasm：https://github.com/kasmtech/kasm_workspaces · MeshCentral：https://github.com/Ylianst/MeshCentral
- whisper.cpp：https://github.com/ggml-org/whisper.cpp · whisper-web：https://github.com/xenova/whisper-web
- Tailscale：https://github.com/tailscale/tailscale · Headscale：https://github.com/juanfont/headscale
- frp：https://github.com/fatedier/frp · bore：https://github.com/ekzhang/bore · cloudflared：https://github.com/cloudflare/cloudflared
- 特斯拉浏览器能力（厂商/社区）：notateslaapp.com/news/4498（2026.26 麦克风）、teslamotorsclub 各帖、reddit r/TeslaLounge、tesla.com/ownersmanual

---

## 11. Mac 车主 FAQ（你这两问的专项结论）

> 针对"设备是 Mac"补充核实：蓝牙键盘能不能用？蓝牙/USB 麦克风能不能用？Mac 怎么被控？

### Q1. 蓝牙键盘能用吗？
**结论：官方不支持，实测大概率打不进车机浏览器（更打不进远程桌面画布）。**

- **官方手册**：特斯拉蓝牙只配对 手机（HFP 通话）/ 媒体音频（A2DP）/ 游戏手柄，**不列键盘、鼠标、通用 HID**。（FACT，tesla.com/ownersmanual）
- **车主实测**：2025 年一个详细帖（Model Y 2022）试了 USB-A 键盘（无供电）、USB-C 键盘×2、2.4G 接收器、蓝牙键盘——蓝牙"配对成手柄"但**浏览器里无任何输入**；全帖无人确认蓝牙键盘成功打字。另一 Facebook 帖称"可能可行"但无验证。（UNVERIFIED，负面）
- **USB 鼠标**多方确认可用（蓝点光标）；**USB 键盘**有帖称早期固件能用、后被"固件禁用"，新车的键盘走 Steam 游戏而非浏览器。（UNVERIFIED，混合）
- **关键点**：特斯拉原生屏幕键盘打不进 VNC 画布（Cockpit 已用自定义 HTML 键盘绕过）。物理蓝牙/USB 键盘能否绕过这个限制**没有任何车主证实**——机制上"真实 HID 按键是 DOM key event，可能比合成输入更能进画布"，但无实证。
- **建议**：别依赖蓝牙键盘。用 **Cockpit 式自定义屏幕键盘覆盖层**（已验证可行），或最终实测你的车能否识别蓝牙键盘——但默认按"不可用"设计。

### Q2. 蓝牙麦克风 / USB 麦克风能用吗？
**结论：不需要，且证据表明外部麦克风进不了车机浏览器；语音靠车机自带舱内 mic（仅停车）。**

- **2026.26 暴露给浏览器的只有"舱内麦克风 / 车内摄像头"**（单一设备，非可选设备列表）。所有一手来源都用 "cabin microphone / interior microphone" 措辞；无任何来源说暴露了外部/BT/USB 麦克风。（FACT，notateslaapp news/4498、news/4621、teslascope 2026.26）
- **官方蓝牙是手机/媒体**，USB-A 支持音乐/优盘/卡拉OK 麦（Caraoke 功能），**都不是浏览器音频输入**。（FACT）
- **车主侧**：无一人确认外部 BT/USB 麦喂进网页；反而有 Reddit 帖说连"授权麦克风"都拿不到（停车时 ChatGPT 语音模式）。开发者 wesbos 称车内摄像头未被标准 `getUserMedia()` 拾取。（UNVERIFIED，负面/未证实）
- **停车限制**：摄像头**明确仅停车可用**；麦克风是否仅停车**未文档化、未车主证实** → 默认按"停车用"设计。（FACT 摄像头 / UNVERIFIED 麦克风）
- **Cockpit 实测**：用 Web Speech API + 车机舱内 mic，听写经隧道注入 Mac，停车可用。（FACT，项目实证）
- **建议**：语音走**车机自带舱内麦克风 + Web Speech API**（联网走 Google 语音），停车用。蓝牙/USB 麦既不需要也未被证明可用。

### Q3. Mac 作为被控机，怎么连？
**结论：noVNC（VNC）→ websockify → macOS 自带屏幕共享，是 Mac 上的最佳开源路径；不要用 RDP。**

- **macOS 屏幕共享 = 标准 VNC 服务**（TCP 5900），websockify 可连；Cockpit 即此栈。（FACT，Apple 支持文档 + Cockpit 实证）
- **坑（FACT）**：macOS 11+ 的 VNC 鉴权是 Apple 专有（RSA），noVNC 可能报 "Incompatible Version"——需在 屏幕共享 → (i) → "VNC 观众可用密码控制屏幕" 设**显式 VNC 密码**（用 macOS 登录密码会 "ARD authentication failed"）。用「屏幕共享」而非「远程管理」避开 RFB 版本错。
- **RDP 在 Mac 上不推荐**：常见开源 RDP 服务端 xrdp 需 X11，对 macOS Aqua 桌面映射差；无成熟原生 macOS RDP 服务端。Guacamole 若用也只走 **VNC 模式**，不要 RDP 模式。（FACT）
- **音频缺口**：VNC 协议**不带音频**；Guacamole 音频重定向只在 RDP 或 Linux PulseAudio 下有效，macOS 都没有。想在车里听到 Mac 声音需额外 OSS 音频桥（BlackHole/Soundflower→PulseAudio 或 WebRTC 音频流），非原生、不稳。（FACT 协议限制 + UNVERIFIED 具体工具）
- **推荐栈**：Mac 开屏幕共享 + 设 VNC 密码 + `caffeinate -d` 防息屏 → 本地 websockify(6080)→5900 → noVNC 网页 → Cloudflare Tunnel / Headscale 暴露给车机 → Cockpit 式覆盖层键盘 + 舱内 mic 听写。

### 证据分级（§11）
| 项 | 等级 |
|---|---|
| Q1 官方蓝牙不支持键盘 | FACT（车主手册） |
| Q1 蓝牙键盘实测失败 | UNVERIFIED（单一负面帖） |
| Q2 仅舱内 mic 暴露 | FACT（2026.26 发布说明） |
| Q2 外部 mic 进浏览器 | UNVERIFIED（无正面实证） |
| Q2 停车限制 | FACT（摄像头）/ UNVERIFIED（麦克风） |
| Q3 Mac VNC 栈 | FACT（Apple + Cockpit 实证）+ FACT（鉴权坑） |
| Q3 RDP 不可用 / 音频缺口 | FACT（协议限制） |

---

## 12. 国内网络环境（中国特斯拉 + Cloudflare 不可用 → 替代方案）

> 关键修正：Cockpit 的 Cloudflare Tunnel 方案**在中国大陆不可行**。需换成国内可达的中继。

### 12.1 问题一：中国特斯拉车机的流量卡能用 Cloudflare 吗？
**结论：不能。Cloudflare 全球边缘在国内被 GFW 阻断/严重限流，车机（中国联通物联网卡，走国内移动网）也过不了。**

- **Cloudflare 全球网络被墙**：Cloudflare 官方文档承认"在中国大陆交付需要中国境内基础设施"，走境外服务器"延迟大、不可靠"；其中国网络(Cloudflare China Network)是企业版+ICP备案+京东云国内节点，**个人不可用**。(FACT, developers.cloudflare.com/china-network)
- **实测阻断**：GreatFire 测 `cloudflare.com` 国内"不可靠"（TLS 被破、连接被丢）；`1.1.1.1` 解析 100% 被干扰；gfw.report 记录 2023-09 起对 1.1.1.1 注入 TCP RST。(FACT)
- **车机流量**：中国产特斯拉用**中国联通物联网 SIM**，需实名；浏览器走国内移动网，受 GFW 约束（Google/Cloudflare 类目的地会被挡）。(FACT, tesla.cn/support/connectivity + 联通智网)
- **Mac 放国外也没用**：瓶颈在"车→Cloudflare 边缘"这段（车在国内）；`cloudflared` 只是从 Mac **出站**建隧道，车端仍要连被墙的 Cloudflare 边缘。(FACT)
- **结论（FACT）**：Cockpit 的 Cloudflare Tunnel 在国内**不通**。

### 12.2 问题二：国行固件的浏览器麦克风权限
**结论：2026.26 的"浏览器可调车内摄像头/麦克风"功能，国行大概率没有（仅海外推送）。语音听写前提存疑。**

- 全球 2026.26 发布说明明确"浏览器可用舱内摄像头/麦克风，摄像头仅停车"。(FACT)
- IT之家等明确这是**"海外用户"**专属推送。(FACT)
- 国行版本号带 `.100` 后缀（如 2026.26.100.x），其发布说明列了"书签同步/浏览器缩放"但**未列浏览器摄像头/麦克风权限**——强烈暗示国行固件**省略**了该能力，但非 100% 确定（国行说明可能滞后）。(UNVERIFIED/强推断)
- **影响**：若国行车机浏览器根本没有麦克风权限，则"车内语音听写"整体落空，只能靠键盘（自定义覆盖层）+ 停车。需实车确认国行固件是否暴露麦克风。

### 12.3 问题三：国内可行方案（替代 Cloudflare Tunnel）
**结论：用一台国内/香港可达的 VPS 跑 frp（或 rathole）+ Caddy(HTTPS+BasicAuth)，把 Mac 的 noVNC 暴露出来。车机浏览器只连这个 VPS 的 443 端口。**

国内可行替代（均不开 Cloudflare，不依赖被墙外中继）：

| 方案 | 仓库 / License | 需公网 VPS | 国内可行 | 等级 |
|---|---|---|---|---|
| **frp** | `fatedier/frp` Apache-2.0 | 是（国内/港/新/日） | ✅ `frps` 跑 VPS，`frpc` 跑 Mac；L7 HTTPS + L4 TCP | FACT |
| **rathole** | `rapiz1/rathole` Apache-2.0 | 是（同上） | ✅ Rust 更轻、吞吐更高，社区较小 | FACT |
| WireGuard 自建 | GPLv2 | 是 | 🔶 Mac↔VPS 通，但车机不能跑 WG → 仍要 VPS 上 Caddy HTTPS 终点 | FACT |
| Headscale+自建 DERP | `juanfont/headscale` BSD-3 | 是 | 🔶 可行但过杀；车机仍不能跑 Tailscale → 仍需 VPS HTTPS 终点 | FACT |

**为什么不是 Tailscale/WireGuard 直接解**：车机浏览器是纯网页客户端，跑不了 Cloudflare WARP / Tailscale / WireGuard。任何 VPN 方案都必须在 VPS 上终止为一个**公网 HTTPS 终点**。frp 直接给你这个终点。

### 12.4 推荐国内拓扑（最简可行）

```
特斯拉车机浏览器（国内）
   │ HTTPS / wss://desktop.example.com  (443)
   ▼
[VPS — 公网 IP，大陆(阿里云/腾讯云) 或 香港]
   ├─ Caddy :443  → 自动 Let's Encrypt 证书 + basic_auth 鉴权
   │      reverse_proxy → frps 的 vhost 端口
   └─ frps  (bindPort 7000, vhostHTTPSPort)
          ▲  Mac 出站的持久连接
          │
   [家用 Mac，NAT 后]
   └─ frpc  → 代理本地 :6080（websockify/noVNC）
          ▼
   websockify :6080  ←→ VNC 服务 :5900（macOS 屏幕共享，设显式 VNC 密码）
```

- **VPS 选择**：两端都在国内、要最低延迟 → 阿里云/腾讯云**大陆节点**（注意 .cn 需 ICP 备案）；想跳过备案/监管 → 选**香港**（或新加坡/日本），国内仍可达、无 GFW 阻断、无备案负担。**香港是务实默认**。
- **TLS**：用真实域名 + Let's Encrypt（DNS-01，经阿里云/腾讯 DNSPod API 用 `acme.sh` 签发）。**别用自签证书**——车机浏览器大概率拒签。
- **鉴权（不可省）**：Caddy `basic_auth` 挡在 noVNC 前，避免陌生人直接操控你的 Mac；frp 设 `auth.token` 只允许你的 `frpc` 注册；再加 VNC 密码 / noVNC `?password` / 落地 PIN 页。
- **WebSocket**：noVNC 走 wss，Caddy `reverse_proxy` 原生透传 WS 升级，无需额外配置。

### 12.5 证据分级（§12）
| 项 | 等级 |
|---|---|
| Cloudflare 国内被墙 | FACT（CF 官方 + GreatFire + gfw.report） |
| 车机联通 SIM 走 GFW | FACT（tesla.cn + 联通智网） |
| Mac 放国外也没用 | FACT（CF 隧道架构） |
| 国行固件无麦克风权限 | UNVERIFIED（强推断，需实车确认） |
| frp/rathole 国内可行 | FACT（repo + 国内教程） |
| VPS+香港+LE+BasicAuth 拓扑 | FACT（组件均开源且有国内实践） |

### 12.6 落地建议（给实现票的输入）
1. 放弃 Cloudflare Tunnel，改 **frp + 香港/大陆 VPS + Caddy(HTTPS+BasicAuth)**。
2. Mac 端复用 Cockpit 的 `setup-mac.sh` 里**除 Cloudflare 外**的部分（装 websockify/noVNC + 自定义覆盖层键盘 + 舱内 mic 听写），把隧道出口从 cloudflared 换成 frpc。
3. **先实车确认**：国行固件 2026.26.100.x 是否真的暴露浏览器麦克风。若没有 → 本方案退化为"键盘-only"（覆盖层打字进 noVNC），语音待固件。
4. 证书用真实域名 LE；端点加 BasicAuth + VNC 密码双保险。

---

## 13. UU 远程控制 / 商业方案 / 组合架构（2026-09-05 补充）

> 用户放宽到商业项目 + 多项目合力。核查 UU 远程，并横向对比国产商用网页 RD（ToDesk / 向日葵），给出国内最优组合架构。
> 前置已确认：(a) 特斯拉浏览器只能纯网页、不能装 App；(b) Cloudflare 国内被墙；(c) 国行 2026.26.100.x 浏览器**无麦克风**（§12.2 高置信）。

### 13.1 UU 远程控制（网易）— 结论：车内不可用
- **它是网易出品、国内低延迟、Mac 可完美被控、完全免费**（FACT，uuyc.163.com）。
- **致命点：没有官方网页版/浏览器客户端**，只有 Win/Mac/iOS/Android 原生 App；所谓"免安装"是 Windows 专属 exe（仍需下载运行，非浏览器）。（FACT）
- 第三方 `iola1999/uurc-web` 非官方、需自建、未实测、风险高，不推荐。（UNVERIFIED）
- **结论：特斯拉浏览器装不了 App、跑不了 exe → UU 无法在车内用来控 Mac。**（FACT 推导）

### 13.2 国产商用 RD 横向对比（谁有纯网页客户端 + 国内中继 + Mac 被控）
| 产品 | 纯网页客户端 | 国内中继 | Mac 被控 | 免费/付费 | 车机契合 |
|---|---|---|---|---|---|
| **ToDesk** | ✅ 浏览器发起连接 | ✅ 国内 200+ 机房 / 自研 SD-WAN | ✅ macOS 被控 | 个人免费(限时长/画质)+付费 | **高** |
| **向日葵 (Sunlogin)** | ✅ Web 主控端 | ✅ 贝锐国内服务器 / 国密 | ✅ macOS 被控专优化 | 个人免费 + 企业/私有化 | **高**（最老牌） |
| **RustDesk 自托管** | ✅ 仅 Server Pro 有 Web 端 | ✅ 若 hbbs/hbbr 建在国内 | ✅ | OSS 免费；Pro Web 付费 | **高**（需自建国内中继+Pro） |
| TeamViewer | ✅ web.teamviewer.com | 🔶 主服务器在德国，偶有阻断 | ✅ | 个人免费(商用弹窗) | 中（非国内中继→延迟/偶断） |
| Parsec | ✅ 浏览器端 | ❌ GFW 封（2024-09 起） | ✅ | 个人免费 | 低/否 |
| AnyDesk | ❌ 无纯网页主控 | 🔶 无官方国内节点 | ✅ | 免费+付费 | 低 |
| UU 远程 | ❌ 无网页端 | ✅ 网易国内 | ✅ | 全免费 | 低（车内装不了） |

> 关键语义：ToDesk/向日葵的**浏览器是"控制端"**，家里 **Mac 仍装厂商原生 agent 作被控端**——正好契合（车机不装、Mac 能装）。所有网页方案的通病：被控 Mac 必须装厂商原生客户端（车机装不了，但 Mac 能装，OK）。

### 13.3 键盘问题：商用网页 RD 是否规避"特斯拉原生键盘打不进画布"？
- **机制（FACT）**：网页 RD 捕获自身 document 的 keydown/keyup，不依赖特斯拉系统 OSK。这与 raw noVNC 机制相同；但**差异点**在于商用网页 RD 自带"应用内虚拟键盘/鼠标覆盖层"，由 app 合成按键事件，无需系统 IME。
- 向日葵网页端第三方评测明确"内置全功能软键盘、中英文混合、快捷键组合（Alt+Tab/Ctrl+Shift+Esc）"；ToDesk 桌面网页端软键盘官方未明确（手机端确认有）。
- **推论**：对特斯拉（无系统 IME、无实体键）→ **向日葵网页端**比 ToDesk 网页端更稳地自带软键盘；ToDesk 若桌面不弹软键盘，仍需蓝牙键或语音代理补中文。

### 13.4 语音缺口（车机无麦）的唯一解法：手机作语音代理
没有任何 RD 能在特斯拉浏览器内自己完成语音（商用 RD 的"语音/麦克风直连"都要求**控制端设备本身有麦**——而车机浏览器控制端无麦，故对特斯拉侧无效）。可行路径：
- **(a) 手机 STT → Mac 注入**：司机手机（独立蜂窝，有麦）跑 STT（豆包/讯飞输入法/whisper WASM），把转写 POST 到 Mac 上的轻量注入服务（`createskyblue/remote-input-board`、`Hacker-Shohan/TypeBridge` 等已验证"手机语音→RD 窗口注入"模式），经 frp 隧道端点或 RD 自带剪贴板同步送达 Claude Code/Cursor/Aider。
- **(b) 优雅解法 — UU 远程手机端「麦克风直连」**：手机装 UU 远程 APP 控同一台 Mac，开启"麦克风直连"→ **Mac 端 AI agent 直接听到驾驶员**（等于原生关掉语音缺口，无需额外 STT/注入服务）。代价：多装一个 App，但免 VPS/免自建。
- **(c) 手机作整个 RD 客户端**：手机装 ToDesk/向日葵/UU APP（有麦、完整客户端）做短语音+coding，特斯拉屏仅作大画面。手机屏小写代码累，但麦克风原生可用。

### 13.5 推荐最终组合（给"最少折腾"中国用户）
**主选 = 特斯拉浏览器跑向日葵/ToDesk 网页端（画面+键盘）+ 手机补语音：**
- Mac 装一个国产 RD agent，登录即用，**无需自建 VPS/服务器、不碰 Cloudflare**，中继在国内、GFW 友好。
- 键盘：向日葵网页端自带软键盘（中英文+快捷键）兜底。
- 语音二选一：
  - 轻量：手机 STT（豆包输入法）→ Remote Input Board 注入 Mac（走 frp 端点）；
  - 优雅：**手机开 UU 远程「麦克风直连」**让 Mac 听见你（免 VPS、免自建注入服务）。
- **回退 = 自托管 frp+香港VPS+Caddy + noVNC + Cockpit 屏幕键盘 + 手机语音代理**（§12.4）。完全自控、无商业依赖，但需自建维护服务器、调试键盘覆盖层，工作量/风险显著更高。**仅当用户拒绝商业依赖时采用。**

### 13.6 商业产品内建语音能否关掉语音缺口？
**不能。** ToDesk「语音通话/本地麦克风传到远程电脑」、向日葵「双向音频/远程麦克风」、UU「麦克风直连」——全部要求**控制端设备自身有麦克风**。从特斯拉浏览器控时控制端无麦，这些功能对特斯拉侧无效；只在「手机作控制端」时才有用（即 §13.4(b)(c) 的 UU 透传 / 手机整控）。**没有任何 RD 提供"浏览器内 AI 语音助手/转写打字"来补特斯拉缺口。**

### 13.7 证据分级（§13）
| 项 | 等级 |
|---|---|
| UU 无网页端、车内不可用 | FACT（官方下载页 + 机制推导） |
| ToDesk/向日葵 网页端+国内中继+Mac 被控 | VENDOR（厂商文档） |
| 向日葵网页端自带软键盘 | UNVERIFIED（第三方评测，非一手官方） |
| 手机语音代理注入模式 | FACT（Remote Input Board / TypeBridge 已验证） |
| UU 麦克风直连 = 手机麦作 Mac 麦 | FACT（UU 官方博客） |
| 组合架构可行性 | 分析（基于 FACT 推导） |

### 13.8 一句话总结
**最少折腾的国内方案**：Mac 装 ToDesk（或向日葵）agent → 特斯拉浏览器开其网页端控 Mac（画面+软键盘）；语音交给手机——要么豆包输入法+手机语音注入（走 frp 端点），要么直接手机开 UU 远程「麦克风直连」让 Mac 听见你。UU 远程本身虽好但**没有网页端，无法在车内直接用**。自托管 frp+VPS+noVNC 是回退路线（完全自控但最费事）。

---

## 13.9 重点补充：`andy562560/uurc-web`（UU 远程的第三方自托管网页端）

> 用户指定核查此仓库。已读其 README、Docker/Cloudflare 部署说明、前端 `RemoteControlStage.tsx`、后端 `proxy.ts`/`remote.ts` 源码。

### 13.9.1 它是什么
- **MIT 开源**、自托管的「UU 远程网页主控端」：把网易 UU 远程的控制面做成**纯网页**，自己部署（Docker 端口 8787，或 Cloudflare Worker —— 我们不用 CF 那条）。(FACT, 仓库源码+README)
- 仓库 `andy562560/uurc-web`，但 README/Docker 镜像写 `iola1999/uurc-web`（同一作者不同账号，需注意）。最后 push 2026-07，活跃。(FACT, gh meta)
- 需 **UU 账号**（短信登录 / 凭证导入）且家里 **Mac 装 UU 客户端并开启"允许被控"**。(FACT, README 功能列表)

### 13.9.2 为什么它对"特斯拉车机"特别合适（关键技术事实）
- **自带软键盘、不依赖特斯拉 OSK**：`RemoteControlStage.tsx` 是一个 `role="application"`、`tabIndex={0}` 的 div，直接在自己元素上挂 `onKeyDown`/`onKeyUp`/`onPointerDown`/`onWheel`/`onPaste`，渲染真正的 `RemoteVideoTile` 视频流。**不依赖特斯拉系统软键盘、也不需要可聚焦的 text input** —— 正解决 noVNC 那个"原生键盘打不进画布"的坑。(FACT, 源码)
- **浏览器只连你自己的服务器**：后端 `proxy.ts` 把 UU API 转发到 `API_BASE`（UU 的服务器），`remote.ts` 在你服务器上跑 **signal gateway + WebRTC 媒体**。即：特斯拉浏览器只连**你的 HK VPS**，不直接碰 Cloudflare/GFW；VPS 再去连 UU 国内基础设施（中国可达）。(FACT, 源码)
- 因此：把 uurc-web 跑在**香港/大陆 VPS**（而非 Cloudflare），就得到「UU 的中国中继 + 你自己的纯网页端」，车机浏览器可开、键盘可用、GFW 友好。

### 13.9.3 它在方案光谱里的位置
| 路线 | 键盘 | 中继 | 数据 | 运维 |
|---|---|---|---|---|
| ToDesk/向日葵 网页端（商业） | 自带软键盘 | 厂商国内 | 过第三方 | 零运维 |
| **uurc-web（UU + 自托管网页端）** | **自带软键盘** | UU 国内（免费） | 过 UU 中继，但**网页端在你自己 VPS** | 中等（跑一个 Docker + VPS） |
| frp + 香港VPS + noVNC + Cockpit | 需 Cockpit 覆盖层 | 自己 VPS | 全自控 | 高 |

→ uurc-web 介于"商业网页端"和"全自托管 noVNC"之间：**复用 UU 免费国内中继，但拿回网页端的控制权**（可放自己 VPS、可改、可加自己的鉴权/语音注入端点）。

### 13.9.4 局限与待验证
- **不补麦克风**：车机浏览器仍无麦，语音仍要走**手机代理**；但 UU「麦克风直连」在**手机作控制端**时可用（见 §13.4b），与 uurc-web 不冲突（uurc-web 是车机侧网页端，手机侧另开 UU APP 控同一台 Mac 即可透传麦）。
- **媒体走向待验证**：需确认屏幕流是浏览器↔Mac P2P 还是强制走 UU 中继。即便走 UU 中继也是国内，可用。
- **镜像/账号**：Docker 镜像 `iola1999/uurc-web:latest` 是否持续发布需实测；UU 账号的"凭证导入"意味着要先把账号登录态弄好。
- **依赖 UU 商业服务**：本质上 UU 仍是底层，uurc-web 只是网页壳。若介意数据过 UU，应退回 frp+noVNC 全自托管。

### 13.9.5 结论
**uurc-web 是比"纯 UU App"和"全自托管 noVNC"更平衡的选择**：它给 UU 远程加上了**可在特斯拉浏览器打开的纯网页端**（自带软键盘、不依赖特斯拉 OSK），且能把网页端部署在**你自己的香港/大陆 VPS**（避开 Cloudflare/GFW），中继仍用 UU 免费国内网络。适合"想要网页端可控 + 不想自建整套 noVNC 隧道 + 接受 UU 作底层"的用户。语音仍需手机代理补足。

---

## 13.10 关键约束：被控机是公司 iOA Mac 时方案受阻

> 用户补充：个人 Mac 之外的"公司电脑"装有**腾讯 iOA（零信任终端管控）**。核查 iOA 对"装 UU 远程 + 屏幕录制/辅助功能授权 + 连 VPS"的实际限制。

- **iOA 是 EDR/零信任终端代理**，覆盖 Mac，具备**安装管控 / 运行管控 / 进程管控 / 系统加固(MDM)** 等能力。(FACT, 腾讯云 iOA 官方文档)
- **最强阻断点 = 安装/运行管控**：官方把"远程控制"软件列为可禁止安装/运行的类别，管理员可一键禁止（含自定义进程名），无需用户同意即拦截 + 审计上报。UU 属此类。(FACT)
- **次强 = 远控行为识别**：识别模拟键鼠的远控行为并实时阻断弹窗。(FACT)
- **出向网络**：上网拦截 / 进程白名单 / 强制全局代理可挡 UU 中继与到 VPS 的 WebSocket。(FACT)
- **屏幕录制/辅助功能**：iOA 不主动锁 TCC，但若 MDM 描述文件锁定则需管理员放开（唯一相对可控、但仍不在用户手里的环节）。(FACT/UNVERIFIED)
- **DLP 通道**：ToDesk/向日葵/AnyDesk/TeamViewer/RustDesk 明确被 macOS 审计+拦截（UU 未显名但同类）。(FACT)

**结论**：公司 iOA Mac 上做远控，**本质是合规授权问题而非技术问题**——未经 IT 审批基本不可行且留审计痕迹。因此被控机应**换成不受 iOA 管控的个人机器**（见 §13.11）。

## 13.11 最终推荐组合方案（个人 Mac 被控 + uurc-web + 香港 VPS + 手机语音）

> 经多轮 grill 收敛后的落地方案。决策：被控机=个人 Mac（绕开 iOA）；网页端=uurc-web 跑在自有香港 VPS；语音=手机 UU「麦克风直连」。

### 13.11.1 架构
```
[个人 Mac / Sonoma+]            [香港 VPS]                    [特斯拉车机浏览器]
  UU 客户端(允许被控)            uurc-web (Docker :8787)       打开 desktop.你的域名.com
  Claude/Cursor/Aider  ←─ UU 中继(国内) ──►  Caddy(:443, TLS+BasicAuth)
  ↑ 听见你                                 reverse_proxy→127.0.0.1:8787
  │                                        (安全组只放 80/443)
  └──[手机 UU APP 麦克风直连]── 手机蜂窝 ──► 同一 UU 账号控此 Mac → Mac 麦=手机麦
```
- 车机浏览器只连你**自己的香港 VPS**（域名 HTTPS），不直接碰 Cloudflare/GFW；VPS 再去连 UU 国内基础设施。(FACT, uurc-web 源码 proxy.ts/remote.ts)
- uurc-web 的 `RemoteControlStage` 是 `role=application` + 自建 keydown 捕获，**自带软键盘、不依赖特斯拉 OSK**。(FACT, 源码)
- 画面走 WebRTC ICE（默认 P2P，支持 relay），**不经 VPS**；信令经 VPS。(FACT, browserRemoteSession.ts)

### 13.11.2 香港 VPS 推荐（腾讯云国际站）
| 项 | 推荐 |
|---|---|
| 站点 | **腾讯云国际站 intl.cloud.tencent.com 香港地域**（勿用国内站，需 ICP 且你本要避管控） |
| 产品 | 轻量应用服务器 Lighthouse 香港 / 或 CVM 香港 |
| 规格 | 2 核 2G（怕 swap 选 4G），SSD 50–80G |
| 带宽 | 峰值 30Mbps 按流量，月包≥1024GB |
| 系统 | Ubuntu 22.04/24.04 LTS |
| 费用 | ≈¥60–100/月（香港轻量常有首年优惠） |
| 安全组 | 只放 80/443；22 限家 IP 或改端口+密钥 |
| 关键 | uurc-web 只监听内网，Caddy 反代到 127.0.0.1:8787；8787 不公网暴露 |

### 13.11.3 域名 + TLS（硬前置，车机拒自签）
- 域名在 **DNSPod/腾讯云**注册（香港 VPS 无 ICP 要求）；A 记录指向香港 IP。
- 证书：**Let's Encrypt**，VPS 上 Caddy 自动签发/续期（DNS-01 用 DNSPod API + acme.sh，或 HTTP-01）。**绝不用自签**。
- Caddyfile 草样：
  ```
  desktop.你的域名.com {
    tls 你的邮箱
    basicauth { / <hash> }     # 第一层：VPS 端点鉴权
    reverse_proxy 127.0.0.1:8787
  }
  ```
  uurc-web 自身 UU 登录态为第二层。

### 13.11.4 安全（控制你电脑的入口不能裸奔）
- **Caddy basic_auth + UU 登录态 双重保险**（必做）。(决策)
- uurc-web 需 UU 账号登录（`authState.ts` 要求 token/userId/deviceId），凭证导入需先在手机/网页登录 UU。(FACT, 源码)
- 已知风险：Docker 镜像 `iola1999/uurc-web:latest` 是否持续发布需实测；若缺失则本地 `docker build`（仓库带 Dockerfile + compose.yml）。(UNVERIFIED)

## 13.12 分阶段落地（先验证后花钱）

### 阶段 1（零成本，先跑）
见独立手册 `docs/research/tesla-vibecoding-verify-step1.md`。要点：
1. 个人 Mac 装 UU 客户端 + 开被控 + 授屏幕录制/辅助功能。
2. 手机 UU APP（同账号）控此 Mac → 验证被控闭环。
3. 开手机「麦克风直连」→ Mac 侧程序收到手机声音 → 验证语音闭环。
4. Mac 开 coding agent，手机说话让其执行 → 验证语音→agent。
**全绿才进阶段 2**；任一红先止步排查。

### 阶段 2（才花钱，待阶段 1 全绿）
买腾讯云香港 VPS → 注册域名+LE → 跑 uurc-web(+Caddy basic_auth) → 车机开 `desktop.你的域名.com` 控 Mac（画面+软键盘）→ 语音交手机 UU 麦克风直连。

### 证据分级（§13.10–§13.12）
| 项 | 等级 |
|---|---|
| iOA 管控能力/禁远控 | FACT（腾讯官方文档） |
| uurc-web 需 UU 登录/自带软键盘/信令经 VPS | FACT（源码） |
| 香港 VPS 推荐规格 | 分析（基于 FACT 推导） |
| 阶段 1 验证手册 | 可执行步骤（见独立文件） |
