# 需求文档与技术预研：特斯拉车机远程控制 Mac 的输入增强

- 文档状态：Draft v0.1（待评审）
- 日期：2026-09-05
- 作者：产品 + 技术联合（基于 uurc-web 代码现状）
- 关联项目：uurc-web（车机浏览器 → 远程控制 Mac，走 UU 远程协议 + WebRTC 数据通道）
- 关联部署：VPS 43.161.198.131，车机访问入口后续切域名（switch-domain.sh）

---

## 1. 背景与问题陈述

用户在特斯拉车机的浏览器里远程控制一台 Mac。当前 uurc-web 已经跑通"第一层 basicauth + 第二层 UU 手机号验证码登录 + 画面/软键盘回退"。但在车机这个**没有物理键盘、没有原生鼠标、没有可靠软键盘、麦克风/多点触控能力未知**的环境里，纯"点按 + 物理键盘转发"的输入方式体验很差：

- 车机浏览器没有稳定可用的系统软键盘，文本输入经常无从下手；
- 用户习惯 Mac 的多桌面（Spaces）与触控板手势（四指滑动切换桌面、双指滚动），但车机屏幕是触摸屏，二者之间没有任何映射；
- 商业方案（如 cockpit/thegridbase-ai）已证明"车机软键盘 + 语音听写 + 特斯拉针对性优化"是可行且体验更好的路线，但我们当前没有这些能力。

本方案的目标是：在不依赖特斯拉私有 API 的前提下，用**通用浏览器能力 + 既有 UU 输入通道**，把车机变成一个能"打字、听话、用手势切桌面"的 Mac 远控终端。

---

## 2. 目标与成功指标

- 用户无需物理键盘即可在车机完成文本输入（软键盘 + 语音听写两条路径）。
- 用户能在车机屏幕上用手势/按钮操作 Mac 的多桌面与触控板习惯手势。
- 所有新增输入都复用既有 `sendKeyboardInput` / `sendTextInput` / `sendMouseScroll` 通道，不引入新的远端协议依赖（除非确有必要）。

成功指标（建议上线后 30 天评估）：
- 语音听写激活率：车机会话中开启麦克风听写的占比 ≥ 30%。
- 文本输入任务完成率：在车机完成一次≥20 字输入的会话占比 ≥ 80%。
- 桌面切换操作平均耗时：从"想切桌面"到"切到目标桌面" < 3 秒（按钮路径）。
- 实车可用率：在目标车机浏览器上，软键盘与手势功能可用率（非降级）≥ 90%。

---

## 3. 范围（Non-Goals）

- 不接入特斯拉原生 API（车辆命令、原生语音助手、物理麦克风按键接管）——这些被车辆系统截走，网页拿不到，本版不做。
- 不做"把车机麦克风实时音频流转发到 Mac"（即语音通话/录音）。本版的"语音"是**本地识别成文字再注入**，不是音频流。
- 不重造 UU 远程协议；新增能力优先走既有输入方法。
- 不保证在所有特斯拉车型/车机固件版本一致可用——以实车验证为准，提供降级方案。
- 不实现"任意跳到第 N 个桌面"的精确跳转（需 Mac 侧助手，见 F4，列为 P2）。

---

## 4. 用户故事

- 作为车主，我想在车机里直接打字给远端 Mac 的输入框，这样我不用带键盘也能填表/聊天。
- 作为车主，我想对着车机说话就把文字输进去，这样开车时手不用离开方向盘。
- 作为 Mac 用户，我想在车机屏幕上用滑动手势切换桌面/滚动页面，这样操作习惯跟在 Mac 上一致。
- 作为 Mac 用户，我想一键打开"调度中心/显示所有桌面"，并左右切换到相邻桌面，这样不用回到 Mac 前。
- 作为车主，当车机麦克风或软键盘不可用时，我希望有可降级的人工输入方式，别卡死。

---

## 5. 功能需求与技术可行性（核心）

### F1 语音听写（车机麦克风 → 文字 → 远端输入框）

需求：在 uurc-web 界面加一个麦克风按钮；点击后通过浏览器 `SpeechRecognition`（`webkitSpeechRecognition`）用车机麦克风收音，识别文字后，调用 `browserRemoteSession.sendTextInput(文字)` 注入到远端当前聚焦的输入框。

