# 特斯拉车机对蓝牙鼠标/键盘的支持与开源方案调研

## 摘要

结论是：特斯拉车机**不能原生连接蓝牙鼠标和蓝牙键盘**。其蓝牙协议栈虽包含 HID（Human Interface Device）profile，但被官方严格限定在游戏手柄场景，键盘、鼠标等通用输入设备无法配对。车主实测普遍反映"能搜到设备名称，但连不上"。可行的替代路径有三条：USB 有线或带 USB 接收器的 2.4G 键鼠（浏览器内可用）、Tesla Android 这类在车机屏幕内跑完整 Android 系统的开源方案（蓝牙外设与树莓派上的 Android 配对）、以及风险极高的越狱/root 方案。目前没有成熟、低风险、能让车机原生蓝牙直连键鼠的开源项目。

## 背景

很多车主希望在大屏上办公、写代码或玩需要精细操作的游戏，自然会想到接一套蓝牙键鼠。但特斯拉的车机（MCU）并非通用电脑，其蓝牙能力、外设权限都是被软件严格管控的。本报告分两部分回答用户的疑问：原生支持情况，和开源/第三方可行方案。

## 一、车机原生对蓝牙键鼠的支持情况

特斯拉各代车机硬件差异较大，但结论一致：蓝牙键鼠均不可用。具体来看，MCU1（早期 Model S/X，NVIDIA Tegra 平台）仅支持 USB 有线，既无蓝牙手柄也不支持蓝牙键鼠；MCU2（2018 年起的 Intel Atom）和 MCU3（2021 年起的 AMD Ryzen）支持蓝牙经典（Bluetooth Classic），但 HID 能力被锁死在游戏手柄上，用于 Tesla Arcade 和 Toybox 游戏，不能操控导航、空调或媒体。

官方车主手册（特斯拉中国 Model 3 2017–2023 蓝牙兼容性章节）明确列出蓝牙仅用于三类设备：手机（免提、媒体）、iPod/iPad/Android 平板（媒体播放）、以及游戏手柄（2022.20.5 起逐步支持 DualShock 4、DualSense 等）。全文从未出现 keyboard、mouse、HID 字样，可见官方从未承诺键鼠支持。TeslaNorth 报道 2022.20.5（2022 年 7 月）版本加入了多手柄/多人游戏支持，手柄通过车机蓝牙图标配对，但仅限部分游戏内使用，且金属车厢易导致信号弱、中途断连，最多本地两个手柄。

关键实测来自车主论坛：Tesla Motors Club 上 2013 款 Model S 的帖子显示，插入微软 USB 鼠标即出现蓝色圆形光标，可点击拖动滚动，带 USB 接收器的罗技无线键鼠组合也可用，但用车机原生蓝牙配对键盘/鼠标时"能发现名称却无法连接"，论坛推测车机缺失蓝牙 HID 协议。2025 年 Cybertruck 论坛有车主询问能否连键盘辅助输入或游戏，帖中无任何成功案例回复。可交叉印证社区共识：蓝牙键鼠不可行，能搜到但连不上，HID 仅限手柄。

因此，绕行方案是 **USB 有线键鼠或带接收器的 2.4G 键鼠**：浏览器场景下鼠标基本可用，键盘兼容性不稳定（大型人体工学键盘常不被识别，需反复插拔）。这是"绕行"而非"原生蓝牙"，且市面上例如 TESLA D8 mini 这类带触控板的无线键盘正是利用 USB HID 能力而非蓝牙。此外，Chrome 的 WebHID API 出于安全明确屏蔽键盘/鼠标等通用输入设备，而特斯拉浏览器为老旧 WebKit 内核，基本不可能通过网页方案引入蓝牙 HID。

## 二、能让车机支持键鼠的开源/第三方方案

经检索，并不存在"让车机原生蓝牙直连键鼠"的开源项目，最接近现实的可行方案是通过在车机屏幕里运行一个独立的 Android 系统来间接获得蓝牙键鼠能力。

Tesla Android 是目前最成熟、最务实的民间方案，真实仓库为 GitHub 上的 `tesla-android` 组织（官网 tesdroid.com，旧域名 teslaandroid.com 已重定向，注意 `snaphat/Tesla-Android` 这个仓库不存在、是误传）。其原理是在树莓派 4 或 Compute Module 4（第二代改为波兰定制硬件）上运行基于 AOSP 的定制 Android，车机通过内置浏览器访问设备.teslaandroid.com，连接树莓派广播的 Wi-Fi，以虚拟显示方式呈现并操作这个 Android 系统。它仅用 USB-C 取电加浏览器通信，不接 CAN、不改车、不破保修。由于这是一个完整的 Android 环境，蓝牙键盘/鼠标实际是与树莓派上的 Android 配对（而非与车机配对），从而让特斯拉屏幕"用上"蓝牙键鼠。部署方式为下载镜像、Raspberry Pi Imager 刷卡、开机后车机浏览器连接，商业套装约 289–339 欧元，项目已活跃维护 4 年以上、2026 年初仍在更新，风险较低（无车改、OTA 可回滚）。它是当前兼顾可行性与安全性的最佳折中。

