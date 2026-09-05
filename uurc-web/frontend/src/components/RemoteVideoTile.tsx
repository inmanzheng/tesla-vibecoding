import { useEffect, useRef } from "react";

import type { BrowserRemoteVideoElementSample } from "../remote/browserRemoteSession.js";

export function RemoteVideoTile({
  videoId,
  index,
  stream,
  visible,
  onVideoSample,
}: {
  videoId: string;
  index: number;
  stream: MediaStream;
  visible: boolean;
  onVideoSample: (videoId: string, sample: BrowserRemoteVideoElementSample) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    const playResult = video.play();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => undefined);
    }

    const emitSample = (event: string) => {
      onVideoSample(videoId, readVideoElementSample(video, event));
    };
    const eventNames = ["playing", "waiting", "stalled", "suspend", "pause", "ended", "error"] as const;
    const handlers = eventNames.map((eventName) => {
      const handler = () => emitSample(eventName);
      video.addEventListener(eventName, handler);
      return { eventName, handler };
    });
    emitSample("attached");
    const timer = window.setInterval(() => emitSample("sample"), 1000);
    return () => {
      window.clearInterval(timer);
      for (const { eventName, handler } of handlers) {
        video.removeEventListener(eventName, handler);
      }
    };
  }, [onVideoSample, stream, videoId]);

  return (
    <div className={visible ? "remote-video-tile" : "remote-video-tile remote-video-tile-hidden"} aria-hidden={visible ? undefined : true}>
      <video
        ref={videoRef}
        className="remote-video"
        aria-label={visible ? "远控画面视频" : undefined}
        autoPlay
        playsInline
        muted
        tabIndex={visible ? undefined : -1}
        data-track-index={index + 1}
        data-active={visible ? "true" : undefined}
      />
    </div>
  );
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
