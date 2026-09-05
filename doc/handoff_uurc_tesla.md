# Handoff：特斯拉车机远控 Mac（uurc-web）输入增强

- 文档性质：交接 / 状态快照
- 日期：2026-09-05
- 当前状态：可访问、基本可用；特斯拉端"无效签名"待修复
- 工作区：`/Users/zhengziyue/Documents/Tesla VibeCoding/`
- 关联文档：`prd_in_car_input_enhancement.md`（需求+技术预研）、`research_report_cockpit_uurc.md`（cockpit 调研）

---

## 一、背景与目标

在特斯拉车机浏览器里远程控制一台 Mac（走 uurc-web + UU 远程协议 + WebRTC 数据通道）。目标是让车机在无物理键盘/鼠标的约束下，能完成文本输入、语音听写、多桌面切换等 Mac 习惯操作。当前核心痛点：特斯拉车机浏览器是嵌入式/kiosk 环境，缺少部分现代浏览器 API（如 Web Crypto），且多点触控/麦克风权限未知，需要逐案兼容。

---

## 二、当前部署状态（已上线可访问）

- VPS：腾讯云轻量 中国香港 锐驰型 2C2G，公网 IP **43.161.198.131**
- 容器：`uurc-web-uurc-web-1`（镜像 `iola1999/uurc-web:latest`，由 `/opt/uurc-web` 经 `docker compose build` 构建）
- 入口：Caddy(:443 自签证书) → basicauth → 反代 127.0.0.1:8787
- 访问：`https://43.161.198.131`
  - 第一层 basicauth：用户名 `1111` / 密码 `88888888`
  - 第二层：UU 账号登录（手机号 + 短信验证码，无密码）
- 容器健康：`healthy`；公网 `curl -u 1111:88888888` 返回 200
- 域名：暂无（IP 自签模式运行中）。拿到域名后可跑 `/opt/uurc-web-deploy/switch-domain.sh` 一键切 Let's Encrypt 受信证书（车机 WebRTC 需受信 HTTPS，自签证书车机可能拒连，建议尽快注册域名）

---

## 三、已完成的代码改动

### A. Phase 0 — Mac 桌面/窗口/系统快捷键（已上线，验证 OK）
文件：`uurc-web/frontend/src/remote/remoteShortcuts.ts`
- 在 `KEY` 常量补：`arrowUp:19 / arrowDown:20 / arrowLeft:21 / arrowRight:22 / m:47 / f:33 / f11:141`（注：原文件已有 `f4:134`，不可重复）
- 在 `RemoteShortcut` 类型与 Mac 分组新增 9 条：
  - 调度中心 `Ctrl+↑`（`mac-mission-control`）
  - 上一桌面 `Ctrl+←`（`mac-prev-desktop`）
  - 下一桌面 `Ctrl+→`（`mac-next-desktop`）
  - 应用窗口总览 `Ctrl+↓`（`mac-app-expose`）
  - 显示桌面 `F11`（`mac-show-desktop`）
  - 最小化 `Cmd+M`（`mac-minimize`）
  - 全屏切换 `Cmd+Ctrl+F`（`mac-fullscreen-toggle`）
  - 锁屏 `Ctrl+Cmd+Q`（`mac-lock-screen`）
  - 启动台 `F4`（`mac-launchpad`）
- 复用既有 `sendRemoteShortcut` 组合键通道，无新协议依赖。车机菜单里被控端为 Mac 时自动置顶显示。

### B. Web Crypto 兼容 fallback（已上线，但 **有 bug 待修**，见第四节）
- 文件：
  - `uurc-web/frontend/src/uu/signing.ts`（原 `hmacSha256Hex` 在 `crypto.subtle` 不可用时抛错；改为 fallback 调用）
  - `uurc-web/frontend/src/uu/sha256-polyfill.ts`（新增：纯 JS SHA-256 + HMAC-SHA256）