技术可行性（High）：
- 远端文字注入通道已存在：`sendTextInput` → `buildStreamerTextInputMessage` → `sendInputData`（`browserRemoteSession.ts` 第 490、492、1057 行）。文字落在当前 OS 焦点输入框（操作系统级注入，非 DOM 定向），所以"先聚焦远程输入框再听写"成立。
- 需新增：麦克风按钮 UI + `SpeechRecognition` 封装（识别中状态、结果回填、错误提示、语言=zh-CN）。
- 关键约束：**车机浏览器是否向网页开放麦克风权限未知**，需实车验证。若不支持，整条链路不可用——必须有软键盘降级。
- 触发方式注意：不要用"车机实体麦克风键"，它被特斯拉原生语音系统截走；只能用网页内的可点按钮。

验收：点麦克风→授权→说话→远端聚焦框出现对应文字；无麦克风权限时按钮置灰并提示降级。

### F2 自绘软键盘（解决车机无可靠系统软键盘）

需求：在车机界面提供自绘屏幕键盘（中英文/符号），按键后通过 `sendKeyboardInput`（逐键）或 `sendTextInput`（中文整段）注入远端。

技术可行性（High，工作量中等）：
- 逐键路径 `sendKeyboardInput({action, value})` 已存在；`androidKeyCodes.ts` 已有移动端键码映射可复用。
- 中文整段用 `sendTextInput` 更直接（绕过逐键编码问题）。
- 当前代码未找到显式自绘键盘组件（搜索 QWERTY/KeyButton 无匹配），需新建键盘覆盖层组件，参考 cockpit 的键盘布局但不直接复制其 noVNC 协议耦合部分。

验收：车机点软键盘→远端对应输入框出现字符；中英文切换、退格、回车、组合键（Cmd/Ctrl）可用。

### F3 车机触摸屏上的 Mac 触控板手势

需求：在车机触摸屏上，用多指手势模拟 Mac 触控板习惯——双指上下滑=滚动、三/四指左右滑=切换桌面、捏合=缩放等。

技术可行性（Medium，分两条路线）：
- 现状硬约束：控制器 `useRemoteControlController.ts`（第 860–914 行）只维护**单个 `activePointerId`**，即当前是**单点触控**，无法区分单指拖动（鼠标移动）与多指手势。要做多指手势，必须先把"多点指针追踪 + 手势识别"补上（新增手势识别层，区分 1/2/3/4 指及运动方向）。
- 路线 A（推荐，Low-Risk）：手势 → 键盘/滚轮快捷键映射，复用既有通道。
  - 双指上下滑 → `sendMouseScroll`（Mac 已专用化，第 479 行 `buildStreamerMacMouseScrollInputMessage`）。
  - 三/四指左右滑 → 发送 `Ctrl+←` / `Ctrl+→`（Mac Spaces 切换，见 F4）。
  - 捏合 → 可映射为 `Ctrl+滚轮`（Mac 缩放习惯）。
  - 这条路线**不需要** UU 协议支持原生触控板手势事件，风险最低。
- 路线 B（High-Fidelity，Low/Medium 置信）：向远端注入原生触控板手势事件。
  - 取决于 UU/streamer 是否支持手势输入消息（当前代码无 `buildStreamerGestureInputMessage`，即未实现），需查阅 UU 协议或逆向确认。未确认前不承诺。
- 车机浏览器多点触控支持需实车验证（kiosk 浏览器可能只报单指针）。

验收（路线 A）：双指滑可滚动远程页面；四指左/右滑可切换相邻桌面；单指仍等价于鼠标移动/点击，互不干扰。

### F4 Mac 多桌面（Spaces）/ 调度中心控制

需求：
- 一键"显示所有桌面 / 调度中心（Mission Control）"。
- 切换到上一个/下一个桌面。
- （P2）可视化桌面列表，点击跳到指定桌面。

技术可行性：
- 基础项（High）：直接复用 `remoteShortcuts.ts` + `RemoteShortcutMenu.tsx` 的既有快捷键体系。
  - Mission Control = `Ctrl+↑`（或 F3）；上一桌面 = `Ctrl+←`；下一桌面 = `Ctrl+→`。
  - 只需在 `remoteShortcuts.ts` 的 Mac 分组新增 `mac-mission-control` / `mac-prev-desktop` / `mac-next-desktop`，并在 `KEY` 常量补 `arrowUp/Left/Right/Down`（具体数值按 streamer 键码表确认，列为实现细节待确认），`sendRemoteShortcut` 已能发送组合键。
  - 这部分工作量极小，风险最低，建议作为第一个落地项。
