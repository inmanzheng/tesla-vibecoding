# 深度分析：Cockpit 项目 + 我们(uurc-web)的屏幕键盘 / 车机语音整合

> 文档状态：深度分析 + 整合规划（基于 Cockpit 源码逐行核对 + uurc-web 本地副本核对）
> 日期：2026-09-05
> 输出目录：`Tesla VibeCoding/doc/`
> 配套（已有，不重复）：`research_report_cockpit_input_plan.md`（可开工规格）、`research_report_cockpit_uurc.md`（推断稿）
> 范围：**只读分析 + 规划**，不写代码。证据等级 FACT=读源码/官方文档；VENDOR=项目自称；UNVERIFIED=社区/未证实。

---

## 0. 一句话结论

- **Cockpit 是"车机浏览器补两件事"的标杆参考实现**：自绘屏幕键盘 + Web Speech 听写，都靠纯 Web 能力，不碰特斯拉车辆 API。它的真正价值是**验证了"车机浏览器自己申请麦克风 + 自己合成按键"这条路走得通**。
- **我们(uurc-web) 的输入下发管道比 Cockpit 更适合中文**：已有 `sendTextInput(content)`（整段 Unicode/中文上屏）和 `sendKeyboardInput`，Cockpit 却只能 ASCII 逐字符 `sendKey(keysym)`——中文在 Cockpit 路径下实际丢字。
- **语音核心问题不在"能否 Web 端自行 STT"，而在"国产车联网卡能否连到 STT 服务"**：Web 端**完全能** `getUserMedia` 拿麦克风 + 自己转文字（你问的这点答案是肯定的）。但 Cockpit 用的 Web Speech API 走谷歌云，在联通物联网卡上大概率 `network`/`service-not-allowed` 失败 → 必须退到**本地 WASM Whisper** 或**后端 Whisper/国内 ASR**。
- **四条语音路径**见 §4。推荐：优先 `getUserMedia`+后端 Whisper（或国内 ASR），WASM Whisper 作离线兜底，手机 UU 麦克风直连作为"不依赖车机麦"的旁路。

---

## 1. Cockpit 深度剖析

### 1.1 它到底是什么
- 一个 **GitHub Pages/Vercel 静态站 + 自托管 Mac 远控**的项目（`thegridbase-ai/cockpit`，作者 Can Kilic，个人作品，非特斯拉/苹果关联）。
- **License：All rights reserved（非开源，Not open for external contributions）**。→ 我们只能"借鉴思路/读源码学实现"，**不能 fork/拷贝代码**（合规上要重写，且不要直接 copy 其 CSS/JS）。
- 远控路径：`Tesla 浏览器 → cockpit.thegridbase.com(静态) → mac.<your-domain> → Cloudflare Tunnel → localhost:6080 websockify → localhost:5900 macOS Screen Sharing(VNC) → noVNC(iframe)`。

### 1.2 架构三段（互相独立）
| 段 | 技术 | 是否需后端 | 国内可用性 |
|---|---|---|---|
| 流媒体启动器 | 纯静态 HTML/JS（Netflix/YouTube 等 URL 跳转） | 否 | 可用（但视频需停车） |
| 手机↔车机推 URL | Firebase RTDB 作 60s 临时中继（只存 URL 字符串） | Firebase（免费层） | 可用 |
| Mac 远控 | Cloudflare Tunnel + websockify + noVNC 自定义 overlay | Mac 本地 cloudflared/websockify | **Cloudflare 在国内被墙 → 不可用**，我们已用香港 VPS 替代 |

### 1.3 它真正解决的两个痛点（也是我们要解决的）
1. **特斯拉原生软键盘打不进 VNC/远控画布** → Cockpit 自绘 QWERTY overlay，用 noVNC 的 `rfb.sendKey(keysym)` 注入 X11 keysym。**关键洞察：它把按键合成在网页层，绕过系统 OSK。**
2. **没有可行的车机打字手段** → 加 `Mic` 按钮，Web Speech API 听写后逐字符 `sendKey` 注入。

