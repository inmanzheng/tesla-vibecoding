import type { KeyboardEvent } from "react";

import type { StreamerMouseButtonKind, StreamerSignalControlResult } from "@uurc/shared/streamerProtocol";
import type {
  RemoteControlBootstrap,
  RemoteSignalGatewayEvent,
  RemoteSignalGatewayStatus,
  RemoteAssistanceControlMode,
  RoomJoinResult,
} from "@uurc/shared/types";

import type {
  BusyAction,
  NextAction,
  RemoteConnectionQuality,
  RemoteConnectionQualityMetric,
  RoomJoinContext,
  RemoteVideoSamplesById,
  RemoteVideoStream,
} from "../app/remoteControlTypes.js";
import { toAndroidKeyCodeFromDomEvent } from "./androidKeyCodes.js";
import type { BrowserRemoteSessionState, BrowserRemoteVideoElementSample } from "./browserRemoteSession.js";

export function createIdleBrowserRemoteState(): BrowserRemoteSessionState {
  return {
    appControlId: "",
    connectionPath: "unknown",
    dataChannels: {},
    debugEvents: [],
    remoteTrackCount: 0,
    stage: "idle",
  };
}

export function selectPrimaryRemoteVideoId(videos: RemoteVideoStream[], samplesById: RemoteVideoSamplesById): string {
  if (videos.length === 0) return "";

  const scoredVideos = videos
    .map((video, index) => ({
      id: video.id,
      index,
      score: scoreRemoteVideoSample(samplesById[video.id]),
    }))
    .filter((video) => video.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  return scoredVideos[0]?.id ?? videos[0].id;
}

export function resolvePrimaryRemoteVideoId(
  videos: RemoteVideoStream[],
  samplesById: RemoteVideoSamplesById,
  selectedVideoId: string,
): string {
  if (selectedVideoId && videos.some((video) => video.id === selectedVideoId)) return selectedVideoId;
  return selectPrimaryRemoteVideoId(videos, samplesById);
}

function scoreRemoteVideoSample(sample: BrowserRemoteVideoElementSample | undefined): number {
  if (!sample) return 0;
  const area = positiveNumber(sample.width) * positiveNumber(sample.height);
  return (
    area +
    positiveNumber(sample.totalVideoFrames) * 1000 +
    positiveNumber(sample.currentTimeMs) +
    positiveNumber(sample.readyState) * 100
  );
}

function positiveNumber(value: number | undefined): number {
  return value && value > 0 ? value : 0;
}

export function getNextAction(input: {
  busy: BusyAction;
  browserConnectionRecoverable: boolean;
  browserStage: BrowserRemoteSessionState["stage"];
  controlChannelState: RTCDataChannelState;
  deviceTotal: number;
  inputControlActive: boolean;
  loggedIn: boolean;
  forceJoin: boolean;
  roomJoinedForSelectedDevice: boolean;
  remoteAssistanceTarget: boolean;
  roomRequiresTakeover: boolean;
  selectedDeviceId: string;
  selectedDeviceIsCurrentAuthDevice: boolean;
  signalGatewayErrored: boolean;
  signalGatewayMatchesRoom: boolean;
}): NextAction {
  if (!input.loggedIn) {
    return {
      label: "登录账号",
      detail: "",
      disabled: input.busy !== null,
    };
  }
  if (!input.selectedDeviceId || (!input.remoteAssistanceTarget && input.deviceTotal === 0)) {
    return {
      label: "刷新设备",
      detail: "",
      disabled: input.busy !== null,
    };
  }
  if (input.selectedDeviceIsCurrentAuthDevice) {
    return {
      label: "更换账号",
      detail: "不能控制本机",
      disabled: true,
    };
  }
  if (input.roomRequiresTakeover) {
    return {
      label: "接管并开始连接",
      detail: "",
      disabled: input.busy !== null,
    };
  }
  if (!input.roomJoinedForSelectedDevice) {
    return {
      label: input.forceJoin ? "接管并开始连接" : "开始连接",
      detail: "",
      disabled: input.busy !== null,
    };
  }
  if (input.signalGatewayErrored) {
    return {
      label: "重新开始连接",
      detail: "",
      disabled: input.busy !== null,
    };
  }
  if (!input.signalGatewayMatchesRoom) {
    return {
      label: "开始连接",
      detail: "",
      disabled: input.busy !== null,
    };
  }
  if (input.browserStage === "idle") {
    return {
      label: "开始连接",
      detail: "",
      disabled: input.busy !== null,
    };
  }
  if (input.browserStage !== "connected") {
    return {
      label: "等待画面",
      detail: "",
      disabled: true,
    };
  }
  if (input.browserConnectionRecoverable) {
    return {
      label: "重新连接",
      detail: "",
      disabled: input.busy !== null,
    };
  }
  if (!input.inputControlActive && input.controlChannelState === "open") {
    return {
      label: "开始操作",
      detail: "",
      disabled: input.busy !== null,
    };
  }
  return {
    label: "远控进行中",
    detail: "",
    disabled: true,
  };
}

export function formatSignalGatewayErrorHint(status: RemoteSignalGatewayStatus | null): string {
  if (status?.status !== "error") return "";
  const detail = status.error?.trim() || "未知错误";
  return `连接失败：${detail}`;
}

export function summarizeSwitchNetworkNotify(events: readonly RemoteSignalGatewayEvent[]): string {
  let latest: RemoteSignalGatewayEvent | undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.direction === "inbound" && event.event === "switch_network_notify") {
      latest = event;
      break;
    }
  }
  if (!latest) return "-";

  const payloads = Array.isArray(latest.payload) ? latest.payload : [latest.payload];
  const record = payloads.map(asRecord).find((item) => item !== null);
  if (!record) return "received";

  const transportType = numberValue(record.transport_type);
  const attemptSwitchType = numberValue(record.attempt_switch_type);
  return [
    transportType === undefined ? null : `transport=${transportType}`,
    attemptSwitchType === undefined ? null : `attempt=${attemptSwitchType}`,
    `ice=${typeof record.ice_id === "string" && record.ice_id.length > 0 ? "yes" : "no"}`,
  ]
    .filter((item): item is string => item !== null)
    .join(" · ");
}

