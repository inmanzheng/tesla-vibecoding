# 调研 — 车机触屏"真原生触控板手势"可行性（uurc-web 多指 + Mac 手势注入）

> 目标：用户要"真原生的手势"——车机触屏多指 → 远端 Mac 真·触控板手势（双指滚、四指切桌面）。
> 范围：查 GitHub 开源方案 / 技术方案，判断"真原生手势注入"到底能不能做、怎么做、代价多大。
> 本文是 `tesla-remote-vibecoding.md` §13.13 的专项深挖。调研时间 2026-09-05。
> 证据等级：**FACT** = 读源码/官方文档；**VENDOR** = 项目自称；**UNVERIFIED** = 社区/未证实。
> 不写代码，只给技术方案与可行性结论。

---

## 0. 先纠正 §13.13 的误判（关键）

> §13.13 写"需先补 uurc-web 输入层多指针追踪 + 手势识别层，再确认 UU/streamer 是否接收手势消息"。**这句后半段错了**——读完 `shared/src/streamerProtocol.ts` 发现：

- **协议层已支持多点触控**：`STREAMER_INPUT_MANAGER_TOUCH_SLOTS = [26,27,28,29,30,31]`（6 个触控槽）；`TouchInputTracker` 类用 `Map<touchId, slot>` 追踪多指；`SLOTMULTIPRESS` / `SLOTMULTIRELEASE` 命令；`enableTouch` 字段（值 2）。(FACT, 源码 L1431/1713/1722/1742/1747/732/746)
- `remoteBootstrap.ts` 能力清单含 `mumu_touch` / `touchSlots`；前端 `browserRemoteSession.ts` 也提到 "MuMu touch commands"。(FACT, 源码 L24/95/99/1346)
- **单指限制只在"前端输入 handler"**：`useRemoteControlController.ts` 的 pointer 回调用单个 `activePointerId` ref，第二指被 `return` 丢弃（L864/881/892/907），**从没把多指喂给那个已经存在的 `TouchInputTracker`**。(FACT, 源码)

**结论**：uuRc-web 的"协议侧多指"是齐的；缺口是**前端手势识别层**（把车机触屏的 N 指变成既有触控槽命令），不是"协议是否支持手势"。

---

## 1. 客户端（车机浏览器）多指手势识别：开源库对比

| 库 | 仓库 / License | 多指 | React 契合 | 成熟度 | 能否直接补 uurc-web |
|---|---|---|---|---|---|
| **@use-gesture/react** | `pmndrs/use-gesture` MIT | 部分：pinch(2指距离+角度)/drag/swipe 原生；**3+/4 指不原生** | 极佳（hooks） | 9.6k★, 5.3M 周下载, TS | 双指滚/捏合可；四指需自建 |
| **interact.js** | `taye/interact.js` MIT | 多指 drag/resize/snap | 框架无关(TS) | 12.9k★, 活跃 | 拖/捏合可；四指需自建 |
| **ZingTouch** | `zingchart/zingtouch` MIT | 多指、可配 #inputs | 原生 JS 无 React 包 | 2.1k★, 慢 | 可，但要包一层 |
| **Hammer.js** | `hammerjs/hammer.js` MIT | 2 指 pinch/rotate | 需 react-hammerjs(2022 停更) | 24k★ 但**停维护** | 不推荐（上游死） |
| **原生 Pointer Events + 自建识别器** | W3C PE L3 | **完整，任意 N 指** | 原生（`Map<pointerId,state>`） | W3C 标准，零依赖 | **最贴**：直接升级现有单指 handler |
| any-touch/react-finger 等 | 多为 MIT | 仅 1–2 指 | 小众 | 低星 | 不适合 N 指 |

