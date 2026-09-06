# 调研：手机配对页新增"触控板模式"（手机当无线触控板控 Mac 鼠标）

> 文档状态：技术调研 + 可行性答案（基于 uurc-web 源码核对 + 开源方案检索）
> 日期：2026-09-05
> 输出目录：`Tesla VibeCoding/doc/`
> 配套：Cockpit 深度分析稿、uurc-web 整合规划稿
> 范围：只读调研，不写代码。等级 FACT=读源码/官方；VENDOR=项目自称；UNVERIFIED=社区。

---

## 0. 直接答案

**能，而且这是成熟模式，开源参考很多。** 手机打开一个网页、手指滑动 → 把位移 `{dx,dy}` 经 WebSocket 发给车机上的 uurc-web 客户端 → 该客户端驱动 Mac 鼠标移动。本质就是"手机当无线触控板"。
**不需要专门的手势库**：原生 Touch/Pointer Events 足够（算 `dx=clientX-lastX` 即可）。
**唯一要注意的架构点**：uuRc-web 现有 `sendMouseMove` 接收的是**绝对坐标**，而触控板发**相对位移**——trackpad 模式要在车机端维护"当前光标位置"状态，把 delta 累加成绝对坐标再调 `sendMouseMove`（或在 uurc-web 加一个相对移动通道）。详见 §3。

你计划的"配对页三模式"完全成立：
- **模式 A 文字**：输入框 + 发送 → 车机 `sendTextInput` 上屏。
- **模式 B 语音**：手机收音 → STT → 文本 → 同 A 上屏（可复用前面语音四条路中的"手机端 STT"分支）。
- **模式 C 触控板**：手指滑动 → `{dx,dy}` → 车机驱动鼠标移动（本文）。

---

## 1. 开源参考项目（手机网页 → 控鼠标）

| 项目 | License | 怎么做的 | 可借鉴点 |
|---|---|---|---|
| **Unrud/remote-touchpad** | GPL-3.0 | 手机开 URL/扫 QR → 网页 `touchpad.mjs` 采触控 → WebSocket(`socket.mjs`) → 主机 uinput/X11/Windows 注入 | **最佳参考**：完整"手机网页采触控 + WS 中继"前端模式；我们只拿传输半截，丢弃 OS 注入半截 |
| **moses-palmer/virtual-touchpad** | GPLv3 | 手机/平板浏览器 → 本地服务 → 主机注入鼠标键盘 | 印证"手机浏览器→主机中继"模式 |
| **mmiscool/JS-virtual-Touchpad** | **MIT** | 纯前端透明触控板覆盖层，发合成指针事件（无服务器） | **手机输入端 UI 壳可直接抄**（MIT 安全） |
| ranierivalenca/remote-trackpad | UNVERIFIED | websocket 远程触控板 | 印证 WS 设计，许可未确认 |
| lifegence-remote-mouse | MIT | 手机当 PC 鼠标/触控板 | MIT 但偏 App |
| cyd3r/remote-touchpad | — | 网页控电脑鼠标，用 Hammer.js 采手势 | 印证"网页+触控"可行 |
| wifimouse / Remote Mouse | 商业 | 原生 App 当鼠标 | 非网页库，不借 |

> 结论：参考 **Unrud/remote-touchpad** 的"网页采触控 + WebSocket 中继"整体模式；UI 壳若想直接抄用 **mmiscool/JS-virtual-Touchpad**（MIT）。我们不注入 OS，目标是车机上的 uurc-web 远程客户端。

## 2. 手机输入端：要不要库？

**基本不需要库。** 原生 Touch Events 最低延迟、零依赖：
- `touchstart` 记 `lastX/lastY`；`touchmove` 算 `dx=clientX-lastX, dy=clientY-lastY`；发 `{type:'move',dx,dy}`。
- `touchend` 无位移/快速点 → 点击（`mousedown`+`mouseup`）；双指竖滑 → 滚轮；可选双指捏合 → 缩放（按 `touches.length` 区分）。
- 可选库（都不必需）：`@use-gesture/react`(MIT, 若车机端是 React，用 `useDrag` 取 delta)、`mmiscool/JS-virtual-Touchpad`(MIT 现成覆盖层)、Hammer.js(MIT，过重)、nipplejs(MIT，**摇杆**不适合触控板手感)。

## 3. 与 uurc-web 现有通道对接（关键架构点）

### 3.1 现状（已读源码）
- `useRemoteControlController.ts` 暴露 `sendMouseMove` / `sendMouseButton` / `sendMouseScroll`。
- `browserRemoteSession.sendMouseMove(input)` → `buildMouseMoveAbsoluteInput(input)` → **绝对坐标**：`{absX, absY, surfaceWidth, surfaceHeight}`。
- `toRemoteMousePosition()`（`remoteControlUiModel.ts` L343）：从**本地 stage 的 bounding rect + video 分辨率**算绝对坐标（相对 0..1 再乘视频宽高）。即现有移动 = "车机画面某点 → Mac 对应绝对像素"。

### 3.2 矛盾点
- 手机触控板发的是**相对位移 (dx,dy)**（像真触控板，没有绝对位置概念）。
- 现有 `sendMouseMove` 要**绝对坐标 + 车机画面 surface 尺寸**。
- → 不能直接把 `{dx,dy}` 喂给 `sendMouseMove`。

