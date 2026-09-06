# Handoff：被控 Mac 开 VPN 时的远控分流

- 文档性质：交接 / 设置说明（不改 uurc-web 代码）
- 日期：2026-09-06
- 工作区：`/Users/iveszheng/Downloads/Tesla VibeCoding/`
- 关联：`doc/tesla-remote-vibecoding.md`（架构）、`doc/handoff_uurc_tesla.md`（主交接）
- 状态：结论已收敛；落地是被控 Mac 上的 VPN 客户端配置，网页端绑不了网卡

---

## 一、背景与目标

车机浏览器远控个人 Mac，媒体（画面 + 声音）走 **UU / WebRTC**，香港 VPS 只走网页、信令和手机配对桥。

被控 Mac 上经常要开 VPN 翻墙（Clash / Surge / 系统 VPN / WARP）。全局开时远控会明显更卡。目标：**Mac 上仍能翻墙，UU/WebRTC 不进 VPN 节点。**

---

## 二、为什么会更卡

**会多一层中转。** 全局 VPN（TUN、增强模式、系统 VPN、WireGuard 接管默认路由）把 UU 客户端的出站也送进代理。

不开 VPN（已经可能经 UU TURN）：

```
车机浏览器  →  UU TURN（国内）  →  Mac 物理网卡（家宽）
```

Mac 全局 TUN 之后常见变成：

```
车机浏览器  →  UU TURN  →  VPN 出国节点  →  Mac
```

更糟：TUN + fake-ip 弄坏 STUN/TURN 的 UDP，只能走更差的 TCP/relay，或反复断连。控制页诊断里「实际路径」若从直连/普通中转无故变成强制中转，或开始狂重连，优先查 Mac 上的 VPN。

uurc-web **不能**给被控机绑网卡。出站 socket 在 UU 客户端里，网页在车机上，改不了「走 utun 还是 en0」。不要在前端做「VPN 检测」或假分流。

---

## 三、原则

**被墙流量走代理；UU / WebRTC 走物理网卡。不要用全局 TUN。**

远控继续用 UU，不要再叠 Tailscale/WARP 当远控隧道（ICE 候选会变成 VPN 地址，车机到不了，只能更绕的 relay）。

---

## 四、被控 Mac 上怎么配（按优先级）

### 1. 规则模式，关掉全局增强 / 系统 TUN

Clash / Surge / Stash 用 Rule：浏览器、Cursor、被墙域名走代理；`FINAL` / 未匹配走直连。远控 UDP 就不会进节点。

### 2. 进程绕过（最有效）

在「不代理这些进程」或 `process-name` 里绕过：

- `UU`
- `UU Remote`（名称以本机实际进程为准）
- UU 相关 helper

### 3. 域名 / IP 直连

规则里对这些走 `DIRECT`：

- UU 相关域名
- STUN / TURN 主机（远控页诊断里 `iceServers` 能看到）
- UDP 3478 / 443 尽量直连

### 4. 只给浏览器开代理

Chrome / Arc 用 SwitchyOmega，或「仅系统代理、不开 TUN」。Terminal 和 UU 完全不经过 VPN。翻墙只发生在你开网页的那个浏览器。

### 5. 不要叠 Mesh VPN 当远控

Tailscale / Cloudflare WARP 全局开着时，让 UU 的 ICE 走 VPN 地址。翻墙用上面的分流即可。

---

## 五、怎么验收

1. Mac 用规则模式 + 绕过 UU（不要 TUN）。
2. 车机连上远控，打开诊断，看「实际路径」。
3. 应和关 VPN 时同一档，不要无故变 relay。
4. 关 TUN、开规则后，卡顿应接近未开 VPN；浏览器仍应能打开被墙站点。

---

## 六、明确不做

- 不在 uurc-web 里写 Mac 原生分流器
- 不在设置页做「一键关 VPN」（网页碰不到）
- 不用滚轮/网页去调 Mac 系统音量来「补偿」卡顿
- 不把远控改成走香港 VPS 中转媒体（媒体必须继续走 UU/WebRTC）

---

## 七、交接时跟用户说的一句话

被控机开全局 VPN 会再套一跳，还会弄坏 WebRTC UDP。翻墙用规则分流或只给浏览器挂代理，把 UU 设成直连就行。