- 进阶项（Medium，P2）：可视化桌面列表 + 点击跳第 N 个桌面。
  - 需要 **Mac 侧助手** 枚举 Spaces 数量/当前索引（AppleScript / CoreGraphics），uurc-web 自身无法枚举；且"跳到指定桌面"没有标准键盘快捷键，需 AppleScript/CGEvent。
  - 需新增一个轻量 Mac 端守护（或复用 UU 已有能力）上报桌面信息，并在 web 端渲染列表。工作量与依赖明显更大。

验收（P0）：车机点"下一桌面"→ 远端 Mac 切到相邻桌面；点"调度中心"→ 远端进入 Mission Control 总览。

---

## 6. 跨功能技术约束与风险

- 单指针限制（P0 阻断 F3 路线 A 之外的能力）：当前控制器只认一个指针，多点手势必须先补"多指针追踪 + 手势识别"层。
- UU 协议未知项（影响 F3 路线 B、F4 进阶）：streamer 是否支持原生手势/桌面枚举事件未证实，列为 Open Question。
- 车机浏览器能力不确定（影响 F1、F3）：麦克风权限、Web Speech API、多点触控 pointer 事件，全部依赖实车浏览器，无法在 Mac 端验证；必须有降级（F2 软键盘）。
- 输入通道热路径约束：`browserRemoteSession` 刻意不刷新 React 状态以保心跳（第 868–872 行注释），新增 UI 状态（如听写中）需走独立轻量状态，避免拖慢控制心跳。

---

## 7. 待确认问题（Open Questions）

- 工程：车机浏览器（目标车型/固件）是否向网页开放麦克风权限并支持 `webkitSpeechRecognition`？（阻断 F1，需实车测）
- 工程：车机浏览器是否上报多点 `pointer` 事件（而非单点）？（影响 F3 手势识别层设计）
- 工程：streamer 键码表中方向键（arrow*）的数值是多少？是否支持原生手势/桌面枚举消息？（影响 F4 基础项实现细节与 F3 路线 B）
- 产品：中文输入默认走 `sendTextInput` 整段 vs 逐键，哪种在目标 App 里更稳？（影响 F2 实现）
- 产品："跳到第 N 桌面"是否值得做（需 Mac 守护），还是 P0 只做上一/下一？（决定 F4 范围）

---

## 8. 里程碑建议（分期）

- Phase 0（最快见效，1–2 天）：F4 基础项——Mac 快捷键菜单加 Mission Control / 上一/下一桌面（仅改 `remoteShortcuts.ts` + `KEY`）。立即解决"切桌面"痛点。
- Phase 1（低风险，3–5 天）：F2 自绘软键盘 + F1 语音听写按钮（走 `sendTextInput`）。解决文本输入。
- Phase 2（中等，1–2 周）：F3 多点触控手势层（路线 A：手势→快捷键/滚轮映射），含单指/多指区分与防误触。
- Phase 3（可选，P2）：F3 路线 B 原生手势注入（需 UU 协议确认）+ F4 进阶桌面列表（需 Mac 守护）。

---

## 9. 参考（代码指针）

- `uurc-web/frontend/src/remote/browserRemoteSession.ts`：输入 API 定义（`sendMouseMove/Button/Scroll` 第 467–479 行；`sendKeyboardInput` 第 482；`sendTextInput` 第 490；`sendInputData` 第 1057）。
- `uurc-web/frontend/src/controllers/useRemoteControlController.ts`：指针处理（第 860–914 行，**单 `activePointerId`**）。
- `uurc-web/frontend/src/remote/remoteShortcuts.ts`：快捷键体系与 `KEY` 键码表（第 1–114 行，Mac 分组第 60–70 行）。
- `uurc-web/frontend/src/components/RemoteShortcutMenu.tsx` / `RemoteCommandBar.tsx`：快捷键菜单与工具栏 UI（新增 Mac 桌面控制按钮的落点）。
- `uurc-web/frontend/src/remote/androidKeyCodes.ts`：移动端键码映射，F2 软键盘可复用。
- 对比参考：`https://github.com/thegridbase-ai/cockpit`（软键盘 + 语音听写思路，非特斯拉私有 API）。
