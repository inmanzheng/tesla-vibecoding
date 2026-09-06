export type StreamQualityProfile = "smooth" | "balanced" | "hd";

const FPS_30 = 1;
const FPS_60 = 2;
const QUALITY_FAST = 1;
const QUALITY_GENERAL = 2;
const QUALITY_HD = 3;

export const STREAM_QUALITY_PROFILES: Record<
  StreamQualityProfile,
  {
    label: string;
    fps: number;
    videoQuality: number;
    decoderWidth: number;
    decoderHeight: number;
    decoderFps: number;
  }
> = {
  smooth: {
    label: "流畅",
    fps: FPS_30,
    videoQuality: QUALITY_FAST,
    decoderWidth: 1280,
    decoderHeight: 720,
    decoderFps: 30,
  },
  balanced: {
    label: "均衡",
    fps: FPS_30,
    videoQuality: QUALITY_GENERAL,
    decoderWidth: 1920,
    decoderHeight: 1080,
    decoderFps: 30,
  },
  hd: {
    label: "高清",
    fps: FPS_60,
    videoQuality: QUALITY_HD,
    decoderWidth: 1920,
    decoderHeight: 1080,
    decoderFps: 60,
  },
};

export const DEFAULT_STREAM_QUALITY: StreamQualityProfile = "balanced";

export function nextLowerStreamQuality(profile: StreamQualityProfile): StreamQualityProfile | null {
  if (profile === "hd") return "balanced";
  if (profile === "balanced") return "smooth";
  return null;
}

export function cycleStreamQuality(profile: StreamQualityProfile): StreamQualityProfile {
  if (profile === "smooth") return "balanced";
  if (profile === "balanced") return "hd";
  return "smooth";
}
