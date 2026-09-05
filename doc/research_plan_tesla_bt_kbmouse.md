# 研究计划：特斯拉车机对蓝牙鼠标/键盘的支持及开源方案

## 研究目标
1. 确认特斯拉车机（MCU / 信息娱乐系统）原生是否支持蓝牙鼠标和蓝牙键盘（蓝牙 HID profile）。
2. 调研是否有开源项目、第三方固件或 hack 方案能够让特斯拉车机支持蓝牙键鼠。
3. 总结可行的替代/绕行方案（如浏览器、外接设备等）。

## 查询类型
广度优先（Breadth-first）：可拆分为两个相对独立的子问题（原生支持情况 + 开源/第三方方案）。

## 子任务分配
- 子代理 1（原生支持情况）：调研特斯拉各代车机（MCU1/Intel Atom、MCU2/Intel、AMD Ryzen MCU3）的蓝牙能力，原生 HID 支持、浏览器、配对限制。
- 子代理 2（开源/第三方方案）：调研 Tesla Android、teslausb、蓝牙键鼠 hack、浏览器方案等开源项目。

## 信息检索策略
- 主要使用 web_search / web_fetch 从互联网获取最新信息。
- 时间范围：近 3-5 年为主，覆盖 2021-2026，兼顾早期 MCU1 资料。
- 关键词：tesla bluetooth keyboard mouse, tesla HID profile, tesla infotainment bluetooth mouse, Tesla Android keyboard, tesla web browser bluetooth, tesla MCU3 bluetooth。
- 中文检索：特斯拉 车机 蓝牙 键盘 鼠标 支持 开源。
- 注：wechat-article-search skill 在当前环境不可用，故以 web 检索为主，必要时补充中文论坛/社区讨论。

## 预期产出
一份结构化研究报告，含原生支持结论、开源方案清单（项目名、链接、原理、可用性）、以及实操建议。