### 1.4 Cockpit 源码要点（已读 `novnc-custom/index.html` 全文）
- **软键盘**：HTML/CSS 画的 QWERTY（含 `@`、符号、Shift/Enter/Tab/Esc），`charToKeysym()` 映射 ASCII→X11 keysym，`typeString()` 逐字符 `rfb.sendKey`。**局限：仅 ASCII，CJK 无 keysym → 中文实际上不了屏。**
- **语音**：`mic` 按钮 → `window.SpeechRecognition||webkitSpeechRecognition` → `r.onresult` 取 transcript → `typeString()` 逐字符注入。**没有 `getUserMedia`、没有把音频发远端**——识别发生在浏览器（Chromium 默认送谷歌云语音）。
- **iframe 权限**：`<iframe ... allow="clipboard-read; clipboard-write; microphone">` → **麦克风权限是网页端自己申请的**，这正是你问题的关键证据：**车机网页可以自己拿麦克风**。
- **不强依赖车辆 API**：纯 DOM/iframe/Web Speech，零 Tesla SDK。

### 1.5 Cockpit 可借鉴 vs 不可借鉴
| 项 | 借鉴？ | 说明 |
|---|---|---|
| "网页自绘键盘 + 直接发键" 思路 | ✅ | 通用 Web 模式，我们照做但接 `sendKeyboardInput/sendTextInput` |
| "网页自己申请麦克风 + STT 注入" 思路 | ✅ | 思路对；但 STT 引擎要换（见 §4） |
| noVNC `RFB.sendKey` 实现 | ❌ | 我们是 UU/WebRTC 协议，不用 RFB |
| Cloudflare Tunnel 部署 | ❌ | 国内被墙，已用香港 VPS+Caddy 替代 |
| Firebase 推 URL | ➖ | 与输入整合无关，按需 |
| 其 CSS/JS 代码 | ❌ | All rights reserved，须自写 |

---

## 2. 我们(uurc-web) 现状与接入点

### 2.1 uurc-web 输入管道（已读源码）
- `RemoteControlStage.tsx`：远控画布是 `<video>` + Pointer Events，`role="application"` + `tabIndex=0` + 自建 `onKeyDown`/`onPaste` → **自带软键盘逻辑，不依赖特斯拉 OSK**（与 Cockpit 同思路）。
- `useRemoteControlController.ts` 暴露的下发 API（软键盘/语音要调的）：
  - `sendKeyboardInput({action:'keyboardPress'|'keyboardRelease', value})` — 单键（L978/980/994）。
  - `sendTextData(text)` / `sendTextInput(content)` — **整段文本上屏**（L1014 / `browserRemoteSession.ts` L435/490），走 `text_input` 动作（源码注释明确"中文/IME 文本承载方式，真机抓包 `{"action":"text_input","content":"abc"}`"）。
  - `onRemoteStagePaste` — 剪贴板粘贴路径（L822 `sendTextData`）。
- `remoteBootstrap.ts` 能力清单含 `ime_text` / `mumu_touch` → 中文 IME 文本通道已就绪。
- `RemoteControlTopbar.tsx` 有现成按钮位（L28/39），可加 Keyboard/Mic pill。

### 2.2 与 Cockpit 的输入能力对比
| 能力 | Cockpit | uurc-web（我们） | 整合结论 |
|---|---|---|---|
| 自绘屏幕键盘 | 有，ASCII-only，RFB keysym | **无覆盖层**，只转发物理/系统键 | 必须新建；接 `sendKeyboardInput` |
| 整段文本上屏 | ❌（只能逐 ASCII 键） | ✅ `sendTextInput` 支持 Unicode/中文 | **我们更强，中文零丢字** |
| 语音听写采集 | Web Speech（云端） | 无 | 新增；STT 引擎自定（§4） |
| 特斯拉原生语音 | 未用（也用不了） | 未用 | 不做 |
| 中文上屏 | 实际做不到 | 已支持 | 保持 `sendTextInput` |

---

## 3. 屏幕键盘整合方案

- **做法**：在 `RemoteControlStage` 外层加 overlay（参照 Cockpit 的 `.kbd` 覆盖层），画一个 QWERTY + 符号 + 功能键布局。
- **按键下发**：
  - 单键/修饰键 → `sendKeyboardInput({action:'keyboardPress'|'keyboardRelease', value})`（value 用 uurc-web 约定的键码，非 X11 keysym）。
  - **中文/长文本 → `sendTextInput(content)`**（整段上屏，不要用 Cockpit 的逐字符键，否则中文丢）。
- **为什么必须自绘**：特斯拉原生 OSK 不弹进 `<video>`/远控画布（Cockpit 已验证同坑），且缺符号键。自绘 overlay 是车机远控的必需件，不是可选项。
- **与原生手势的边界**：屏幕键盘是"点击合成键"，独立于 §13.13 的"车机多指手势→Mac 等效动作"。两者并行不冲突。

