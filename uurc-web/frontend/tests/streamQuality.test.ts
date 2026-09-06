import { describe, expect, it } from "vitest";

import { cycleStreamQuality, nextLowerStreamQuality } from "../src/remote/streamQuality.js";

describe("stream quality profiles", () => {
  it("steps down when the network is poor", () => {
    expect(nextLowerStreamQuality("hd")).toBe("balanced");
    expect(nextLowerStreamQuality("balanced")).toBe("smooth");
    expect(nextLowerStreamQuality("smooth")).toBeNull();
  });

  it("cycles the toolbar control", () => {
    expect(cycleStreamQuality("smooth")).toBe("balanced");
    expect(cycleStreamQuality("balanced")).toBe("hd");
    expect(cycleStreamQuality("hd")).toBe("smooth");
  });
});