const KNOWN_SIGNAL_EVENT_NAMES = new Set([
  "control",
  "control:ack",
  "soac",
  "soac:ack",
  "answer",
  "candidate",
  "restart_ice",
  "switch_network_notify",
  "leave",
  "left",
  "released",
  "bmsg_push",
  "publisher_disconnect",
  "be-controlled",
  "streamer_push",
  "forward_setting",
]);

export function summarizeUnexpectedSignalEvents(
  events: readonly RemoteSignalGatewayEvent[],
  appDirectEvents: readonly string[],
): string {
  const known = new Set([...KNOWN_SIGNAL_EVENT_NAMES, ...appDirectEvents]);
  const names: string[] = [];

  for (const event of events) {
    if (event.direction !== "inbound") continue;
    if (known.has(event.event)) continue;
    if (names.includes(event.event)) continue;
    names.push(event.event);
  }

  if (names.length === 0) return "-";
  const visible = names.slice(0, 6);
  const suffix = names.length > visible.length ? ` +${names.length - visible.length}` : "";
  return `${visible.join(", ")}${suffix}`;
}

export function formatAutoSwitchThresholds(result: StreamerSignalControlResult | null | undefined): string {
  if (!result) return "-";
  const possible = [
    formatMetricNumber("pkt", result.possibleAutoSwitchPacketLoss),
    formatMetricNumber("latency", result.possibleAutoSwitchLatency),
  ].filter((item): item is string => item !== null);
  const force = [
    formatMetricNumber("pkt", result.forceAutoSwitchPacketLoss),
    formatMetricNumber("latency", result.forceAutoSwitchLatency),
  ].filter((item): item is string => item !== null);
  const parts = [
    possible.length > 0 ? `possible ${possible.join(" ")}` : null,
    force.length > 0 ? `force ${force.join(" ")}` : null,
  ].filter((item): item is string => item !== null);

  return parts.length > 0 ? parts.join(" / ") : "-";
}

