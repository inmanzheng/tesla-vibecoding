# Cockpit × uurc-web：屏幕键盘与车机语音输入整合规划

- 文档状态：可开工规格（基于 Cockpit 源码逐行核对）
- 日期：2026-09-05
- 目标车：2023 Model 3 中国版（MCU3 AMD Ryzen，Chromium）
- 被控：个人 Mac，走 uurc-web + UU
- 对照仓库：[thegridbase-ai/cockpit](https://github.com/thegridbase-ai/cockpit)
- 前序：`research_report_cockpit_uurc.md`（推断稿，本文覆盖其未核对部分）

---

## 0. 结论

**能整合，而且 uurc-web 的输入管道比 Cockpit 更适合中文。** Cockpit 没有调用任何特斯拉车辆 API；它只是在受限车机浏览器上补了两块通用 Web 能力：自绘 QWERTY 覆盖层 + Web Speech 听写。uurc-web 已经有 `sendKeyboardInput` / `sendTextInput` 两条下发通道，缺的是 UI 和车机侧采集。

语音不要走特斯拉方向盘/系统语音助手——网页拿不到那条链路。正确做法是网页自己申请麦克风。优先试 `webkitSpeechRecognition`；国行车上大概率要再退一层：`getUserMedia` 收音 + 自建/国内 ASR。两条都失败时，软键盘必须能独立打字。

| 能力 | Cockpit | uurc-web 现状 | 整合结论 |
|---|---|---|---|
| 自绘屏幕键盘 | 有，ASCII-only，走 noVNC `RFB.sendKey` | **没有覆盖层**；只转发物理/系统 OSK 的 `keydown` | 必须新建；按键接 `sendKeyboardInput` |
| 语音听写 | `webkitSpeechRecognition` → 逐字符 keysym | 无采集；已有 `sendTextInput`（Unicode `text_input`） | 可做；中文应走 `sendTextInput`，不要抄 Cockpit 的逐键 |
| 特斯拉原生语音 | 未用 | 用不了 | 不做 |
| 实时麦流转发 | 未做 | 音频轨道 `recvonly` | 本版不做 |
| 中文上屏 | **实际做不到**（CJK keysym 直接丢） | `text_input` 已支持整段 Unicode | uurc-web 更强，应保持 |

---

## 1. 两个项目分别是什么

### 1.1 Cockpit

静态启动器 + 自托管 Mac 远程桌面。远控路径：

```
Tesla 浏览器
  → cockpit.thegridbase.com（Vercel 静态页：流媒体/QR 配对）
  → mac.<your-domain>
  → Cloudflare Tunnel
  → localhost:6080 websockify
  → localhost:5900 macOS Screen Sharing
```

远控页是 `novnc-custom/index.html`：iframe 嵌标准 noVNC，外层叠一层 Keyboard / Mic。它解决的是特斯拉浏览器自己补不上的两件事：

1. **系统软键盘打不进 VNC 画布**（iframe/canvas 不会弹出 Tesla OSK，即便弹了也进不了 RFB）。
2. **没有可用的打字手段**，所以用网页按钮合成按键。

Cockpit 其余能力（流媒体启动器、QR 推 URL、YouTube 跳板全屏、Cloudflare Access）与 uurc-web 输入无关，不移植。Cloudflare Tunnel 在国内车机联通物联网卡上本身不通，uurc-web 已经用香港 VPS 绕开了。

### 1.2 uurc-web（我们）

```
Tesla 浏览器
  → uurc-web（香港 VPS，HTTPS）
  → UU Web 客户端 / 信令
  → 本机 UU
  → Mac
```

远控画布是 `<video>` + Pointer Events，不是 VNC。输入走 WebRTC 数据通道：

- `sendKeyboardInput` → `kbd_press` / `kbd_release`（Mac 走 Android 键码）
- `sendTextInput` → `{ action: "text_input", content }`（整段上屏，含中文）
- `sendTextData` → 独立 text 通道（剪贴板粘贴在用）
- `sendMouseScroll` / `sendRemoteShortcut`（手势与快捷键已有）

`RemoteControlStage` 是可聚焦的 `role="application"`，会收 `keydown`/`keyup`。特斯拉系统 OSK **不会**因为点了视频画布而弹出——这和 Cockpit 面对的是同一类坑。研究计划里写的「uurc-web 已自带软键盘」不成立：仓库里没有 QWERTY 覆盖层，只有快捷键菜单。

---

## 2. Cockpit 源码：键盘与语音实际怎么做

全部在一个文件：[`novnc-custom/index.html`](https://github.com/thegridbase-ai/cockpit/blob/main/novnc-custom/index.html)（约 663 行）。没有独立语音模块，没有 Tesla API。

### 2.1 屏幕键盘

- 底部 `.kbd`，默认 `display:none`，顶栏 Keyboard pill 切换 `.on`。
- 布局：数字行 + QWERTY 三行 + 符号/Space/Tab/Esc。键高 44px（窄屏 38px），适合 15" 触屏。
- 每个键 `data-k`（字符）或 `data-special` + `data-keysym`（十六进制 X11 keysym）。
- 点击后 `sendKeyEvent(keysym)`：对 iframe 里的 `UI.rfb.sendKey(down/up)`。Shift 是网页侧锁存，发字母前临时按下 `0xffe1`。
- `charToKeysym` 只认空格/换行/Tab、ASCII `0x20–0x7e`、Latin-1 `0xa0–0xff`。**中日韩返回 `null`，静默丢弃。**

可借鉴：底部抽屉、44px 触控目标、Shift 锁存、Esc/Tab/Enter/Backspace 独立键。  
不可照搬：X11 keysym、逐字符 RFB、ASCII-only 听写注入、Google Fonts（车机联网慢且可能被墙）。

### 2.2 语音听写

```js
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
r.lang = navigator.language || 'en-US';
r.interimResults = false;
r.continuous = false;
r.onresult = (ev) => typeString(ev.results[0][0].transcript);
```

- 点 Mic → `recog.start()`；再点 → `stop()`。
- `typeString` 把 transcript **逐字符**转 keysym 再 `sendKey`。大写靠 Shift，CJK 全部跳过。
- 没有 `getUserMedia`，没有把音频发给远端。识别发生在浏览器（Chromium 默认走 Google 云端语音）。
- README 自称在 Tesla Model 3/Y/S/X 上测过，进 Terminal / Notes / Slack / 编辑器。这是海外场景实证，不是国行实证。

---

## 3. 语音三条路，哪条能走

用户的问题拆开是三件事。

### 3.1 特斯拉车机语音 → 文字 → 远控输入？

**不能。** 方向盘语音键 / 「语音输入」被 Tesla Voice / Grok / 本地语音助手截走，网页没有回调、没有 Intent、没有把识别结果写进当前焦点的 API。Cockpit 也没用这条路。本版明确不做。

### 3.2 网页申请麦克风，自己做语音转文字？

**可以，而且这就是 Cockpit 的做法。** 分两级：

**A. Web Speech API（先做）**

- API：`window.webkitSpeechRecognition`（Chromium 前缀）。
- 网页点按钮后，车机会弹出「允许舱内麦克风」一类权限框（海外 2026.26 发布说明：[Not a Tesla App](https://www.notateslaapp.com/software-updates/version/2026.26/release-notes)）。
- 识别在浏览器侧完成，结果是字符串，再 `sendTextInput(transcript)`。
- 前置：HTTPS 安全上下文、用户手势触发 `start()`、舱内麦权限。

**B. `getUserMedia` + 自建/国内 ASR（A 失败时的真后备）**

Web Speech 在 Chromium 里通常把音频送到 Google 语音服务。国行车机走中国联通物联网卡，Google 经常不可达——API 对象可能在，`start()` 之后 `onerror` 为 `network` / `service-not-allowed`。这时：

1. `navigator.mediaDevices.getUserMedia({ audio: true })` 拿舱内麦。
2. `MediaRecorder` 录一段（或短切片）。
3. POST 到 uurc-web 后端（或国内 ASR：讯飞 / 豆包 / 本地 whisper）。
4. 返回文本，同样 `sendTextInput`。

B 不依赖 Google，只依赖「浏览器是否把舱内麦暴露给网页」。海外 2026.26 对 AMD 车明确开放；国行 `.100` 发布说明没写这一项，**仍要实车验证**。摄像头明确仅停车；麦克风是否仅停车未文档化，按停车设计。

**C. 都没有麦权限**

隐藏 Mic，软键盘独立可用。不要再把手机 UU「麦克风直连」当后备：

- [UU 官方帮助](https://uuyc.163.com/help/20260311/40220_1286300.html)写明：**被控端仅 Windows，macOS 被控暂不支持**。
- 控制端虽然文档写了 iOS 可开「操作 → 外设 → 麦克风」，但目标机是 Mac 时入口常不出现——与实机一致。
- 营销博客写「支持 macOS」与帮助页矛盾，以帮助页为准。

本方案语音只走车机网页（Speech / `getUserMedia`+ASR）；手机 UU 音频透传从路径里删除。

### 3.3 国行 2023 Model 3 的现实约束

| 项 | 判断 | 等级 |
|---|---|---|
| 硬件是 AMD Ryzen，具备舱内麦 | 是 | FACT（目标车） |
| 海外 2026.26 浏览器可申请舱内麦 | 是 | FACT（官方 release notes） |
| 国行固件是否同样开放 | 未知，偏悲观 | UNVERIFIED |
| Web Speech 后端走 Google，国内可能失败 | 高概率 | FACT（Chromium 行为）+ 推断（GFW） |
| 自签 IP HTTPS 可能拦 `getUserMedia` / Speech | 高风险 | FACT（安全上下文 / 证书信任） |
| 系统语音助手能喂远控 | 否 | FACT |

因此实现必须 **能力探测 + 三级降级**，不能写成「只有 Web Speech 一种」。

---

## 4. 整合架构（不改 UU 协议）

```
特斯拉 15" 触屏（uurc-web）
  RemoteCommandBar
    ├─ [键盘] 打开/收起 OnScreenKeyboard
    └─ [麦克风] 开/关听写
           │
           ▼
  useCarVoiceInput（新建，独立于指针热路径）
    1. 探测 SpeechRecognition → start()
    2. onerror/network → 若 getUserMedia 可用 → MediaRecorder → POST /api/stt
    3. 都失败 → 按钮置灰 + toast，键盘仍可用
           │
           ▼
  browserRemoteSession          ← 不改 API
    字母/退格/回车/修饰键 → sendKeyboardInput
    听写结果 / 粘贴整段中文 → sendTextInput
```

热路径约束不变：指针/滚轮识别器继续禁止 `setState`。听写状态（listening / error）走独立 React state 或 DOM `textContent`，不要进 `browserRemoteSession.getState()`。

中文策略（比 Cockpit 正确）：

- **拼音打字**：软键盘字母走 `sendKeyboardInput`，让 **Mac 输入法**组字。这是远控里最稳的中文路径（现有注释已写「中文请用远端输入法」）。
- **听写 / 整段**：已经是汉字，走 `sendTextInput`，不要拆成 keysym。
- 不要在车机网页上再做一套拼音候选（工作量大，且和远端 IME 抢焦点）。

---

## 5. 落地改哪些文件

### 5.1 新建

`uurc-web/frontend/src/remote/carVoiceInput.ts`

```ts
export type VoiceInputStatus = "unsupported" | "idle" | "listening" | "error";

export function createCarVoiceInput(opts: {
  lang?: string;          // 默认 zh-CN
  onTranscript: (text: string) => void;
  onStatus: (s: VoiceInputStatus, detail?: string) => void;
}): {
  supported: boolean;
  toggle(): void;
  stop(): void;
};
```

- 只封装 `SpeechRecognition` / `webkitSpeechRecognition`。
- `lang = "zh-CN"`（Cockpit 用 `navigator.language`，国行车机 UA 语言不一定是中文）。
- `interimResults = false`，`continuous = false`（先做点一下说一句；连续听写留 P2）。
- 探测：`typeof SpeechRecognition === "function"`；`start()` 失败或 `onerror` 把原因回传。
- 本文件不碰 session、不碰 React。

`uurc-web/frontend/src/components/OnScreenKeyboard.tsx` + 少量 CSS

- 底部覆盖层，不挡顶栏工具条；打开时远控画布高度缩小（`flex-shrink: 0`），不要用绝对定位盖住下半屏点击区。
- 行：数字、QWERTY×3、修饰（Shift / ⌘ / ⌃ / ⌥ / Space / 退格 / 回车 / Tab / Esc）。
- 字母/数字：`keydown` 语义的键码，查 `androidKeyCodes.ts` 的 `ANDROID_KEY_CODES_BY_DOM_CODE`（需把映射 export，或做一份 `oskKeyToAndroidCode`）。
- 修饰键：按下保持、再点释放（与现有 `HOLD_MODIFIER_KEYS` 一致），关键盘 / 关输入时必须 `releaseAllInputs()`。
- 触控：`pointerdown`/`pointerup`，不要只绑 `click`（车机 300ms 延迟 + 误触）。`touch-action: manipulation`。键位 ≥ 44px。
- Shift：网页锁存，影响下一枚字母的 `sendKeyboardInput` 是否带 Shift；发完自动清（与 Cockpit 相同）。
- 不做中文九宫格。可选 P2：一行「发送文本」输入框，走 `sendTextInput`（车机系统 OSK 对 **本页 `<input>`** 通常能弹，用来贴已有文字）。

`uurc-web/frontend/src/components/VoiceDictationButton.tsx`

- 命令栏一颗 Mic。状态：灰（不支持）/ 空闲 / 收音中（高亮）/ 错误 toast。
- 仅 `inputControlActive && controlChannelState === "open"` 时可点。

`uurc-web/frontend/src/remote/sttClient.ts`（Phase 1.5，A 失败后再做）

- `uploadPcmOrWebm(blob) → Promise<string>`
- 后端 `POST /api/stt` 先做探测桩（未配置 ASR key 时返回 501），再接 whisper 或国内 API。

### 5.2 改

- `RemoteCommandBar.tsx`：加 Keyboard / Mic 两个按钮，与「快捷键」并列。
- `useRemoteControlController.ts`：接 `createCarVoiceInput`；`onTranscript` → `session.sendTextInput`；关输入 / unmount / blur 时 `voice.stop()` + 键盘修饰键释放。
- `remoteControlPageProps.ts`：补 `onToggleOnScreenKeyboard` / `voiceStatus` / `onToggleVoice`。
- `androidKeyCodes.ts`：export 键码表或新增 `toAndroidKeyCodeFromDomCode(code: string)`。
- `stage.css` / 命令栏样式：键盘抽屉、窄屏 15" 适配。

### 5.3 明确不改

- `browserRemoteSession` 输入 API
- `streamerProtocol` / UU 报文
- 音频 SDP（保持 `recvonly`）
- Tesla 车辆 API、方向盘语音键
- 不 fork、不嵌入 Cockpit 的 noVNC overlay

### 5.4 测试

`frontend/tests/carVoiceInput.test.ts`（mock `webkitSpeechRecognition`）：

1. 无 API → `supported === false`，`toggle` 不抛
2. `onresult` 一次 transcript → 恰好一次 `onTranscript`
3. `onerror` → status `error`，可再 `toggle`
4. 第二次 `toggle` 在 listening 时调用 `stop`

`frontend/tests/onScreenKeyboard.test.tsx`：

1. 点 `KeyA` → press+release，值为 29
2. Shift 锁存后再点 `KeyA` → 先 Shift press，再 A，再 Shift release，锁存清除
3. ⌘ 点一下保持，再点释放
4. 关键盘时若 ⌘ 仍按下 → 发出 release

现有 `browserRemoteSession` / `remoteShortcuts` 测试不改。

---

## 6. 分期

### Phase 0 — 实车探针（同一 PR，默认关，半天）

URL `?inputProbe=1` 或 `localStorage.uurcInputProbe=1`，在远控页画一个只读条：

```
secure=1 speech=1 gUM=0 speechErr=- gUMErr=-
```

按钮：「测 Speech」「测 getUserMedia」。不发远端，只记能力。  
这一步决定 Phase 1 开不开 B 路，避免先做一堆国内 ASR。

同时：自签证书若拦权限，优先把入口切到受信域名（handoff 里的 `switch-domain.sh`）。`getUserMedia` / Speech 在不受信 HTTPS 上经常直接失败，这和「国行有没有麦」是两件独立的事。

### Phase 1 — 软键盘 + Web Speech（3–5 天，建议一起做）

1. `OnScreenKeyboard` + 命令栏开关。没有键盘，语音失败时整车不能打字。
2. `carVoiceInput` + Mic 按钮 → `sendTextInput`。
3. 能力探测：无 Speech API 则 Mic 置灰并写明「用键盘」。

验收：

- 车机点键盘，远端 Terminal / Notes 出现对应字母；退格、回车、Tab、Esc 可用。
- Mac 开简体拼音时，车机点 `n i h a o` + 空格/数字选词，远端出「你好」。
- 海外或 Speech 可用时：点 Mic → 授权 → 说话 → 远端出现整句中文（`text_input`，不是乱码或空）。
- Speech 不可用时：Mic 灰，键盘仍可用。

### Phase 1.5 — 仅当探针证明「有麦、无可用 Speech」

`getUserMedia` + `MediaRecorder` + `/api/stt`。先接一个国内可达的 ASR，模型/供应商另票。车机 CPU 弱，**不要**上 whisper.cpp WASM 作为 v1。

### Phase 2 — 体验（可选）

- 连续听写（`continuous = true` + 中间结果预览）
- 键盘上的「发送文本」条（系统 OSK → 本页 input → `sendTextInput`）
- 听写语言切换 en-US / zh-CN
- 与已有多指手势并存时，键盘打开期间忽略画布手势误触

---

## 7. 风险与不做

| 风险 | 应对 |
|---|---|
| 国行浏览器不给麦 | 探针确认；Mic 降级；键盘保底 |
| Web Speech 对象在、Google 不通 | `onerror` 后走 1.5 或提示改用键盘 |
| 自签证书拒权限 | 先切受信域名，再测麦 |
| 行驶中麦被系统关掉 | 按停车使用设计；失败 toast |
| 听写时画布丢焦点 | 听写不抢 stage `tabIndex`；识别中不要 `blur` stage |
| 修饰键卡死 | 关键盘 / 关输入 / `pagehide` 调 `releaseAllInputs` |
| 抄 Cockpit `typeString` 导致中文全丢 | 听写必须 `sendTextInput` |

不做：

- 接管方向盘语音键
- 把舱内麦当 WebRTC 发送轨（语音通话）
- 移植 Cockpit 启动器 / QR / Cloudflare
- 车机端拼音候选 UI
- 私有 Tesla API

---

## 8. 建议开工顺序

1. 现在就可以写软键盘（零车机未知项，收益最大）。
2. 同步写 Web Speech 封装 + 探针（代码量小）。
3. 车上先看探针：`speech` / `gUM` / 证书。
4. 有 Speech 就开 Mic；只有 gUM 再立项 1.5；都没有就键盘-only。

手势识别器（`stageGestureRecognizer`）与本规划正交，互不阻塞。
