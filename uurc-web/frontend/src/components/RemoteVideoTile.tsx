import { useEffect, useRef } from "react";

import type { BrowserRemoteVideoElementSample } from "../remote/browserRemoteSession.js";

export function RemoteVideoTile({
  videoId,
  index,
  stream,
  visible,
  muted,
  playNonce = 0,
  onVideoSample,
  onUnmuteBlocked,
}: {
  videoId: string;
  index: number;
  stream: MediaStream;
  visible: boolean;
  muted: boolean;
  playNonce?: number;
  onVideoSample: (videoId: string, sample: BrowserRemoteVideoElementSample) => void;
  onUnmuteBlocked?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onVideoSampleRef = useRef(onVideoSample);
  const onUnmuteBlockedRef = useRef(onUnmuteBlocked);
  const mutedRef = useRef(muted);
  onVideoSampleRef.current = onVideoSample;
  onUnmuteBlockedRef.current = onUnmuteBlocked;
  mutedRef.current = muted;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    video.volume = 1;
    video.muted = mutedRef.current;
    const emitSample = (event: string) => {
      onVideoSampleRef.current(videoId, readVideoElementSample(video, event));
    };
    const eventNames = ["playing", "waiting", "stalled", "suspend", "pause", "ended", "error"] as const;
    const handlers = eventNames.map((eventName) => {
      const handler = () => emitSample(eventName);
      video.addEventListener(eventName, handler);
      return { eventName, handler };
    });
    emitSample("attached");
    const timer = window.setInterval(() => emitSample("sample"), 1000);
    playMediaElement(video, mutedRef.current, onUnmuteBlockedRef.current);
    return () => {
      window.clearInterval(timer);
      for (const { eventName, handler } of handlers) {
        video.removeEventListener(eventName, handler);
      }
    };
  }, [stream, videoId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.volume = 1;
    if (!muted) playMediaElement(video, muted, onUnmuteBlockedRef.current);
  }, [muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || playNonce <= 0) return;
    video.volume = 1;
    playMediaElement(video, muted, onUnmuteBlockedRef.current);
  }, [playNonce, muted]);

  return (
    <div className={visible ? "remote-video-tile" : "remote-video-tile remote-video-tile-hidden"} aria-hidden={visible ? undefined : true}>
      <video
        ref={videoRef}
        className="remote-video"
        aria-label={visible ? "远控画面视频" : undefined}
        autoPlay
        playsInline
        muted={muted}
        tabIndex={visible ? undefined : -1}
        data-track-index={index + 1}
        data-active={visible ? "true" : undefined}
      />
    </div>
  );
}

function playMediaElement(
  video: HTMLVideoElement,
  muted: boolean,
  onUnmuteBlocked?: () => void,
): void {
  const playResult = video.play();
  if (playResult && typeof playResult.catch === "function") {
    playResult.catch(() => {
      if (!muted) onUnmuteBlocked?.();
    });
  }
}

function readVideoElementSample(video: HTMLVideoElement, event: string): BrowserRemoteVideoElementSample {
  const quality = typeof video.getVideoPlaybackQuality === "function" ? video.getVideoPlaybackQuality() : null;
  return {
    event,
    currentTimeMs: Math.round(video.currentTime * 1000),
    totalVideoFrames: quality?.totalVideoFrames,
    droppedVideoFrames: quality?.droppedVideoFrames,
    readyState: video.readyState,
    paused: video.paused,
    ended: video.ended,
    width: video.videoWidth,
    height: video.videoHeight,
  };
}
