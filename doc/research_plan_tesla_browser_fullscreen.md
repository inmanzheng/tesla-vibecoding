# Research Plan: 特斯拉车机浏览器如何隐藏顶部栏 / 实现真正全屏

## 研究目标
1. 找到特斯拉车机浏览器隐藏顶部栏（地址栏/控制栏）的方法，实现"真正全屏"。
2. 追查用户记忆中的"某网站 / 某游戏"——用户印象里是一个能做到无顶部栏全屏的网站，可能与某个游戏有关（发音类似 "Tesla Sex" / S3XY / Arcade 游戏）。

## 查询类型判断
偏 Straightforward + 少量 Depth：核心事实明确（如何隐藏顶部栏），但需交叉验证多个来源（官方更新说明、车主社区、开发者博客）。适合 2 个并行 subagent + 自身 Web 检索。

## 子任务划分
- A. 特斯拉浏览器全屏机制：官方是否提供全屏按钮/手势？kiosk 模式？PWA / 全屏 API（requestFullscreen）在车机浏览器是否生效？车机浏览器内核（WebKit/QtWebKit/Chromium）对 Fullscreen API 的支持情况。
- B. 隐藏顶部栏的具体技巧与知名案例：是否有特定 URL scheme、meta 标签、或"伪全屏"网页能做到顶部栏自动消失？追查用户提到的"游戏网站"（Tesla Sex / S3XY / Arcade / Boomerang / 某赛车游戏）线索。

## 信息源
- 车主论坛：teslamotorsclub.com, reddit r/TeslaLounge, 中文社区（懂车帝/微博/微信文章）
- 官方发布说明：Tesla 软件更新 notes（V11 / V12 浏览器变化）
- 开发者经验：关于 Tesla Browser user-agent、Fullscreen API 支持的文章

## 微信文章检索（wechat-article-search）
- 关键词：特斯拉 浏览器 全屏 / 隐藏 顶部栏 / 车机 浏览器 全屏 游戏
- 时间范围：近 3 年

## 合成方式
将 A（机制）+ B（案例/记忆线索）合并，给出"可行方法清单 + 你记得的那个网站最可能是什么"。
