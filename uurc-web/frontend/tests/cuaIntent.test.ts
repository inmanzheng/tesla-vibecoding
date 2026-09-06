import { describe, expect, it } from "vitest";

import { describeCuaIntent, mapCuaIntent } from "../src/remote/cuaIntent.js";

describe("mapCuaIntent", () => {
  it("maps first-wave app and shortcut phrases", () => {
    expect(mapCuaIntent("打开微信")).toEqual({
      kind: "launch",
      name: "微信",
      bundleId: "com.tencent.xinWeChat",
    });
    expect(mapCuaIntent("切换到 Safari")).toEqual({
      kind: "activate",
      name: "Safari",
      bundleId: "com.apple.Safari",
    });
    expect(mapCuaIntent("关掉前台窗口")).toEqual({ kind: "shortcut", id: "mac-cmd-w" });
    expect(mapCuaIntent("复制")).toEqual({ kind: "shortcut", id: "mac-cmd-c" });
    expect(mapCuaIntent("输入：你好")).toEqual({ kind: "type", text: "你好" });
  });

  it("rejects app-private actions", () => {
    const intent = mapCuaIntent("给张三发微信");
    expect(intent.kind).toBe("unknown");
    expect(describeCuaIntent(intent)).toContain("还不认识");
  });
});