---

## 4. 语音输入：四条路径深度对比（你问的核心）

> 前提：特斯拉原生语音助手（方向盘键/Grok）网页拿不到结果 → **不走**。正确做法是**网页自己申请麦克风 + 自己/经服务转文字**。

### 4.1 路径 A — Web Speech API（Cockpit 原做法）
- 机制：`getUserMedia` 隐式 + `SpeechRecognition` 送浏览器默认语音服务（Chromium → 谷歌云）。
- 优点：零后端、代码最短（Cockpit 80 行搞定）。
- **致命缺点（国产车）**：联通物联网卡访问谷歌语音常 `network`/`service-not-allowed`；且 2026.26 舱麦权限即便给到，服务不可达仍失败。
- 结论：**海外车可首选；国产车不可靠，仅作探测/降级展示**。

### 4.2 路径 B — `getUserMedia` + 浏览器内 WASM Whisper（完全离线）
- 机制：`navigator.mediaDevices.getUserMedia({audio:true})` 拿舱内麦 → `whisper.cpp` WASM / `transformers.js` 在车机 Chromium 内本地推理。
- 优点：**完全离线、不依赖任何外部 STT 服务、绕过 GFW/谷歌不可达**。
- 缺点：车机嵌入式 Chromium CPU 弱，WASM Whisper `tiny/base` 延迟/准确率 UNVERIFIED，需实车测；首载模型体积大（需缓存）。
- 结论：**国产车最稳的"纯网页"方案，但是性能待验**。作为 A 失败后的离线兜底强烈推荐。

### 4.3 路径 C — `getUserMedia` + 后端 Whisper / 国内 ASR（推荐主路）
- 机制：车机 `getUserMedia` 拿麦 → 音频（或压缩片段）经**已有香港 VPS 的 uurc-web 后端** POST → 后端跑 `faster-whisper`/`whisper.cpp` 或转发**国内 ASR（讯飞/豆包）** → 返回文本 → `sendTextInput` 上屏。
- 优点：**中文识别质量最高**（云端/大模型 ASR）、车机只负责收音不推理、网络走你自有香港 VPS（已避 GFW）。
- 缺点：需在 VPS 上加一个 STT 端点（小服务，非 trivial 但成熟）；音频跨公网需注意（香港 VPS 已 HTTPS，可在同源内）。
- 结论：**国产车推荐主路**——既有 VPS 复用，质量与合规俱佳。

### 4.4 路径 D — 手机 UU 远程「麦克风直连」（旁路，不依赖车机麦）
- 机制：手机开 UU APP 把手机麦变成 Mac 麦 → Mac 上 coding agent/听写直接收手机声。
- 优点：**完全绕开车机麦克风权限与 Web Speech/GFW 问题**；手机麦质量优于舱麦；与远控共用 UU 通道。
- 缺点：依赖 UU「麦克风直连」在 macOS 被控的可用性（帮助文档有 Windows-only 表述 vs 博客称可作 Mac 麦的**矛盾，需实机验证**）；是"手机当麦"而非"车机当麦"。
- 结论：**物理最稳的语音闭环**，是 §13.12 阶段1 验证的核心；与 B/C 不冲突，可并存（车机屏控 + 手机麦收音）。

### 4.5 路径决策矩阵（国产车）
| 维度 | A Web Speech | B WASM Whisper | C 后端 Whisper/国内ASR | D 手机UU麦 |
|---|---|---|---|---|
| 依赖外部服务 | 谷歌云（不可达） | 无 | 自有VPS/国内ASR | UU |
| 中文质量 | 高(若能连) | 中(小模型) | 高 | 高(手机麦) |
| 车机性能压力 | 低 | 高(待验) | 低 | 无 |
| GFW 风险 | 高 | 无 | 低(走自有VPS) | 低 |
| 是否需要车机麦权限 | 是 | 是 | 是 | 否 |
| 推荐角色 | 探测/降级 | 离线兜底 | **主路** | **语音闭环旁路** |

**推荐组合**：C 为主（车机收音→自有VPS STT→`sendTextInput` 上屏）；B 为离线兜底（A 失败且不想发后端时）；D 作为不依赖车机麦的稳路并存。A 仅作存在性探测。

---

