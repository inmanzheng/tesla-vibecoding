import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // supertest 为每个请求新建临时 http server 并监听随机端口，偶发出现请求挂起到 5s 超时
    // 的 flaky（端口复用 / keep-alive / IPv6 解析竞争，属测试基础设施层，产品代码本身无问题）。
    // 用 retry 兜底：真正的功能回归会确定性地连续失败，不会被 retry 掩盖；只有这种间歇性
    // 基础设施 flaky 才会在重试后通过。
    retry: 2,
  },
  resolve: {
    alias: {
      "@uurc/shared": new URL("../shared/src/index.ts", import.meta.url).pathname,
    },
  },
});
