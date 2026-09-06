// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RemoteVideoTile } from "../src/components/RemoteVideoTile.js";

describe("RemoteVideoTile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a blocked unmute play without flipping the muted attribute itself", async () => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn(() => Promise.reject(new Error("NotAllowedError"))),
    });
    const onUnmuteBlocked = vi.fn();
    const stream = { id: "s1" } as MediaStream;
    const { container } = render(
      <RemoteVideoTile
        videoId="v1"
        index={0}
        stream={stream}
        visible
        muted={false}
        onVideoSample={vi.fn()}
        onUnmuteBlocked={onUnmuteBlocked}
      />,
    );

    await waitFor(() => expect(onUnmuteBlocked).toHaveBeenCalled());
    expect(container.querySelector("video")?.muted).toBe(false);
  });

  it("keeps volume at full gain so Tesla media volume can scale it", () => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn(() => Promise.resolve()),
    });
    const stream = { id: "s1" } as MediaStream;
    const { container } = render(
      <RemoteVideoTile videoId="v1" index={0} stream={stream} visible muted={false} onVideoSample={vi.fn()} />,
    );
    expect(container.querySelector("video")?.volume).toBe(1);
  });
});
