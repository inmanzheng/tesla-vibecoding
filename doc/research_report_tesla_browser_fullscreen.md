# 特斯拉车机浏览器如何隐藏顶部栏 / 实现真正全屏

## Executive Summary
特斯拉车机浏览器的顶部地址栏无法通过标准的 HTML5 Fullscreen API、PWA standalone 或任何 meta 标签隐藏——这是社区与开发者的共识。唯一有效的"真·全屏"办法是欺骗浏览器进入其内置的 Theater（影院）模式：通过 `https://www.youtube.com/redirect?q=<目标URL>` 触发 Tesla 对白名单视频站才开放的无边框全屏容器，再加载目标网页。用户记忆中发音类似"Tesla Sex"的网站，几乎可以确定是 **S3XY（s3xy.top，中文社区称"TESLA 全屏助手"）**，一个借 YouTube 无边框容器把任意网站（含游戏页）全屏化的跳板门户。

## Background / Context
本项目（uurc-web）是在特斯拉车机浏览器里远程控制 Mac 的 Web 应用。由于车机浏览器默认保留一条 persistent 顶部栏（含后退/前进 + URL 地址栏，约占屏幕 1/3），远程控制页无法铺满全屏，影响交互体验。因此需要找到隐藏该顶栏的可靠方法。

## 一、顶栏现状与浏览器内核
特斯拉车机浏览器默认以"面板"形式打开，始终保留顶部栏。仅当打开内置白名单视频站（YouTube / Netflix 等 Theater 应用）时，浏览器才进入真正的全屏并隐藏顶栏。社区共识：无任何官方"全屏按钮"、双击、长按或点车标手势可关闭顶栏（来源：alexshoolman 2022；kylehe 2023）。

浏览器内核分两代：
- 老款 MCU1（2012–2018 老 Model S/X）：QtWebKit 内核 `QtCarBrowser`，UA 含 `AppleWebKit/... Tesla QtCarBrowser`。
- 新款 MCU2（Intel Atom）/ MCU3（AMD Ryzen）：Chromium/Blink 内核（与 Chrome 同源）。V11（2022）起升级到较新 Chromium，现代 UA 形如 `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ... Chrome/140.0.7339.207 Safari/537.36 Tesla/2026.20.200.1 TESLA_MODEL3`，另有 Android TV/WebView 形态。

无论哪一代，顶栏问题一致。

## 二、官方全屏功能与版本变更
- V10（2019）：引入 Theater 模式（Netflix/YouTube），但指 App，非浏览器全屏。
- V11 / 2022.12.1：移除娱乐分区多余顶栏、地址栏回归顶端、新增自动补全与浏览历史；作者明确写"希望未来加入 fullscreen mode"，即当时并未实装（notateslaapp.com/news/745）。
- V12 及之后：至今无官方浏览器全屏模式。

## 三、HTML5 Fullscreen API 是否可用
在特斯拉内基本不可用。开发者项目 `f/speedo`（全屏 GPS 速度表）明确说明：Tesla 环境不使用 `requestFullscreen`，而是复用"YouTube redirect route / Tesla Theater redirect"；并注明该技巧"generally parked-only，未来软件更新可能失效"。即 `requestFullscreen` / `webkitRequestFullscreen` 无法隐藏特斯拉浏览器顶栏（github.com/f/speedo）。

## 四、真正有效的"去顶栏"技巧（白名单重定向）
核心原理：欺骗浏览器以为正在打开内置视频站，触发其全屏逻辑后再跳转到目标网页（kylehe 2023-09-12）。

1. YouTube 重定向（最简单，无域名校验）：
   `https://www.youtube.com/redirect?q=<目标URL>`
2. Theater 模式绕道（alexshoolman 2022-03-02）：Theater 打开 YouTube → 登录 Google 账号 → 点右上"九点"图标 → 经 Google 应用矩阵（Search/Maps/Keep）导航任意站，全程全屏无顶栏。
3. 国内二次跳转（绕过域名校验）：
   `https://v.qq.com/search_redirect.html?url=https://www.1905.com/api/redirec.html?redirect_url=<目标>?www.1905.com`
