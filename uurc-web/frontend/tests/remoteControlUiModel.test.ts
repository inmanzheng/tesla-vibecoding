// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  createPlaybackMediaStream,
  formatInboundAudioStats,
  syncRemotePlaybackStreams,
  toRemoteMousePosition,
} from "../src/remote/remoteControlUiModel.js";

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

  it("maps the same tap to different pixels in contain vs cover", () => {
    const stage = document.createElement("div");
    stage.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 500);
    const video = document.createElement("video");
    video.setAttribute("data-active", "true");
    defineVideoSize(video, 1000, 1000);
    stage.append(video);
    const event = { clientX: 0, clientY: 0, currentTarget: stage as unknown as HTMLDivElement };

    const contain = toRemoteMousePosition(event, { fit: "contain" });
    const cover = toRemoteMousePosition(event, { fit: "cover" });

    expect(contain.absX).toBe(0);
    expect(contain.absY).toBe(0);
    expect(cover.absX).toBe(0);
    expect(cover.absY).toBe(250);
    expect(contain.absY).not.toBe(cover.absY);
  });

  it("still hits the picture center after a fullscreen-sized contain stage", () => {
    const stage = document.createElement("div");
    stage.getBoundingClientRect = () => new DOMRect(0, 0, 2000, 1000);
    const video = document.createElement("video");
    video.setAttribute("data-active", "true");
    defineVideoSize(video, 1000, 500);
    stage.append(video);

    const result = toRemoteMousePosition(
      { clientX: 1000, clientY: 500, currentTarget: stage as unknown as HTMLDivElement },
      { fit: "contain" },
    );
    expect(result.absX).toBe(500);
    expect(result.absY).toBe(250);
  });

  it("keeps remote audio tracks on the playback stream instead of video-only", () => {
    class FakeMediaStream {
      constructor(private readonly tracks: MediaStreamTrack[] = []) {}
      addTrack(track: MediaStreamTrack) {
        this.tracks.push(track);
      }
      getTracks() {
        return [...this.tracks];
      }
      getVideoTracks() {
        return this.tracks.filter((track) => track.kind === "video");
      }
      getAudioTracks() {
        return this.tracks.filter((track) => track.kind === "audio");
      }
    }
    vi.stubGlobal("MediaStream", FakeMediaStream);

    const videoTrack = { id: "v1", kind: "video" } as MediaStreamTrack;
    const audioTrack = { id: "a1", kind: "audio" } as MediaStreamTrack;
    const stream = createPlaybackMediaStream(videoTrack, [audioTrack]);
    expect(stream.getVideoTracks().map((track) => track.id)).toEqual(["v1"]);
    expect(stream.getAudioTracks().map((track) => track.id)).toEqual(["a1"]);
  });

  it("reuses the same MediaStream when track ids do not change and only hangs audio on the primary", () => {
    class FakeMediaStream {
      constructor(private readonly tracks: MediaStreamTrack[] = []) {}
      addTrack(track: MediaStreamTrack) {
        this.tracks.push(track);
      }
      removeTrack(track: MediaStreamTrack) {
        const index = this.tracks.indexOf(track);
        if (index >= 0) this.tracks.splice(index, 1);
      }
      getTracks() {
        return [...this.tracks];
      }
      getVideoTracks() {
        return this.tracks.filter((track) => track.kind === "video");
      }
      getAudioTracks() {
        return this.tracks.filter((track) => track.kind === "audio");
      }
    }
    vi.stubGlobal("MediaStream", FakeMediaStream);

    const videoA = { id: "v1", kind: "video" } as MediaStreamTrack;
    const videoB = { id: "v2", kind: "video" } as MediaStreamTrack;
    const audio = { id: "a1", kind: "audio" } as MediaStreamTrack;
    const first = syncRemotePlaybackStreams([], [videoA, videoB], [audio], "v1");
    const second = syncRemotePlaybackStreams(first, [videoA, videoB], [audio], "v1");

    expect(second[0]?.stream).toBe(first[0]?.stream);
    expect(second[1]?.stream).toBe(first[1]?.stream);
    expect(second[0]?.stream.getAudioTracks().map((track) => track.id)).toEqual(["a1"]);
    expect(second[1]?.stream.getAudioTracks()).toEqual([]);

    const switched = syncRemotePlaybackStreams(second, [videoA, videoB], [audio], "v2");
    expect(switched[0]?.stream).toBe(second[0]?.stream);
    expect(switched[0]?.stream.getAudioTracks()).toEqual([]);
    expect(switched[1]?.stream.getAudioTracks().map((track) => track.id)).toEqual(["a1"]);
  });

  it("formats inbound audio stats for the diagnostics row", () => {
    expect(formatInboundAudioStats(undefined)).toBe("-");
    expect(
      formatInboundAudioStats({
        codecMimeType: "audio/opus",
        packetsReceived: 80,
        packetsLost: 2,
        concealedSamples: 12,
      }),
    ).toContain("lost=2");
  });
});

function defineVideoSize(video: HTMLVideoElement, width: number, height: number): void {
  Object.defineProperty(video, "videoWidth", { value: width, configurable: true });
  Object.defineProperty(video, "videoHeight", { value: height, configurable: true });
}
