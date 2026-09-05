# 研究计划：将 cockpit 的特斯拉针对性优化借鉴到 uurc-web

## 背景
当前车机远程控制方案：车机浏览器 → uurc-web(VPS, HTTPS) → UU Web 客户端 → 本机 UU → Mac。
uurc-web 已自带软键盘（不依赖特斯拉 OSK）。用户希望借鉴 `https://github.com/thegridbase-ai/cockpit`（号称有特斯拉针对性优化，如车机麦克风直接输入、车机键盘等），把 uurc-web 的特斯拉体验也优化一下。

## 研究目标
1. 搞清楚 cockpit 针对特斯拉做了哪些输入/交互层面的优化（麦克风直输、车机键盘、语音、触控等）。
2. 搞清楚 uurc-web 目前的输入能力边界（软键盘现状、是否有音频/麦克风支持、输入如何下发到远端）。
3. 判断哪些 cockpit 优化可以"借鉴/移植"到 uurc-web，给出具体、可行的方案与改动点。

## 查询类型
深度优先（Depth-first）+ 代码分析：同一核心问题（如何优化车机输入）的多角度分析。

## 研究步骤
### A. cockpit 仓库分析（子代理，web 研究）
- 用 web_fetch / gh 读 README、目录结构、关键源码。
- 聚焦：麦克风/语音输入、车机键盘/OSK、Tesla 车辆 API 集成、WebRTC 数据通道、输入下发机制。
- 产出：架构说明 + 具体文件/函数指针 + 哪些特性是"特斯拉专属"。

### B. uurc-web 本地分析（本地代码探索）
- 读 README、frontend 输入相关文件（软键盘组件、remote control UI、transport、信号网关）。
- 确认：软键盘实现位置、是否有音频轨道/mic、输入事件如何发到远端 UU。

### C. 综合与方案（主代理合成）
- 对比 A/B，列出可借鉴项（麦克风直输、车机键盘增强等）与可行性（受 UU 协议/车机浏览器能力约束）。
- 给出优先级建议与落地改动点。

## 信息检索策略说明
- 本任务以 GitHub 公开源码 + 本地代码分析为主；wechat-article-search 不适用（无对应中文资讯），故不强制使用。
- cockpit 信息通过 web_fetch 抓取仓库页面与 raw 文件；uurc-web 通过本地 read/search 分析。

## 预期交付
一份研究/可行性分析报告（research_report_cockpit_uurc.md），包含：cockpit 的特斯拉优化清单、uurc-web 现状、可借鉴项与落地建议、约束与风险。