- 目的：特斯拉浏览器无 `crypto.subtle`，登录签名报错 "Web Crypto is unavailable in this browser"。加纯 JS 实现降级。
- 关键坑：Vite/Rollup 会把"看似死代码"的 fallback 内联实现 tree-shake 掉，必须把实现放进**独立模块 + 无条件 import**，否则构建后 bundle 里没有 fallback。现已拆独立模块并 `import ... from "./sha256-polyfill.js"`（注意项目 `moduleResolution: node16`，相对路径必须带 `.js` 扩展名）。

---

## 四、已知问题：特斯拉端"无效签名"（P0，阻塞）

现象：特斯拉车机浏览器上，"Web Crypto is unavailable"报错已消失（说明 fallback 分支已执行），但登录时出现 **"无效签名"**（服务端校验 HMAC 不通过）。

根因（已定位，未修复）：`sha256-polyfill.ts` 的纯 JS 实现有两处错误，导致算出的哈希值错误：

1. `processBlock` 中消息扩展 `s0`/`s1` 运算符优先级错误
   现状代码：
   ```ts
   const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) >>> 0 | (w[i - 15] >>> 3);
   const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) >>> 0 | (w[i - 2] >>> 10);
   ```
   JS 中 `^` 优先级高于 `|` 但低于 `>>>`，上述被解析为 `((A ^ B) >>> 0) | C`，最后一项本应是异或 `^` 却变成了或 `|`。
   正确应为：
   ```ts
   const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
   const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
   ```

2. `flush()` 里消息长度计算多乘了一次 8
   现状代码：
   ```ts
   const bitLen = ((len[0] * 0x100000000) + len[1]) * 8;
   ```
   `len` 数组按字节累计时 `len[1] += 8`（每个字节 +8 bits），已经是 bit 数，不应再 `*8`。
   正确应为：
   ```ts
   const bitLen = (len[0] * 0x100000000) + len[1];
   ```

影响：普通浏览器仍走原生 `crypto.subtle`（正确），不受影响；**仅特斯拉等无 Web Crypto 的浏览器走到 fallback 才会"无效签名"**。所以 Mac/PC 端正常，车机端卡在登录。

---

## 五、待办清单（优先级）

- [P0] 修复 `sha256-polyfill.ts` 上述两处 bug（s0/s1 异或、bitLen 乘法）
- [P0] 修复后用 **RFC 4231 标准 HMAC-SHA256 测试向量**在本地 Node 验证实现正确（例：key="Jefe", data="what do ya want for nothing?" → `5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843`），通过后再部署
- [P1] 实车验证 Web Crypto fallback 是否真正消除"无效签名"并登录成功
- [P1] 语音听写（F1）：车机麦克风权限 + `webkitSpeechRecognition` 实车验证（`sendTextInput` 通道已具备）
- [P1] 自绘软键盘（F2）：新建键盘覆盖层组件（`androidKeyCodes.ts` 键码可复用）
- [P2] 车机多点触控手势（F3 路线 A：手势→`sendMouseScroll` / `Ctrl+←/→` 组合键），需先补多指针追踪层（当前控制器仅单 `activePointerId`）
- [P2] Mac 桌面可视化列表 + 点击跳转（需 Mac 侧助手枚举 Spaces）
- [P?] 注册域名并跑 `switch-domain.sh` 切受信证书（车机 WebRTC 稳定性）

---

## 六、关键文件指针

- `uurc-web/frontend/src/remote/remoteShortcuts.ts` — 快捷键体系（Phase 0 改动点）
- `uurc-web/frontend/src/uu/signing.ts` — UU 请求签名（HMAC-SHA256，fallback 调用方）
- `uurc-web/frontend/src/uu/sha256-polyfill.ts` — **待修复的纯 JS HMAC 实现**
- `uurc-web/frontend/src/controllers/useRemoteControlController.ts` — 指针/输入处理（第 860–914 行单指针限制，F3 相关）
- `uurc-web/frontend/src/remote/browserRemoteSession.ts` — 输入通道 API（`sendMouseScroll`/`sendKeyboardInput`/`sendTextInput`）
- `uurc-web/frontend/src/components/RemoteShortcutMenu.tsx` / `RemoteCommandBar.tsx` — 工具栏/快捷键菜单 UI
- `uurc-web-deploy/` — VPS 部署脚本（`deploy-vps.sh` / `switch-domain.sh` / `Caddyfile` / `README.md`）