## 5. 整合规划（不替 brain 决定，仅列方案与代价）

### 5.1 屏幕键盘（必做，无外部依赖）
- 新增 overlay 组件（自绘 QWERTY+符号+功能键），挂 `RemoteControlTopbar` 旁。
- 单键→`sendKeyboardInput`；文本→`sendTextInput`。
- 代价：纯前端 ~1 文件组件 + 样式；中文字体/布局需适配车机大屏。

### 5.2 语音（C 主 + B 兜底 + D 旁路）
- 车机端：加 `Mic` pill → `getUserMedia` 拿舱麦 → 录音片段发到 VPS STT 端点 → 回文 `sendTextInput`。
- VPS 端：uuRc-web 后端加一个轻量 STT 路由（`/stt`），接 faster-whisper 或国内 ASR SDK。
- 兜底：若 `getUserMedia`/STT 失败，自动提示切 B（WASM）或提示用 D（手机 UU 麦）。
- 代价：前端收音+端点 ~中；VPS 加 STT 服务 ~中（但 whisper 部署成熟）；实车验证麦克风权限与延迟 ~必做。

### 5.3 风险与未决
- **舱麦 `getUserMedia` 在国产车是否真给权限**：2026.26 开放舱麦但 wesbos 称相机不被标准 API 拾取 → 麦同理存疑，**需实车验证**（UNVERIFIED）。若不给，D（手机 UU 麦）成唯一语音路。
- **WASM Whisper 车机性能**：待实车基准。
- **Cockpit 代码不可 copy**：借鉴思路自行实现，避免 license 风险。
- **与 One 主项目关系**：One 是浏览器扩展（主动助手），本次整合发生在 uurc-web（独立远控网页），二者协议/栈不同；One 不直接参与，uuRc-web 才是改造对象。

---

## 6. 证据分级汇总
| 主张 | 等级 | 来源 |
|---|---|---|
| Cockpit 自绘键盘+Web Speech 听写，纯 Web 不碰车辆 API | FACT | 读 `novnc-custom/index.html` 全文 |
| Cockpit iframe 声明 `allow="...;microphone"`（网页自申麦） | FACT | 同上 |
| Cockpit License All rights reserved，不可外部贡献 | FACT | 读仓库 LICENSE/README |
| uurc-web 有 `sendTextInput`（整段中文上屏） | FACT | 读 `browserRemoteSession.ts` L490 + `streamerProtocol.ts` L1689 |
| uurc-web 无软键盘/语音 overlay | FACT | grep 前端无 keyboard/voice 代码 |
| Web Speech 在国产车走谷歌云不可达 | VENDOR/分析 | Chromium 行为 + GFW 事实 |
| 舱麦 `getUserMedia` 国产车可用性 | UNVERIFIED | wesbos 观察 + 无主流量产确认 |
| WASM/后端 Whisper 可行性 | FACT(引擎存在) + UNVERIFIED(车机性能) | whisper.cpp/transformers.js 仓库 |

---

## 7. 对你两个问题的直接回答

**Q1：Cockpit 深度分析 + 能否把屏幕键盘和车机语音整合进我们项目？**
能。Cockpit 是"车机浏览器补屏幕键盘 + 网页自申麦听写"的参考实现，思路完全可借鉴；我们 uurc-web 已有更优的中文整段上屏通道（`sendTextInput`），只缺 UI 覆盖层和采集层。整合 = 加自绘键盘 overlay（接 `sendKeyboardInput`/`sendTextInput`）+ 加 Mic 采集（接 STT→`sendTextInput`）。Cockpit 的 Cloudflare/RFB/Firebase 部分不移植。

**Q2：若车机语音识别转文字不行，能否让 Web 端获取麦克风权限自行 STT？**
**能，而且这是推荐做法。** Web 端完全可以 `navigator.mediaDevices.getUserMedia({audio:true})` 自己拿麦克风（Cockpit 的 iframe 已声明 `microphone` 权限即证）。"自行转文字"有四条路：A 浏览器 Web Speech（国产车不可靠）、B 浏览器内 WASM Whisper（离线但性能待验）、C 发到自有香港 VPS 跑 Whisper/国内 ASR（**推荐主路**）、D 手机 UU 麦克风直连（旁路，不依赖车机麦）。关键风险是国产车舱麦 `getUserMedia` 是否真放行——需实车验证；若不放行，D 成唯一语音路。
