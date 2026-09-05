# 实践方案 — 车机多指手势（2023 Model 3 中国版 → 个人 Mac）

> 状态：最终实践规格（可直接开工）  
> 日期：2026-09-05  
> 目标车：2023 Model 3 中国版（MCU3 AMD Ryzen，Chromium）  
> 被控：个人 Mac（非 iOA），走 uurc-web + UU  
> 前序：`tesla-vibecoding-gestures.md`（调研）、可行性核对（源码）

---

## 0. 一句话

车机真多指识别，远端只发**已经存在**的滚轮和快捷键。不注入 Mac 触控板手势，不碰 `mumu_touch`，不加手势库。

---

## 1. 锁定决策

| 项 | 决定 | 原因 |
|---|---|---|
| 层级 | **只做 B** | A（菜单切桌面）已落地；C（私有 CGEvent）公开 API 不可达 |
| 远端出口 | `sendMouseScroll` / `sendRemoteShortcut` | Mac 路径已有；`browserRemoteSession` 没有、也不该有 `sendTouch` |
| 协议多指槽 | **不用** | `TouchInputTracker` / `SLOTMULTIPRESS` 是 Android/MuMu 触屏，不是 Mac 触控板 |
| 识别实现 | 原生 Pointer Events + 纯函数识别器 | 与现有 handler 同模型；热路径不能刷新 React；`@use-gesture/react` 无四指 |
| 事件模型回退 | **不写** Touch Events 回退 | 2023 国行 3 是 Chromium，Pointer Events 对齐现有代码 |
| 依赖 | 零新 npm | `frontend/package.json` 保持干净 |
| 画布全屏 | 不阻塞手势 | 国行 Theater 是腾讯/爱奇艺，不是 YouTube；有顶栏也能用手势，只是行程短 |

---

## 2. 手势规格（v1 必做 / 后做）

| 车机动作 | 判定 | 远端 | 优先级 |
|---|---|---|---|
| 单指点/拖 | 并发 1 指，分类窗结束或位移超过 slop | 现有 `sendMouseMove` + `mousePress/Release` | v1 |
| 双指同向滑 | 并发 2 指，质心位移 | `sendMouseScroll({ deltaX, deltaY })` | v1 |
| 三/四指左右滑 | 并发 ≥3，水平主导且超过阈值，**整段只发一次** | `mac-prev-desktop` / `mac-next-desktop` | v1 |
| 双指捏合 | 两指距离变化主导 | `Ctrl` 按住 + 滚轮（后做） | P1 |
| 三指上滑 | ≥3 指、向上主导 | `mac-mission-control` | P1 |

菜单里的「上一/下一桌面 / 调度中心」始终可用，作为 3/4 指被车机吃掉时的降级。

---

## 3. 架构

```
特斯拉 15" 触屏
  RemoteControlStage  (已有 pointerdown/move/up/cancel, touch-action:none)
       │
       ▼
  stageGestureRecognizer.ts   ← 新建，纯函数，零 React
       │  产出 Command[]
       ├─ { type: "mouseMove" | "mousePress" | "mouseRelease", ... }
       ├─ { type: "scroll", deltaX, deltaY }
       └─ { type: "shortcut", id: "mac-prev-desktop" | "mac-next-desktop" }
       │
       ▼
  useRemoteControlController   ← 只改指针四函数，用 Map 替掉 activePointerId
       │
       ▼
  browserRemoteSession         ← 不改 API
       sendMouseMove / sendMouseButton / sendMouseScroll / sendRemoteShortcut
```

热路径约束（现有注释 L868–872）：识别与发送**禁止** `setState` / `getState()`。探针数字用 DOM `textContent`，不要进 React。

---

## 4. 状态机（必须按这个写，否则双指会先点到 Mac）

现在的 handler 在第一指 `pointerdown` 立刻 `mousePress`。第二指若晚 50ms 到，Mac 上已经按下。所以**第一指按下不能马上发鼠标**。