function formatMetricNumber(label: string, value: number | undefined): string | null {
  return value === undefined ? null : `${label}=${value}`;
}

export function createSingleTrackMediaStream(track: MediaStreamTrack): MediaStream {
  try {
    return new MediaStream([track]);
  } catch {
    const stream = new MediaStream();
    stream.addTrack(track);
    return stream;
  }
}

export function createAppControlId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `web-${Date.now().toString(36)}`;
}

export function summarizeRoomJoinUpstream(upstream: unknown) {
  const record = asRecord(upstream);
  const body = asRecord(record?.body);
  const data = asRecord(body?.data);
  return {
    status: numberValue(record?.status),
    statusText: stringValue(record?.statusText),
    headers: safeHeaderKeys(record?.headers),
    body: {
      code: numberValue(body?.code),
      msg: stringValue(body?.msg),
      dataKeys: Array.isArray(body?.dataKeys)
        ? body.dataKeys.filter((item): item is string => typeof item === "string")
        : data
          ? Object.keys(data)
          : undefined,
    },
  };
}

export function getRoomJoinFailureMessage(result: RoomJoinResult | null): string {
  if (!result || result.roomConfigSummary) return "";
  const upstreamCode = result.upstream.body.code;
  const upstreamStatus = result.upstream.status;
  const refused = (typeof upstreamCode === "number" && upstreamCode !== 0) || upstreamStatus >= 400;
  if (!refused) return "";
  const reason = result.upstream.body.msg?.trim() || (typeof upstreamCode === "number" ? `code ${upstreamCode}` : `HTTP ${upstreamStatus}`);
  return `服务端拒绝加入房间：${reason}`;
}

export function getRoomJoinFailureTakeoverHint(result: RoomJoinResult | null, forceJoin: boolean): string {
  if (forceJoin || !result || result.roomConfigSummary) return "";
  return result.upstream.body.code === 2002 ? "选择接管后重试。" : "";
}

