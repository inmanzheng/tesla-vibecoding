# 将 cockpit 的特斯拉输入优化借鉴到 uurc-web 的可行性分析

## 摘要
cockpit（github.com/thegridbase-ai/cockpit）针对特斯拉车机做的"输入优化"，本质是两套通用 Web 能力：自绘的屏幕软键盘（把按键注入被控端）+ 语音听写（Web Speech API 把语音转成文字后当键盘输入下发）。这两项都不是特斯拉专属 API，而是普通浏览器能力。我们当前的 uurc-web 走 WebRTC 数据通道，已经具备 `sendKeyboardInput`（逐键）和 `sendTextInput`（整段文字）两条输入下发通道——也就是说 cockpit 语音听写最终要写入的"管道"在 uurc-web 里已经存在。因此，把 cockpit 的优化"借鉴"过来是可行的，且语音听写属于低风险、可快速落地的改造；自绘软键盘则是中风险、需新建 UI 组件的改造。最大不确定性在于特斯拉车机浏览器对 Web Speech API 和麦克风权限的支持程度。

## 背景
当前方案链路是：车机浏览器 → uurc-web（部署在香港 VPS，HTTPS 反代）→ UU Web 客户端 → 本机 UU → Mac。uurc-web 已在 IP 模式下验证可访问（basicauth 已改为 1111/88888888）。用户希望把 cockpit 里"针对特斯拉"的输入优化（车机麦克风直接输入、车机键盘等）移植到 uurc-web，提升车机端的实际操控体验。

## cockpit 的特斯拉优化到底做了什么
根据对仓库的分析，cockpit 是一个把 noVNC / VNC 远程桌面适配到特斯拉车机浏览器的项目，其输入相关优化集中在两点：

第一，自绘屏幕软键盘。cockpit 在 `novnc-custom/index.html` 一类的覆盖层里实现了一个不依赖车机原生 OSK 的虚拟键盘，点击按键后把对应键码通过 noVNC 的 RFB 协议注入被控端。它的价值在于：特斯拉车机浏览器（kiosk 模式）往往不提供或不稳定提供系统级软键盘，自绘键盘绕开了这个限制。

第二，语音听写输入。cockpit 通过浏览器原生 `webkitSpeechRecognition` / `SpeechRecognition`（Web Speech API）采集车机麦克风语音，转成文字后，把识别结果作为一段文本"打"进被控端（等价于模拟键盘输入这段文字）。这并非把麦克风当作实时音频流转发，而是语音转文字、文字当键盘事件的"听写"模式。

需要澄清的是：cockpit 并没有调用任何特斯拉车辆专属 API（如车辆指令、车内麦克风固件接口）来做输入。它的"特斯拉针对性"来自"车机浏览器环境很受限，所以要用自绘键盘和浏览器语音 API 兜底"，而不是用了特斯拉独占能力。这一点很关键——意味着这些优化本质上是"在受限浏览器上补输入能力"，与 uurc-web 的底层协议无关，可以借鉴。

## uurc-web 当前的输入能力
通过阅读 uurc-web 源码（`frontend/src/remote/browserRemoteSession.ts` 等），其输入走 WebRTC 数据通道，关键接口如下：

`sendKeyboardInput({ action: "keyboardPress" | "keyboardRelease"; value })` 负责逐键下发（第 482 行起），`sendTextInput(content)` 则把一整段文字通过 `buildStreamerTextInputMessage` 直接"上屏"（第 490 行），注释明确说用于"桌面被控端打字用它替代逐键 kbd_press，避免字母连发"。同时 `frontend/src/remote/androidKeyCodes.ts` 已内置 Android/移动端键码映射，`frontend/src/controllers/useRemoteControlController.ts` 把物理键盘事件忠实转发为 `sendKeyboardInput`（第 946 行附近）。

也就是说，uurc-web 已经拥有 cockpit 语音听写所需的完整接收端：只要拿到一段文字（无论是用户手打还是语音识别出来的），调用 `session.sendTextInput(text)` 即可让远端 Mac 输入这段文字。当前代码里并没有一个显式的自绘软键盘组件（搜索 QWERTY/KeyButton/keyboardLayout 等无匹配），说明车机端的"键盘"要么依赖浏览器原生软键盘、要么依赖 UU 客户端自身能力——在特斯拉 kiosk 浏览器里这两者都可能不可靠，这正是可以借鉴 cockpit 自绘键盘的地方。

## 可借鉴项与可行性对比

| 借鉴项 | cockpit 实现 | uurc-web 现状 | 可行性 | 落地改动 |
|---|---|---|---|---|
| 语音/麦克风听写 | Web Speech API 转文字→键入 | 已有 `sendTextInput` 文字通道 | 高（低风险） | 新增麦克风按钮 + SpeechRecognition，结果调 `sendTextInput` |
| 自绘屏幕软键盘 | noVNC 覆盖层键盘→RFB 键码 | 有 `sendKeyboardInput`，但无 UI 组件 | 中（需新建组件） | 借鉴 cockpit 布局自绘键盘，按键接 `sendKeyboardInput` |
| 车机键盘输入兜底 | 自绘键盘绕开原生 OSK 缺失 | 依赖浏览器/客户端软键盘，车机下不稳 | 中 | 与自绘键盘同方案 |
| 实时音频转发车机麦克风 | 未实现（cockpit 是听写，非音频流） | 当前音频轨道为 `recvonly` | 低/不适用 | 若需转发需加 `getUserMedia` 音频 `send` 轨道，超出本次范围 |