### 3.3 对接方案（两种，择一）
- **方案 1（推荐，不改协议）**：车机端（uuRc-web 远程会话页）维护一个 `cursor = {x,y}` 状态（初始取画面中心或上次坐标）；收到手机 `{dx,dy}` → `cursor.x += dx*sens; cursor.y += dy*sens` → 调 `sendMouseMove({absX:cursor.x, absY:cursor.y, surfaceWidth, surfaceHeight})`。`surfaceWidth/Height` 用当前视频分辨率（即 `toRemoteMousePosition` 里的 videoWidth/Height）。**纯前端状态，零协议改动。**
- **方案 2（加通道）**：uuRc-web 增加一个相对移动消息（如 `mouse_move_relative{dx,dy}`），由被控端 UU/streamer 累加。需改协议 + 被控端，代价大，**不推荐**先做。

> 结论：**方案 1 即可落地**，利用现有 `sendMouseMove`，车机端加一个轻量光标状态。点击/滚轮走现有 `sendMouseButton`/`sendMouseScroll`。

### 3.4 配对/中继通道
- 手机页 → 车机页 的传输：复用 uurc-web 已有的房间/信令（`uuClient.ts` 有 `/api/v2/room/share/control_mode`、`by_code`、`by_confirmation` 等 share 端点）。可在"配对"基础上加一条 `trackpad` 子通道（同一 WebSocket/房间），或独立 WS。
- 也可照搬 Cockpit 的 Firebase RTDB 临时中继思路（配对页写坐标 delta，车机读）——但 uurc-web 已有 share 信令，优先复用。

## 4. 手势映射（触控板模式内）
| 手机动作 | 映射 | 车机端调用 |
|---|---|---|
| 单指滑动 | 光标移动 | 光标状态 + `sendMouseMove`(绝对) |
| 轻点/无位移抬起 | 左键点击 | `sendMouseButton` press+release(primary) |
| 双指竖滑 | 滚轮 | `sendMouseScroll` |
| 长按 | 右键（可选） | `sendMouseButton`(secondary) |
| 双指捏合 | 缩放（可选） | 视被控端支持 |

## 5. 手感调优（必做）
- **灵敏度系数 sens**：`dx*sens`；小滑精准、快滑覆盖距离。
- **加速度**（可选）：`delta *= 1+speed*k`。
- **每帧 clamp**：`touchcancel` 后避免跳变；`dx/dy` 限幅。
- **surface 尺寸**：用视频分辨率而非 CSS 像素，避免坐标偏移（现有 `toRemoteMousePosition` 已处理，方案 1 复用其 surfaceWidth/Height）。

## 6. 与"文字/语音模式"的关系
- 三种模式同处一个手机配对页，切换 tab/模式即可。
- 文字/语音都是"发文本 → 车机 `sendTextInput`"；触控板是"发 delta → 车机 `sendMouseMove`"。三者共用配对/房间中继，互不冲突。
- 语音模式的"手机端 STT"已在前稿规划（getUserMedia + 后端 Whisper / 手机 UU 麦）；触控板不依赖语音。

## 7. 风险与未决
- **车机端光标初始位置/越界**：需维护 state，越界 clamp 到 [0,surface]。
- **延迟**：手机→VPS/uuRc-web 信令→Mac 的链路延迟；UU 中继国内可用，实测。
- **多点触控手机上报**：手机浏览器 Touch Events 多指稳定（比车机可靠），无车机多点触控疑问。
- **与 iOA 无关**：手机配对页是独立网页，不走公司 Mac。

## 8. 证据分级
| 主张 | 等级 | 来源 |
|---|---|---|
| Unrud/remote-touchpad 手机网页采触控+WS 中继 | FACT | 读仓库（GPL-3.0） |
| mmiscool/JS-virtual-Touchpad MIT 前端覆盖层 | FACT | 读仓库（MIT） |
| uurc-web `sendMouseMove` 是绝对坐标 | FACT | 读 `browserRemoteSession.ts` L467 + `remoteControlUiModel.ts` L343 |
| uurc-web 有 share/房间信令端点 | FACT | 读 `uuClient.ts` L228/247/269 |
| 原生 Touch Events 足够做触控板 | FACT | MDN/通用 Web 标准 |
| 方案 1（车机端维护光标状态）可行 | 分析 | 基于 FACT 推导 |

---

## 9. 给你的结论

1. **手机配对页加"触控板模式"完全可行，且是成熟模式**——开源有 Unrud/remote-touchpad（GPL-3.0，最佳参考）、mmiscool/JS-virtual-Touchpad（MIT，UI 壳可抄）。
2. **不需要手势库**：原生 Touch Events 算 delta 即可；只有车机端若已是 React 才考虑 `@use-gesture/react`。
3. **对接关键**：uuRc-web 的 `sendMouseMove` 要绝对坐标，触控板发相对 delta → **在车机端维护光标状态把 delta 累加成绝对坐标再调 `sendMouseMove`**（方案 1，零协议改动）；不改协议即可落地。
4. **三种模式（文字/语音/触控板）同页并存**，复用 uurc-web 已有配对/房间信令，互不冲突。
5. 下一步若要开工：出一张"配对页触控板模式"实施票（仍不写代码，给规格：手机端 Touch 采 delta + WS 子通道 + 车机端光标状态 + `sendMouseMove/Button/Scroll` 映射 + 灵敏度调优）。