```
          第一指 down
               │
               ▼
           pending ──── 80ms 到点 或 位移>12px ────► mouse（再发 press）
               │
               │ 期间来了第 2 指
               ▼
            scroll
               │
               │ 期间来了第 3 指
               ▼
            swipe（水平够了只 fire 一次）

  任何多指模式若发现已经发过 mousePress → 先 mouseRelease 再切换
  全部手指抬起 → idle，清 Map
```

| 模式 | 行为 |
|---|---|
| `pending` | 只记点，不发鼠标 |
| `mouse` | 与今天单指路径相同 |
| `scroll` | 质心 Δ → 滚轮；剩余 1 指不转回鼠标，等全部抬起 |
| `swipe` | 平均水平位移过阈才发快捷键；之后本段忽略 |
| `idle` | 无指针 |

`pending` 期内全部抬起且位移 < slop → 补一次 click（press + release），短点不发飘。

---

## 5. 阈值（按 15 / 15.4 寸、约 1920×1080 画布）

写进 `GESTURE_THRESHOLDS` 常量，测试引用同一份，禁止魔法数散落。

| 常量 | 值 | 含义 |
|---|---|---|
| `CLASSIFY_MS` | 80 | 等第二指的窗口 |
| `MOUSE_SLOP_PX` | 12 | 超过则提前升为 mouse |
| `SCROLL_GAIN` | 1.2 | 质心像素 → `deltaX/Y` |
| `SCROLL_MIN_PX` | 2 | 小于此不发，防抖 |
| `SWIPE_PX` | 96 | 水平位移门槛 |
| `SWIPE_RATIO` | 1.5 | `\|dx\| > 1.5 * \|dy\|` 才算横滑 |
| `SWIPE_COOLDOWN_MS` | 400 | 防止一次滑发两次 |
| `MAX_POINTERS` | 4 | 第 5 指忽略 |

滚轮方向：双指**向上滑** → `deltaY < 0`（跟浏览器 `wheel`、现有 `handleRemoteStageWheel` 一致，Mac 自然滚动交给被控端系统偏好）。

---

## 6. 改哪些文件

### 新建

`uurc-web/frontend/src/remote/stageGestureRecognizer.ts`

```ts
export type GestureMode = "idle" | "pending" | "mouse" | "scroll" | "swipe";

export type GestureCommand =
  | { type: "mouseMove"; clientX: number; clientY: number }
  | { type: "mousePress"; button: number }
  | { type: "mouseRelease"; button: number }
  | { type: "scroll"; deltaX: number; deltaY: number }
  | { type: "shortcut"; id: "mac-prev-desktop" | "mac-next-desktop" };

export function createStageGestureRecognizer(now?: () => number): {
  pointerDown(e: PointerSample): GestureCommand[];
  pointerMove(e: PointerSample): GestureCommand[];
  pointerUp(e: PointerSample): GestureCommand[];
  pointerCancel(e: PointerSample): GestureCommand[];
  reset(): GestureCommand[]; // 失焦 / 关输入时抬起残留鼠标
  snapshot(): { mode: GestureMode; count: number; maxCount: number };
};
```

`PointerSample`：`{ pointerId, clientX, clientY, button, timeStamp }`。识别器**不碰 DOM、不碰 session**。坐标用 `clientX/Y` 做手势；真正换算到远端画面仍走现有 `toRemoteMousePosition`（它读 `currentTarget` + video）。

Controller 伪代码：

```ts
const gesture = useRef(createStageGestureRecognizer());
for (const cmd of gesture.current.pointerMove(sample)) {
  if (cmd.type === "scroll") session.sendMouseScroll(cmd);
  else if (cmd.type === "shortcut") sendRemoteShortcut(session, cmd.id);
  else if (cmd.type === "mouseMove") session.sendMouseMove(toRemoteMousePosition(event));
  // press / release 同理
}
```

注意：`mouseMove` 命令只表示「该发移动」，位置仍从**当前 event** 经 `toRemoteMousePosition` 计算，避免识别器重复实现 letterbox。