语音听写是最值得优先做的：它直接命中用户说的"车机麦克风直接输入"，且 uurc-web 的 `sendTextInput` 已经把最难的部分（文字如何变成远端输入）做好，我们要写的只是"取语音→得文字→调这个方法"。自绘软键盘紧随其后，它解决的是车机没有可靠软键盘的问题，cockpit 的键盘覆盖层在布局和交互上值得参考，但因为它耦合 noVNC 协议，不能直接复制，要在 uurc-web 里用我们自己的 `sendKeyboardInput` 重新接线。

## 关键约束与风险
特斯拉车机浏览器通常是一个定制 Chromium，其 Web Speech API 与麦克风权限支持情况不确定。若不工作，语音听写需要退化为"服务端 ASR"或保留手动输入。麦克风权限在 kiosk 模式下可能被默认禁用，需要在部署/车机设置里确认授权。另外，如果目标是把车机麦克风作为真实音频源（比如语音通话、录音）而非听写，那属于实时音频转发，与 cockpit 的听写模式不同，当前 uurc-web 的音频轨道是 `recvonly`（只收远端音频），要做发送需新增 `getUserMedia` 的音频 `send` 轨道，工作量更大，且本次用户描述更偏向"输入文字"，故建议以听写为准。

还应保留一个降级：即便语音不可用，自绘软键盘和现有物理键盘转发也能保证基本可输入，避免单点依赖。

## 建议的落地路径
第一步，先做语音听写：在车机控制界面加一个麦克风图标，点击后用 `webkitSpeechRecognition`（带 `onresult` 取 transcript、`onerror` 兜底）识别，命中结果调用 `browserRemoteSession.current.sendTextInput(transcript)`。可放在 `useRemoteControlController.ts` 附近，并复用现有输入热路径，不刷新 React 状态以免拖慢控制心跳。这一步改动小、收益直接。

第二步，补自绘软键盘：参考 cockpit `novnc-custom/index.html` 的覆盖层布局，新建一个 React 组件，渲染 QWERTY 等布局，每个按键 `onPointerDown/up` 调 `sendKeyboardInput({action:"keyboardPress"/"keyboardRelease", value})`，借助 `androidKeyCodes.ts` 的映射覆盖移动端键码。这一步需要新建组件和样式，工作量中等，但能彻底解决车机无软键盘的问题。

第三步（可选），在车机浏览器确认 Web Speech API 可用后，把麦克风按钮设为默认可见；若不可用，隐藏并依赖软键盘，保证体验不降级。

## 结论
cockpit 的"特斯拉优化"可归纳为"自绘软键盘 + 语音听写"，均为通用浏览器能力，不依赖特斯拉专属接口。uurc-web 已具备二者所需的输入下发通道（`sendKeyboardInput` / `sendTextInput`），因此借鉴是可行的：语音听写属于低风险、可快速实现的改造，自绘软键盘属于中等工作量、价值高的改造。建议优先实现语音听写，再补自绘软键盘，并务必保留手动输入降级。真正的未知数只在车机浏览器对 Web Speech API 和麦克风权限的支持，需要实车验证。

## 局限
cockpit 仓库的部分源码细节（尤其语音模块相关文件）未能逐行确认，其能力描述基于 README、仓库结构及通用 noVNC 实现推断，置信度为中等。uurc-web 是否在某处已内置软键盘组件，当前搜索未找到显式实现，结论为"需新建"，若后续发现已有组件可省去第二步。车机浏览器的 Web Speech API 支持度未经实车测试，属于待验证项。

## 参考
1. [thegridbase-ai/cockpit 仓库](https://github.com/thegridbase-ai/cockpit)
2. [cockpit novnc 自定义键盘覆盖层（novnc-custom）](https://github.com/thegridbase-ai/cockpit/tree/main/novnc-custom)
3. [uurc-web 仓库](https://github.com/andy562560/uurc-web)
4. [uurc-web 输入会话 browserRemoteSession.ts](https://github.com/andy562560/uurc-web/blob/main/frontend/src/remote/browserRemoteSession.ts)
5. [uurc-web 按键/文本下发接口（streamerProtocol）](https://github.com/andy562560/uurc-web/blob/main/shared/src/streamerProtocol.ts)
6. [uurc-web 远端控制控制器 useRemoteControlController.ts](https://github.com/andy562560/uurc-web/blob/main/frontend/src/controllers/useRemoteControlController.ts)
7. [Web Speech API（SpeechRecognition）MDN 文档](https://developer.mozilla.org/zh-CN/docs/Web/API/SpeechRecognition)
