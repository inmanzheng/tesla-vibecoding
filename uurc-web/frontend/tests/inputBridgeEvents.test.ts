import { describe, expect, it } from "vitest";

import { TRACKPAD_GAIN, applyTrackpadMove, createCenteredCursor } from "../src/remote/inputBridgeEvents.js";

describe("applyTrackpadMove", () => {
  it("applies gain and clamps to the video surface", () => {
    const next = applyTrackpadMove({ x: 100, y: 40 }, 10, -5, { width: 1920, height: 1080 });
    expect(next).toEqual({
      x: 100 + 10 * TRACKPAD_GAIN,
      y: 40 - 5 * TRACKPAD_GAIN,
    });
  });

  it("does not leave the surface", () => {
    expect(applyTrackpadMove({ x: 10, y: 10 }, -80, -80, { width: 800, height: 600 })).toEqual({ x: 0, y: 0 });
    expect(applyTrackpadMove({ x: 790, y: 590 }, 80, 80, { width: 800, height: 600 })).toEqual({ x: 800, y: 600 });
  });

  it("starts from the surface center", () => {
    expect(createCenteredCursor({ width: 1920, height: 1080 })).toEqual({ x: 960, y: 540 });
  });
});