---

## 七、重新构建与发布流程（VPS 操作）

**重要**：`deploy-vps.sh` 会从 GitHub 上游 `andy562560/uurc-web` `git pull`，会覆盖本地改动，**切勿用 deploy-vps.sh 部署本地修改**。正确流程：

1. 本地改完后，把源码（排除 `.git`/`node_modules`/`dist`）rsync 到 ubuntu 自家目录：
   ```
   rsync -az -e "ssh -i <KEY> -o StrictHostKeyChecking=no" \
     --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.DS_Store' \
     "/Users/zhengziyue/Documents/Tesla VibeCoding/uurc-web/" \
     ubuntu@43.161.198.131:/home/ubuntu/uurc-stage/
   ```
2. 因为 `/opt/uurc-web` 是 root 所有、ubuntu 不可直接写，先拷进临时目录再 `sudo cp`：
   ```
   ssh ... ubuntu@43.161.198.131 'sudo cp -a /home/ubuntu/uurc-stage/. /opt/uurc-web/'
   ```
   （保留 `/opt/uurc-web/.git` 不动，仅覆盖源码）
3. 在 VPS 后台构建镜像（构建约 1–2 分钟，别在前台等，工具易把长命令误判为 watch 而截断）：
   ```
   ssh ... ubuntu@43.161.198.131 'cd /opt/uurc-web && sudo docker compose build > /tmp/build.log 2>&1 & echo PID=$!'
   ```
4. 轮询构建完成：
   ```
   for i in $(seq 1 40); do sudo kill -0 <PID> 2>/dev/null || break; sleep 6; done; tail -15 /tmp/build.log
   ```
   确认日志出现 `uuweb  Built` 且 `sudo docker images iola1999/uurc-web` 时间戳更新。
5. 重启容器：
   ```
   ssh ... ubuntu@43.161.198.131 'cd /opt/uurc-web && sudo docker compose up -d'
   ```
6. 等待 `healthy` 后验证：
   ```
   sudo docker inspect -f "{{.State.Health.Status}}" uurc-web-uurc-web-1
   curl -sS -o /dev/null -w "%{http_code}\n" -k -u '1111:88888888' https://43.161.198.131/
   ```

---

## 八、踩坑记录（务必看）

- **`/opt/uurc-web` 是 root 所有**：ubuntu 直接 rsync 会 `Permission denied`，必须走 `ubuntu 家目录 → sudo cp`。
- **`--rsync-path="sudo rsync"` 会导致 SSH 失败（exit 255）**，不要用。
- **Vite tree-shaking**：fallback 实现必须独立模块 + 无条件 import，否则构建后消失。
- **`moduleResolution: node16`**：相对 import 必须带 `.js` 扩展名，否则 `tsc` 报 `TS2835`。
- **`KEY` 里 `f4:134` 已存在**：重复声明会 `TS1117`（对象字面量重复属性），新增键码前先查重。
- **Caddy 2.6.2 老版本**：`caddy hash-password` 可能返回空/换行，basicauth 用 `htpasswd -nbB` 生成 bcrypt 后把 `$2y$` 替换成 `$2a$`；语法是 `1111 $HASH`（用户名在前）。
- **车机原生能力未知**：实体麦克风键被特斯拉系统截走，网页拿不到；Web Speech API、多点触控、麦克风权限均需实车验证，且需保留降级方案。

---

## 九、Open Questions（需接手人确认）

- 修复 fallback 后，特斯拉浏览器能否真正完成 UU 登录？（取决于 HMAC 修复 + 车机是否放行其他登录所需 API）
- `F11`/`F4` 功能键在目标 Tesla 固件下是否生效（依赖 Mac "将 F1–F12 用作标准功能键"为关闭）
- 是否值得把纯 JS 实现换成成熟库（如 `crypto-js`，需评估包体积与离线可用性）
- 注册域名进度（影响车机 WebRTC 稳定性）