function safeHeaderKeys(value: unknown): string[] {
  const record = asRecord(value);
  return record ? Object.keys(record) : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export type RemotePointerLike = {
  clientX: number;
  clientY: number;
  currentTarget: HTMLDivElement;
};

export function toRemoteMousePosition(event: RemotePointerLike): { absX: number; absY: number; surfaceWidth: number; surfaceHeight: number } {
  const stageRect = event.currentTarget.getBoundingClientRect();
  // 多路视频时优先取当前显示(primary)的画面元素；否则会按非显示画面的分辨率换算，导致鼠标坐标偏移。
  const video =
    event.currentTarget.querySelector<HTMLVideoElement>('video[data-active="true"]') ??
    event.currentTarget.querySelector("video");
  const videoWidth = video?.videoWidth || Math.round(stageRect.width);
  const videoHeight = video?.videoHeight || Math.round(stageRect.height);
  const rendered = getContainedMediaRect(stageRect, videoWidth, videoHeight);
  const relX = clamp((event.clientX - rendered.left) / rendered.width, 0, 1);
  const relY = clamp((event.clientY - rendered.top) / rendered.height, 0, 1);
  return {
    absX: Math.round(relX * videoWidth),
    absY: Math.round(relY * videoHeight),
    surfaceWidth: videoWidth,
    surfaceHeight: videoHeight,
  };
}

export function toRemoteMouseButton(button: number): StreamerMouseButtonKind {
  if (button === 1) return "tertiary";
  if (button === 2) return "secondary";
  if (button === 3) return "back";
  if (button === 4) return "forward";
  return "primary";
}

function getContainedMediaRect(container: DOMRect, mediaWidth: number, mediaHeight: number): DOMRect {
  const mediaRatio = mediaWidth / mediaHeight;
  const containerRatio = container.width / container.height;
  if (containerRatio > mediaRatio) {
    const width = container.height * mediaRatio;
    return new DOMRect(container.left + (container.width - width) / 2, container.top, width, container.height);
  }

  const height = container.width / mediaRatio;
  return new DOMRect(container.left, container.top + (container.height - height) / 2, container.width, height);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toRemoteKeyValue(event: KeyboardEvent): string | number {
  return toAndroidKeyCodeFromDomEvent(event);
}

export function formatRoomJoinContext(context: RemoteControlBootstrap["joinContext"]): string {
  if (!context) return "-";
  if (context.kind === "remote_assistance") {
    const mode = formatRemoteAssistanceMode(context.controlMode);
    return mode ? `远程协助 · ${mode}` : "远程协助";
  }
  return context.forceJoin ? "接管加入" : "普通加入";
}

export function formatRoomReleaseState(
  status: RemoteSignalGatewayStatus | null,
  activeRemoteSession: boolean,
  selectedDeviceOccupied: boolean,
  context?: RoomJoinContext | RemoteControlBootstrap["joinContext"] | null,
): string {
  if (status?.roomClear) {
    const code = status.roomClear.body.code;
    const action = context?.kind === "remote_assistance" ? "已取消协助" : "已释放房间";
    return code === undefined || code === 0 ? action : `释放返回 ${code}`;
  }
  if (status?.roomClearError) return "释放失败";
  if (activeRemoteSession) return "控制中";
  if (selectedDeviceOccupied) return "已有控制端";
  return "-";
}

export function formatRoomReleaseDetail(
  status: RemoteSignalGatewayStatus | null,
  context?: RoomJoinContext | RemoteControlBootstrap["joinContext"] | null,
): string {
  if (status?.roomClearError) return status.roomClearError;
  if (status?.roomClear) {
    const message = status.roomClear.body.msg ? ` · ${status.roomClear.body.msg}` : "";
    const endpoint = context?.kind === "remote_assistance"
      ? "/api/v2/room/share/cancel_remote_assist"
      : "/api/v1/room/clear/by_device";
    return `${endpoint}${message}`;
  }
  return context?.kind === "remote_assistance" ? "断开连接时取消本次远程协助" : "断开连接时释放 UU 房间占用";
}

export function formatRemoteAssistanceMode(mode: RemoteAssistanceControlMode | null | undefined): string {
  switch (mode) {
    case "by_password":
      return "验证码";
    case "by_confirmation":
      return "对方确认";
    case "password_confirmation":
      return "验证码或确认";
    default:
      return "";
  }
}

export function formatInboundVideoStats(stats: BrowserRemoteSessionState["inboundVideo"]): string {
  if (!stats) return "-";
  const parts = [
    stats.codecMimeType,
    stats.decoderImplementation,
    stats.framesDecoded === undefined ? null : `decoded=${stats.framesDecoded}`,
    stats.framesReceived === undefined ? null : `received=${stats.framesReceived}`,
    stats.packetsReceived === undefined ? null : `pkt=${stats.packetsReceived}`,
    stats.bytesReceived === undefined ? null : `bytes=${stats.bytesReceived}`,
    stats.freezeCount === undefined ? null : `freeze=${stats.freezeCount}`,
    stats.pliCount === undefined ? null : `pli=${stats.pliCount}`,
    stats.nackCount === undefined ? null : `nack=${stats.nackCount}`,
    stats.framesPerSecond === undefined ? null : `fps=${stats.framesPerSecond}`,
    stats.frameWidth && stats.frameHeight ? `${stats.frameWidth}x${stats.frameHeight}` : null,
  ].filter((item): item is string => item !== null);
  return parts.length > 0 ? parts.join(" · ") : "-";
}

export function formatVideoFlow(state: BrowserRemoteSessionState): string {
  const flow = state.videoFlow;
  if (!flow) return state.stage === "connected" ? "连接中" : "-";
  switch (flow.status) {
    case "receiving":
      return "播放中";
    case "decode_stalled":
      return "画面卡顿";
    case "transport_stalled":
      return "画面中断";
    case "waiting":
    default:
      return "等待画面";
  }
}

export function formatVideoElement(sample: BrowserRemoteSessionState["videoElement"]): string {
  if (!sample) return "-";
  const parts = [
    sample.event,
    `${sample.currentTimeMs}ms`,
    sample.totalVideoFrames === undefined ? null : `frames=${sample.totalVideoFrames}`,
    sample.droppedVideoFrames === undefined ? null : `drop=${sample.droppedVideoFrames}`,
    sample.readyState === undefined ? null : `ready=${sample.readyState}`,
    sample.width && sample.height ? `${sample.width}x${sample.height}` : null,
  ].filter((item): item is string => item !== null);
  return parts.join(" · ");
}

export function getRemoteConnectionQuality(input: {
  state: BrowserRemoteSessionState;
  controlChannelState: RTCDataChannelState;
  inputControlActive: boolean;
  textChannelState: RTCDataChannelState;
  connectionPathLabel: string;
}): RemoteConnectionQuality {
  const metrics = buildConnectionQualityMetrics(input);
  if (input.state.stage !== "connected") {
    return {
      state: "pending",
      title: "等待连接",
      detail: "",
      metrics,
    };
  }
  if (input.controlChannelState === "closed") {
    return {
      state: "bad",
      title: "控制连接断开",
      detail: "",
      metrics,
    };
  }
  if (input.state.videoFlow?.status === "transport_stalled") {
    return {
      state: "bad",
      title: "画面中断",
      detail: input.state.videoFlow.detail,
      metrics,
    };
  }
  if (input.state.videoFlow?.status === "decode_stalled") {
    return {
      state: "warn",
      title: "画面卡顿",
      detail: input.state.videoFlow.detail,
      metrics,
    };
  }
  if (input.state.videoFlow?.status === "receiving") {
    return {
      state: "good",
      title: "连接正常",
      detail: "",
      metrics,
    };
  }
  return {
    state: "pending",
    title: "等待质量采样",
    detail: "",
    metrics,
  };
}

function buildConnectionQualityMetrics(input: {
  state: BrowserRemoteSessionState;
  controlChannelState: RTCDataChannelState;
  inputControlActive: boolean;
  textChannelState: RTCDataChannelState;
  connectionPathLabel: string;
}): RemoteConnectionQualityMetric[] {
  const baseMetrics: RemoteConnectionQualityMetric[] = [
    { label: "路径", value: input.connectionPathLabel },
    { label: "画面", value: formatVideoFlow(input.state) },
    { label: "输入", value: formatInputControlState(input.inputControlActive, input.controlChannelState) },
    { label: "控制通道", value: formatDataChannelState(input.controlChannelState) },
    { label: "文本通道", value: formatDataChannelState(input.textChannelState) },
  ];

  if (input.state.stage !== "connected") return baseMetrics;

  const stats = input.state.inboundVideo;
  const pair = input.state.selectedCandidatePair;
  const flowDelta = input.state.videoFlow?.delta;
  const videoElement = input.state.videoElement;
  const receiveBitrateBps = bitrateFromBytes(flowDelta?.bytesReceived ?? flowDelta?.candidateBytesReceived, flowDelta?.sampleIntervalMs);
  const decodedFps = fpsFromDelta(flowDelta?.framesDecoded ?? flowDelta?.framesReceived ?? flowDelta?.videoElementFrames, flowDelta?.sampleIntervalMs);

  return [
    ...baseMetrics,
    { label: "帧率", value: formatFps(stats?.framesPerSecond ?? decodedFps) ?? "采样中" },
    { label: "接收码率", value: formatBitrate(receiveBitrateBps) ?? "采样中" },
    { label: "延迟", value: formatSecondsAsMs(pair?.currentRoundTripTime) ?? "采样中" },
    {
      label: "分辨率",
      value: formatResolution(stats?.frameWidth ?? videoElement?.width, stats?.frameHeight ?? videoElement?.height) ?? "暂无",
    },
    { label: "丢帧", value: formatFrameCount(stats?.framesDropped ?? videoElement?.droppedVideoFrames) ?? "0 帧" },
    { label: "冻结", value: formatCount(stats?.freezeCount) ?? "0 次" },
    { label: "丢包", value: formatPacketLoss(stats?.packetsLost, stats?.packetsReceived) ?? "0 包 · 0%" },
    { label: "抖动缓冲", value: formatAverageSecondsAsMs(stats?.jitterBufferDelay, stats?.jitterBufferEmittedCount) ?? "采样中" },
    { label: "下行余量", value: formatBitrate(pair?.availableIncomingBitrate) ?? "暂无" },
    { label: "上行余量", value: formatBitrate(pair?.availableOutgoingBitrate) ?? "暂无" },
    { label: "解码器", value: stats?.decoderImplementation ?? "暂无" },
  ];
}

function formatInputControlState(inputControlActive: boolean, controlChannelState: RTCDataChannelState): string {
  if (inputControlActive) return "控制中";
  if (controlChannelState === "open") return "仅查看";
  return "未连接";
}

function bitrateFromBytes(bytes: number | undefined, intervalMs: number | undefined): number | undefined {
  if (bytes === undefined || bytes <= 0 || intervalMs === undefined || intervalMs <= 0) return undefined;
  return (bytes * 8 * 1000) / intervalMs;
}

function fpsFromDelta(frames: number | undefined, intervalMs: number | undefined): number | undefined {
  if (frames === undefined || frames <= 0 || intervalMs === undefined || intervalMs <= 0) return undefined;
  return (frames * 1000) / intervalMs;
}

function formatFps(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return null;
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} fps`;
}

function formatBitrate(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return null;
  if (value >= 1_000_000) return `${formatCompactNumber(value / 1_000_000)} Mbps`;
  return `${formatCompactNumber(value / 1_000)} Kbps`;
}

function formatSecondsAsMs(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value) || value < 0) return null;
  return `${Math.round(value * 1000)} ms`;
}

function formatAverageSecondsAsMs(totalSeconds: number | undefined, count: number | undefined): string | null {
  if (totalSeconds === undefined || count === undefined || totalSeconds < 0 || count <= 0) return null;
  return `${Math.round((totalSeconds / count) * 1000)} ms`;
}

function formatResolution(width: number | undefined, height: number | undefined): string | null {
  if (!width || !height) return null;
  return `${Math.round(width)}x${Math.round(height)}`;
}

function formatFrameCount(value: number | undefined): string | null {
  if (value === undefined || value < 0) return null;
  return `${Math.round(value)} 帧`;
}

function formatCount(value: number | undefined): string | null {
  if (value === undefined || value < 0) return null;
  return `${Math.round(value)} 次`;
}

function formatPacketLoss(lost: number | undefined, received: number | undefined): string | null {
  if (lost === undefined || lost < 0) return null;
  if (received === undefined || received < 0 || received + lost <= 0) return `${Math.round(lost)} 包`;
  const ratio = (lost / (received + lost)) * 100;
  return `${Math.round(lost)} 包 · ${formatCompactNumber(ratio)}%`;
}

function formatCompactNumber(value: number): string {
  const rounded = value >= 10 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatSignalGatewayState(state: string): string {
  switch (state) {
    case "idle":
      return "未启动";
    case "connecting":
      return "连接中";
    case "connected":
      return "已连接";
    case "closed":
      return "已关闭";
    case "error":
      return "异常";
    default:
      return state;
  }
}

export function formatBrowserRemoteStage(stage: BrowserRemoteSessionState["stage"]): string {
  switch (stage) {
    case "idle":
      return "未启动";
    case "controlled":
      return "已授权";
    case "offered":
      return "协商中";
    case "connected":
      return "已连接";
    default:
      return stage;
  }
}

export function formatConnectionPath(path: BrowserRemoteSessionState["connectionPath"]): string {
  switch (path) {
    case "lan":
      return "局域网";
    case "p2p":
      return "直连";
    case "relay":
      return "UU 中转";
    case "unknown":
    default:
      return "未知";
  }
}

export function formatDataChannelState(state: string): string {
  switch (state) {
    case "connecting":
      return "连接中";
    case "open":
      return "已打开";
    case "closing":
      return "关闭中";
    case "closed":
      return "已关闭";
    default:
      return state;
  }
}