相比之下，teslausb（marcone/teslausb）是模拟 USB 大容量存储设备的树莓派项目，用于自动归档行车记录仪/哨兵录像，纯存储用途，不涉及 HID；freedomev（jnuyens/freedomev）和 Lunars/tesla 是面向已 root 老款 Model S/X（MCU1/Tegra）的脚本集合，依赖既有的 root 权限，README 中均未提供 BlueZ/HID 或键鼠功能，且越狱风险高（失保、可能砖机），其中 freedomev 最后支持固件为 2019.36.2.1，已停滞。学术与安全研究领域，TU Berlin 研究者在 Black Hat 2023 通过 AMD 安全处理器电压故障注入获得 IVI root（"Elon mode"），属硬件级攻击的安全研究，并非可用方案，也不直接开启蓝牙 HID。Android Auto 适配器（如 AAWireless、OpenAuto）是把手机投射到车机，不会给特斯拉屏幕增加蓝牙 HID，与键鼠 hack 无直接关系。

## 三、方案对比与建议

如果目标是想在特斯拉大屏上获得键鼠输入，优先级建议如下：最稳妥的是 USB 有线或 2.4G 接收器键鼠，浏览器场景立刻可用，零风险；若坚持要"蓝牙"体验，Tesla Android 是现实中唯一较成熟的折中，蓝牙外设与车机旁的树莓派配对、再经由浏览器投影到屏幕；越狱/root 类方案风险过高，仅建议用于安全研究和老款 MCU1 折腾，不建议日常使用。需要特别说明的是，没有任何方案能让特斯拉车机本身原生蓝牙配对键鼠——这是底层协议栈和官方策略共同决定的限制。

## 结论

特斯拉车机原生不支持蓝牙鼠标和蓝牙键盘，蓝牙 HID 仅对游戏手柄开放。开源层面，Tesla Android（tesla-android 组织）是目前最值得关注的项目，它通过"车机浏览器 + 树莓派 Android"间接带来蓝牙键鼠能力，而非真正的车机原生支持；teslausb 等则无关键鼠功能；越狱方案风险高且未封装键鼠能力。对普通车主而言，USB 有线/2.4G 键鼠是最现实的选择，蓝牙键鼠在可预见的未来仍非官方支持项。

## 局限

本调研主要基于公开网页、车主论坛与项目仓库文档，部分早期实测机型较老（如 2013 款 MCU1），个别社区维基类来源需交叉印证；特斯拉固件持续更新，未来是否开放 HID 无法完全排除，但截至 2026 年初未见相关迹象。

## 参考来源

1. [USB Keyboard and Mouse | Tesla Motors Club](https://teslamotorsclub.com/tmc/threads/usb-keyboard-and-mouse.14893/)
2. [Bluetooth® Compatibility | 特斯拉中国官方车主手册（Model 3 2017–2023）](https://www.tesla.cn/ownersmanual/2017_2023_model3/en_il/GUID-3D90EA76-8DE3-4808-B7E4-1979EF299F3A.html)
3. [How to Connect a Gaming Controller to Your Tesla | Tesloid](https://tesloid.com/2024/01/24/how-to-connect-a-gaming-controller-to-your-tesla/)
4. [Tesla Intel Atom (MCU 2) and AMD Ryzen (MCU 3): Feature Differences | Not a Tesla App](https://www.notateslaapp.com/news/2417/tesla-intel-atom-mcu-2-and-amd-ryzen-mcu-3-feature-differences-and-how-to-tell-what-you-have)
5. [Tesla Android 安装指南 (Tesdroid)](https://tesdroid.com/pages/install-guide)
6. [Tesla Android · GitHub 组织](https://github.com/tesla-android)
7. [teslausb · GitHub](https://github.com/marcone/teslausb)
8. [freedomev · GitHub](https://github.com/jnuyens/freedomev)
9. [Lunars/tesla (Tesla root information dump) · GitHub](https://github.com/Lunars/tesla)
10. [连接到不常用的 HID 设备 | Chrome 官方文档](https://developer.chrome.google.cn/docs/capabilities/hid)
11. [12 Questions and Answers About Tesla Infotainment Jailbreak](https://www.securityscientist.net/blog/12-questions-and-answers-about-tesla-infotainment-jailbreak/)
12. [TESLA DEVICE D8MINI 无线键盘](https://tesla-electronics.online/en/tesla-device-d8mini-2/)