**推荐（FACT 推导）**：
- **双指滚/捏合**：用 `@use-gesture/react`（MIT，React hook，几行替换单指 drag）。
- **四指切桌面**：加**一小段自建 Pointer Events 识别器**（`Map<pointerId,{x,y,start}>`，数并发指、判四指同向左/右滑）。无任何库原生支持 4 指，且你已有 pointer handler 可扩展——保持原生 Pointer Events 最小 diff。
- MDN 多指范式正是 `Map<pointerId,state>` + `touch-action:none`（uurc-web 的 `stage.css` 已设 `touch-action:none`，✅ 已具备基础）。

---

## 2. 远端（被控 Mac）"真原生手势"能否注入——决定性约束

**结论：macOS 没有公开 API 注入"触控板手势"。所有 RD 工具都是"手势→动作"映射，没有一家注入真·手势。**

- **无公开手势事件类型**：Apple `CGEvent`/Quartz 只有 mouse/keyboard/scroll-wheel/tablet 事件类型，**没有 kCGEvent Gesture**。(FACT, Apple CGEvent 文档 + SO 共识)
- 触控板手势由 WindowServer / `MultitouchSupport.framework` 从 IOHID 原始多点数据识别；app 收到 `NSEvent` 手势，但**没有任何 API 能发出一个手势**。(FACT)
- 各 RD 工具实测都是映射（FACT）：
  - **RustDesk**：线协议 `DataMouse` 仅 Move/Down/Up/Scroll，无多点/手势；服务端用 `enigo`/CGEvent 只注 mouse/scroll/key。issue 明确"Mac 手势不传输"。
  - **noVNC**：touch→mouse 模拟（PR#1414/2065），无多点手势；trackpad 模式双指=scroll。
  - **Apache Guacamole**：`Touchpad`/`Touchscreen`/`Touch` 仍 resolve 成 mouse input，非 OS 手势。
  - **Chrome Remote Desktop**：`GestureInterpreter` 把触摸拆成 viewport 移动 + mouse/key 注入——"感觉原生"但底层仍是 gesture→mouse/key。行业参考标杆都如此。
  - **Parsec / Kasm**：web 端同样只映射。
- **唯一的"真手势路径"是私有/不支持的 hack**：
  - `oomol-lab/dockswipe` 能触发真·三/四指 dock-swipe（Spaces/Mission Control），但靠构造**私有 `CGEvent`**（type 29/30 + subtype `kIOHIDEventTypeDockSwipe`=23，字段 123/124/132）——移植自 **Mac Mouse Fix** 的 `TouchSimulator.m`。无需关 SIP，但**无公开 API、版本脆弱**（作者称 ~10.11–26 Tahoe 可用，27+ 字段路径坏、需转 `IOHIDEvent`+`CGEventSetHIDEvent`）。
  - 真·多点合成需私有 `MultitouchSupport.framework` / `IOHIDEventCreateDigitizerEvent`（如 `iolate/SimulateTouch`、`acidanthera/VoodooInput`）——**不支持、未文档、跨 macOS 版本易坏**（arm64e PAC、私有符号漂移）。
  - 这些 hack 需要被控 Mac 上跑一个**原生辅助程序 + 辅助功能授权**，浏览器端碰不到这条路径。

**合成结论**：在"被控 Mac"上，"真原生手势注入"经**支持的 API 不可达**；仅经**私有/未文档 CGS/IOHID hack**（dockswipe、SimulateTouch）可达，但脆弱、需原生程序、超出浏览器 RD 范畴。因此**"真原生手势"在浏览器 RD 语境下是个伪类别**——所有工具都做 gesture→action。

---

## 3. 可行的工程目标（三层，按保真度递增）

