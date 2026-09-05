# uurc-web 部署套件（车机 Vibecoding 回退方案）

来源：andy562560/uurc-web（已克隆到 `../uurc-web`）。本目录是把它跑在香港 VPS 上给特斯拉车机浏览器用的部署配置。

## 为什么需要这个
UU 远程**没有官方网页端**，车机浏览器装不了 App，所以用车机的唯一方式是自托管一个网页控制端。uurc-web 就是给 UU 加上纯网页端（自带软键盘、不依赖特斯拉 OSK），部署在你自己的 VPS 上，避开 Cloudflare/GFW。车机链路：车机浏览器 → uurc-web(VPS, HTTPS) → 浏览器内 UU Web 客户端 → UU 服务器 → 这台 Mac 的 UU 客户端。

## 当前状态（2026-09-05）
- VPS 已购：腾讯云轻量 **中国香港 锐驰型 2C2G/40G/200Mbps/无限流量**，公网 IP **43.161.198.131**。
- 部署完成：uurc-web 容器(8787) + Caddy(自签证书 + basicauth) 已上线，公网 `https://43.161.198.131` 验证 200。
- **域名：暂无（IP 自签模式运行中）**。强烈建议尽快注册一个域名（见下），因为车机 WebRTC 需要受信 HTTPS，自签证书车机可能拒绝。拿到域名后可用 `switch-domain.sh` 一键切到 Let's Encrypt 受信证书（见下）。
- **CodeBuddy Gateway 8787 问题：已由另一 Agent 处理完，与本 VPS 部署无冲突。**

## 部署步骤（在 VPS 终端以 root 执行）
1. SSH 进 VPS：`ssh root@43.161.198.131`（密码在腾讯云控制台）。
2. 把本目录的 `deploy-vps.sh` 传到 VPS，或直接用下面的 heredoc 在 VPS 上生成并运行：
   ```bash
   # 无域名临时模式（自签证书）
   UURC_PASSWORD='换成你的强密码' sudo bash deploy-vps.sh
   ```
   有域名后（推荐，车机无证书警告）：
   ```bash
   # 首次全量部署（含 docker/uurc-web/Caddy）：
   UURC_PASSWORD='同密码' sudo bash deploy-vps.sh --domain desktop.你的域名.com --email 你@邮箱.com
   # 或仅切换证书（不重装依赖/容器，秒级切换）：
   UURC_PASSWORD='同密码' sudo bash switch-domain.sh --domain desktop.你的域名.com --email 你@邮箱.com
   ```
3. 腾讯云轻量控制台「防火墙」放行 **80 / 443 / 22**（脚本里的 ufw 是系统层，云防火墙是另一层，两者都要开）。
4. 车机浏览器开 `https://<IP 或 域名>` → 输入 basicauth 密码（脚本输出的那串）→ UU 账号登录 → 控这台 Mac（画面 + 软键盘）。
5. 语音仍走手机 UU「麦克风直连」（手机麦 = Mac 麦），不经网页端。

## 关于域名（重要）
- 自签证书（IP 模式）下车机访问会报「证书不安全」，部分车机 kiosk 浏览器**不允许忽略**，会直接进不去。所以正式使用务必上真实域名 + Let's Encrypt（脚本 `--domain` 模式自动签发/续期）。
- 注册渠道：DNSPod / 腾讯云域名注册，选 `.top`/`.cn` 等便宜后缀（约 8–30 元/年），A 记录指向 `43.161.198.131`。无需 ICP 备案（香港节点）。
- 拿到域名后，先确认 DNS A 记录已生效（`ping 你的域名` 解析到 43.161.198.131），且云防火墙 80/443 已开，然后跑 `switch-domain.sh`（见上）即可秒级切到受信证书。basicauth 密码用同一个 `UURC_PASSWORD`（不传则默认沿用 `vibecoding2026`）。

## 注意
- uurc-web 自身无鉴权，Caddy `basic_auth` 必做（第一层），UU 登录态第二层。
- 镜像 `iola1999/uurc-web:latest` 若拉取失败，compose.yml 已含 `build` 上下文，会自动本地构建。
- 容器内 8787，映射到宿主机 8787；与本机（私人 Mac）CodeBuddy 网关的 `127.0.0.1:8787` 不在同一台机器，无冲突。
- 安全：云防火墙只放 80/443/22；如长期用，建议把 SSH 改成密钥 + 限 IP，或换非 22 端口。
- 合规：锐驰型严禁部署翻墙代理/流量穿透类服务；uurc-web + Caddy 自用远程桌面属正常用途。