4. 现成封装工具：fullscreentesla.com、abettertheater.com、testube.app、fullscreenhub.com，以及开源的 `bfmix.github.io/Tesla-fullscreen-launcher/?launch=<URL>`（纯前端，自动应用"best fullscreen strategy"）。
5. meta 标签 / PWA standalone / viewport 滚动隐藏：未发现有任何能让特斯拉顶栏消失的 Web 标准技巧；只有上述"视频站白名单重定向"可行。

## 五、用户记忆中的"Tesla Sex"网站
按发音线索排序，最可能的匹配是 **S3XY（读作 "sexy"，域名 s3xy.top，中文社区称"TESLA 全屏助手"）**。它是一个专为车机浏览器设计的全屏门户，用户输入任意网址后点 GO FULLSCREEN，借 YouTube 影院式无边框容器进入全屏，内含"游戏""剧场"标签，可玩游戏、看直播。域名 S3-X-Y.top 读作"sexy top"，与"Tesla Sex/特斯拉赛克西"发音高度吻合。其他全屏门户包括 tesladeck.com、testube.app、fullscreentesla.com，以及网页游戏平台 JOWUA Games。

## 对 uurc-web 项目的建议
控制 Mac 的远程控制页无法靠 requestFullscreen 或 PWA 去顶栏；必须让 Tesla 浏览器先经 YouTube 重定向（或 Theater 跳转）进入全屏，再加载控制页。具体落地：
- 将车机浏览器"首页/书签"指向 `https://www.youtube.com/redirect?q=https://43.161.198.131`。
- 或在部署页提供一个"全屏启动"按钮，点击后跳转到该重定向 URL。
- 可叠加 PRD 中规划的 F3 车载手势作为辅助。
- 风险提示：该技巧依赖白名单，可能随 OTA 失效；部分场景需挂 P 档（parked）；重定向 URL 可作为启动页参数固化。

## Limitations
重定向 trick 依赖特斯拉未公开的白名单逻辑，不同车型/固件版本表现可能不同，且随时可能被 OTA 封堵。上述方法多为车主社区经验，缺乏官方文档背书；建议在实际目标车型上验证一次。

## References
1. [Tesla | How to Browse Full-Screen - Alvaro Trigo's Blog](https://alvarotrigo.com/blog/tesla-model-y-browser/)
2. [在特斯拉车机浏览器中全屏网页的方法 - Kyle He](https://blog.kylehe.me/2023/09/12/fullscreen-webpage-in-tesla-browser)
3. [Tesla updates its browser with autocomplete, browsing history and more - Not a Tesla App](https://www.notateslaapp.com/news/745/tesla-updates-its-browser-with-autocomplete-browsing-history-and-more)
4. [Tesla Browser User Agents - WhatIsMyBrowser](https://explore.whatismybrowser.com/useragents/explore/software_name/tesla-browser/)
5. [Tesla Web Browser: How To Browse Full Screen (2022) - Alex Shoolman](https://www.alexshoolman.com/blog/2022/03/02/tesla-web-browser-full-screen/)
6. [Tesla-fullscreen-launcher - GitHub](https://github.com/BFMIX/Tesla-fullscreen-launcher)
7. [f/speedo fullscreen GPS speedometer - GitHub](https://github.com/f/speedo)
8. [s3xy.top（全屏助手）](https://s3xy.top/)
9. [TeslaDeck | Tesla Full Screen Browser](https://tesladeck.com/)
10. [Fullscreen Tesla Browser](https://www.fullscreentesla.com/)
11. [testube – fullscreen entertainment for your tesla](https://testube.app/)
12. [JOWUA Games｜專為 Tesla 車機打造的免費網頁遊戲平台](https://global.jowua-life.com/pages/jowua-games)