| 层 | 做法 | 远端效果 | 保真度 | 代价 |
|---|---|---|---|---|
| **A. 快捷键映射（§13.13 已定）** | 车机单/双指→滚轮；四指滑→`Ctrl+←/→` | Mac 切 Spaces（系统快捷键） | 高（效果一致） | 零协议改动，复用既有 `sendKey`/scroll |
| **B. 客户端真多指识别 + 映射（本次新增）** | 前端加 `@use-gesture/react`(双指) + 自建 4 指识别器 → 仍发 A 的动作 | 同上，但车机可真·多指操作 | 高 | 中：前端 ~150–250 LOC，不碰协议（协议已支持多指） |
| **C. 私有手势注入（仅追求"真手势"时）** | 被控 Mac 跑原生辅助程序（dockswipe/SimulateTouch）+ 辅助功能授权，浏览器按手势触发 | 真·OS 手势动画（dock swipe） | 最高 | 高+脆弱：私有 API、版本门、需原生程序、可能坏于 macOS 27+；**超出 uurc-web 网页边界** |

> 注：A 与 B 在"远端效果"上**没有区别**——都让 Mac 切 Spaces/滚动，只是 B 让车机用真实多指手势触发。C 才产生"真 OS 手势动画"，但代价与脆弱性极高，且依赖被控 Mac 跑私有程序。

---

## 4. 回答用户的原始问题

> "GitHub 上有没有开源方案 / 技术方案可以直接拿来用，实现真原生的手势？"

1. **客户端多指识别**：有成熟开源——`@use-gesture/react`（MIT）用于双指，四指用**原生 Pointer Events 自建识别器**（<100 LOC，MDN 范式）。uuRc-web 协议侧已支持多指，只需补前端。
2. **远端"真原生手势注入"**：**macOS 上无公开 API，所有 RD 工具都做不到，只有私有 hack（dockswipe/SimulateTouch）能近似，且脆弱、需原生程序**。所以"直接拿来用实现真原生手势"在受支持的范畴内**答案是否定的**；GitHub 上只有 `dockswipe` 这类私有路径实现，不推荐作为主方案。
3. **务实结论**：把"真原生手势"目标降为"车机真多指 → 触发 Mac 等效动作（scroll / Ctrl+←→）"。这既能用开源库廉价实现（B 层），远端效果与真手势一致，且完全在 uurc-web 网页边界内。若极端追求"OS 手势动画"，再考虑 C 层私有路径（单独票、单独风险）。

---

## 5. 证据分级汇总

| 主张 | 等级 | 来源 |
|---|---|---|
| uurc-web 协议已支持多指触控 | FACT | 读 `shared/src/streamerProtocol.ts` L1431/1713/1722 |
| 前端单 `activePointerId` 丢弃多指 | FACT | 读 `useRemoteControlController.ts` L864/881/892/907 |
| @use-gesture/react MIT、双指原生、4 指不原生 | FACT | pmndrs/use-gesture 仓库 |
| macOS 无公开 gesture 事件类型 | FACT | Apple CGEvent 文档 + SO 共识 |
| RustDesk/noVNC/Guacamole/CRD 均 gesture→action | FACT | 各自源码/PR |
| dockswipe 私有 CGEvent 触发真 swipe | VENDOR/UNSAFE | oomol-lab/dockswipe README |
| SimulateTouch/VoodooInput 私有多点合成 | UNSAFE | 各自仓库 |
| "真原生手势在网页 RD 不可达" | 分析 | 综合 1–2 |

---

## 6. 对主方案 / 下一步的建议（不替 brain 决定）

- 主方案（§13.11/§13.13）的"手势→快捷键"**仍然成立且是最优**，因为它就是所有 RD 工具的一致做法，且远端效果等同真手势。
- 若想让车机"真多指操作"，做 **B 层前端增强**（补 uurc-web 前端多指识别 → 仍映射成 scroll/Ctrl+←→），不碰协议、不需私有 API。
- 仅当你**必须**要"OS 手势动画"才评估 C 层（dockswipe），且该路径应在**被控 Mac 原生程序**里做、不在浏览器 RD 范畴，风险自负。
- 车机浏览器能否稳定上报多点触控 → 仍需**实车验证**（UNVERIFIED，源码层无法判断）。

> 仍将"被测机 = 个人 Mac（非 iOA）"作为前提（§13.10）。C 层若跑原生辅助程序，也要装在该个人 Mac 上、并授予辅助功能权限。
