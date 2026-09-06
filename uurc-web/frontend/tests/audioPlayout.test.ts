import { describe, expect, it } from "vitest";

import { chooseAudioJitterTargetMs } from "../src/remote/browserRemoteSession.js";

describe("chooseAudioJitterTargetMs", () => {
  it("uses a short buffer on a clean link", () => {
    expect(chooseAudioJitterTargetMs({ packetsReceived: 200, packetsLost: 0, concealedSamples: 0 })).toBe(100);
  });

  it("raises the buffer when concealment or loss climbs", () => {
    expect(chooseAudioJitterTargetMs({ packetsReceived: 98, packetsLost: 2, concealedSamples: 0 })).toBe(250);
    expect(chooseAudioJitterTargetMs({ packetsReceived: 80, packetsLost: 20, concealedSamples: 0 })).toBe(400);
    expect(chooseAudioJitterTargetMs({ packetsReceived: 200, packetsLost: 0, concealedSamples: 1200 })).toBe(400);
  });
});
