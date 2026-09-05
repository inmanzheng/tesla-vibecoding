// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { toRemoteMousePosition } from "../src/remote/remoteControlUiModel.js";

describe("toRemoteMousePosition", () => {
  it("maps against the active (primary) video, not the first hidden tile", () => {
    const stage = document.createElement("div");
    stage.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 500);

    // 第一个(隐藏)tile 分辨率与显示中的不同，用于暴露“取第一个 video”的偏移 bug。
    const hidden = document.createElement("video");
    defineVideoSize(hidden, 4000, 2000);
    const active = document.createElement("video");
    active.setAttribute("data-active", "true");
    defineVideoSize(active, 1000, 500);
    stage.append(hidden, active);

    const result = toRemoteMousePosition({
      clientX: 500,
      clientY: 250,
      currentTarget: stage as unknown as HTMLDivElement,
    });

    expect(result.surfaceWidth).toBe(1000);
    expect(result.surfaceHeight).toBe(500);
    expect(result.absX).toBe(500);
    expect(result.absY).toBe(250);
  });

  it("falls back to the first video when none is marked active", () => {
    const stage = document.createElement("div");
    stage.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    const only = document.createElement("video");
    defineVideoSize(only, 1600, 1200);
    stage.append(only);

    const result = toRemoteMousePosition({
      clientX: 400,
      clientY: 300,
      currentTarget: stage as unknown as HTMLDivElement,
    });

    expect(result.surfaceWidth).toBe(1600);
    expect(result.surfaceHeight).toBe(1200);
  });
});

function defineVideoSize(video: HTMLVideoElement, width: number, height: number): void {
  Object.defineProperty(video, "videoWidth", { value: width, configurable: true });
  Object.defineProperty(video, "videoHeight", { value: height, configurable: true });
}