### 改

- `useRemoteControlController.ts`：删 `activePointerId`；四指针函数改走识别器；关输入 / `releaseAllInputs` 时 `recognizer.reset()` 并吞掉残留 `mouseRelease`。
- `RemoteControlStage.tsx`：每个 pointer 都 `setPointerCapture`（识别器 down 时由 controller 调，已有代码只需对**每一个** `pointerId` capture，不要只 capture 第一指）。
- `stage.css`：保持 `.remote-stage-interactive { touch-action: none }`，不要改回默认。

### 测试（新建）

`uurc-web/frontend/tests/stageGestureRecognizer.test.ts`，至少覆盖：

1. 单指 down→up、位移 < slop → 一对 press/release（click）
2. 单指 down、81ms 后仍 1 指 → 出现 press，随后 move
3. 第一指 down 后 40ms 第二指 down → **没有** press；move 出 scroll
4. 已进入 mouse 后第二指到达 → 先 release 再 scroll
5. 三指水平 +96px → 恰好一条 `mac-next-desktop` 或 `prev`，再滑不再发
6. 三指竖直为主 → 不发切桌面
7. `reset()` 在 mouse 中 → 一条 `mouseRelease`

现有 `remoteShortcuts.test.ts` / `browserRemoteSession` 测试不改。

### 明确不改

- `streamerProtocol.ts` / `TouchInputTracker`
- `browserRemoteSession` 的输入 API
- `remoteShortcuts.ts`（键码已齐）
- 不加 `@use-gesture/react`

---

## 7. 实车探针（同一 PR，默认关）

国行 3 上唯一未知：网页一次能拿到几根 `pointerId`。

- URL：`?gestureProbe=1`（或 `localStorage.uurcGestureProbe=1`）
- 远控画布左上角一个绝对定位 `<div>`，用 `textContent` 写：`fingers=N max=M ids=…`
- 只在探针开时挂这个节点，关输入就卸
- 验收：
  - 1 指：`max≥1`（基线，现在就能过）
  - 2 指：`max≥2` → 开双指滚
  - 3/4 指：`max≥3` → 开横滑切桌面；否则菜单兜底，识别器逻辑保留无害

---

## 8. 车机注意（2023 Model 3 中国版）

- 先解锁输入（现有「控制中」），否则 stage 没有 `touch-action: none`。
- 所有 pointer 回调继续 `preventDefault()`，减少浏览器捏合缩放页面。
- 国行 Theater 去顶栏用腾讯/爱奇艺跳板，**不要**抄 `youtube.com/redirect`。手势不依赖全屏。
- 建议 P 档操作。系统从底边滑出控制条若吞掉 pointer，走 `pointercancel` → `reset()`。
- 确认 MCU：控制 → 软件 → 附加车辆信息 → AMD Ryzen。

---

## 9. 工期与验收

| 步 | 内容 | 大约 |
|---|---|---|
| 1 | 识别器 + 单测 | 0.5–1 天 |
| 2 | 接到 controller + capture 每一指 + reset | 0.5 天 |
| 3 | 探针 overlay | 1–2 小时 |
| 4 | 车上数指 + 双指滚 / 四指切桌面 | 0.5 小时 |

验收（v1）：

- [ ] Mac 浏览器里：单指点、拖与现在一致，无残按下
- [ ] 触控板/触摸屏：双指滑，远端页面滚动
- [ ] 能模拟 3 指时：右滑下一桌面、左滑上一桌面，一次滑只切一次
- [ ] 菜单切桌面仍可用
- [ ] 车上探针记下 `max`；`max<3` 不挡发版

---

## 10. 不做

- 私有 `CGEvent` / dockswipe / `MultitouchSupport`
- 把多指发给 `SLOTMULTIPRESS`
- 可视化 Spaces 列表、跳第 N 桌面（仍是 F4 P2，需 Mac 守护）
- 为 MCU1 写 Touch Events 双栈
