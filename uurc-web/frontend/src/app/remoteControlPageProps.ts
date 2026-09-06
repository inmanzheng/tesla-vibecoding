import type { ClipboardEvent, KeyboardEvent, PointerEvent, RefObject, WheelEvent } from "react";

import type {
  RemoteControlBootstrap,
  RemoteSignalGatewayEvent,
  RemoteSignalReadinessDiagnostics,
  RuntimeProfile,
  UuDevice,
  UuParticipantInfo,
} from "@uurc/shared/types";

import type {
  BrowserRemoteSessionState,
  BrowserRemoteVideoElementSample,
} from "../remote/browserRemoteSession.js";
import type { VoiceInputStatus } from "../remote/carVoiceInput.js";
import type { CuaIntent } from "../remote/cuaIntent.js";
import type { CuaTaskResult } from "../remote/inputBridgeClient.js";
import type { RemoteShortcut } from "../remote/remoteShortcuts.js";
import type {
  BusyAction,
  ConnectionRouteMode,
  NextAction,
  RemoteConnectionQuality,
  RemoteStageViewMode,
  RemoteVideoSourceInfo,
  RemoteVideoStream,
  SdpTransportMode,
} from "./remoteControlTypes.js";

export interface RemoteControlPageProps {
  autoSwitchThresholdLabel: string;
  browserIceServers: number;
  browserRemoteState: BrowserRemoteSessionState;
  browserRtcDescription: string;
  browserRtcReady: boolean;
  browserStageLabel: string;
  busy: BusyAction;
  autoReconnectEnabled: boolean;
  autoReconnectLabel: string;
  canDisconnectRemote: boolean;
  canReadLocalClipboard: boolean;
  canReconnectRemote: boolean;
  canSendClipboardText: boolean;
  candidatePairSummary: string;
  clipboardPreviewLabel: string;
  clipboardStatusLabel: string;
  connectionQuality: RemoteConnectionQuality;
  connectionPathLabel: string;
  autoConnect: boolean;
  connectionRouteMode: ConnectionRouteMode;
  controlChannelLabel: string;
  controlChannelState: RTCDataChannelState;
  debugEvents: BrowserRemoteSessionState["debugEvents"];
  deviceNotFound: boolean;
  effectiveConnectionRouteLabel: string;
  error: string;
  forceJoin: boolean;
  hasRemoteVideo: boolean;
  iceControlStatusLabel: string;
  inboundAudioStatsLabel: string;
  inboundVideoStatsLabel: string;
  inputControlActive: boolean;
  inputControlLabel: string;
  inputBridgeId: string;
  inputBridgePanelOpen: boolean;
  inputBridgeUrl: string;
  inputBridgeStatus: string;
  cuaDraft: string;
  cuaPreview: CuaIntent | null;
  cuaStatus: string;
  cuaFrontmost: string;
  cuaAgentOnline: boolean;
  cuaResults: CuaTaskResult[];
  streamQuality: "smooth" | "balanced" | "hd";
  streamQualityLabel: string;
  inputProbeEnabled: boolean;
  onScreenKeyboardOpen: boolean;
  voiceDetail: string;
  voiceStatus: VoiceInputStatus;
  joinModeLabel: string;
  networkSwitchSummary: string;
  nextAction: NextAction;
  normalJoinTakeoverHint: string;
  occupiedBySelfClient: boolean;
  occupyingParticipantLabel: string;
  primaryRemoteVideoActive: boolean;
  primaryRemoteVideoId: string;
  remoteBootstrap: RemoteControlBootstrap | null;
  remoteRecoveryLabel: string;
  remoteShortcutPlatform: string;
  remoteStageRef: RefObject<HTMLDivElement | null>;
  remoteStageFrameRef: RefObject<HTMLDivElement | null>;
  isFullscreen: boolean;
  remoteStageViewMode: RemoteStageViewMode;
  remoteVideoCount: number;
  remoteVideoSources: RemoteVideoSourceInfo[];
  remoteAudioMuted: boolean;
  remoteAudioPlayNonce: number;
  remoteVideoStreams: RemoteVideoStream[];
  stageStatusLabel: string;
  roomDebugPayload: unknown;
  roomJoinFailureMessage: string;
  roomJoinFailureTakeoverHint: string;
  roomJoinModeDebugLabel: string;
  roomReleaseDetail: string;
  roomReleaseLabel: string;
  roomResponseReady: boolean;
  runtimeProfile: RuntimeProfile | null;
  roomRequiresTakeover: boolean;
  sdpTransportLabel: string;
  sdpTransportMode: SdpTransportMode;
  selectedDevice: UuDevice | null;
  selectedDeviceId: string;
  selectedTargetLabel: string;
  selectedDeviceOccupied: boolean;
  selectedParticipants: UuParticipantInfo[];
  selfDeviceBlockedReason: string;
  serviceRoutePolicyLabel: string;
  signalEvents: RemoteSignalGatewayEvent[];
  signalGatewayDisplay: string;
  signalGatewayErrorHint: string;
  signalHeaderSummary: string;
  signalReadiness: RemoteSignalReadinessDiagnostics;
  signalServerIndex: number;
  signalServerOptions: string[];
  textChannelLabel: string;
  textChannelState: RTCDataChannelState;
  unexpectedSignalEventSummary: string;
  videoElementLabel: string;
  videoFlowLabel: string;
  onAutoConnectChange: (enabled: boolean) => void;
  onConnectionRouteModeChange: (mode: ConnectionRouteMode) => void;
  onAutoReconnectEnabledChange: (enabled: boolean) => void;
  onForceJoinChange: (forceJoin: boolean) => void;
  onNextAction: () => void;
  onReconnectRemote: () => void;
  onRemoteStageKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onRemoteStageKeyUp: (event: KeyboardEvent<HTMLDivElement>) => void;
  onRemoteStageBlur: () => void;
  onRemoteStagePaste: (event: ClipboardEvent<HTMLDivElement>) => void;
  onRemoteStagePointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onRemoteStagePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onRemoteStagePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onRemoteStagePointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onRemoteStageWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onRemoteShortcut: (shortcut: RemoteShortcut) => void;
  onRemoteVideoSourceChange: (videoId: string) => void;
  onRemoteVideoSample: (videoId: string, sample: BrowserRemoteVideoElementSample) => void;
  onReadLocalClipboard: () => void;
  onReturnToDevices: () => void;
  onSdpTransportModeChange: (mode: SdpTransportMode) => void;
  onSignalServerIndexChange: (index: number) => void;
  onStartBrowserRemote: () => void;
  onStartSignalGateway: () => void;
  onStageViewModeChange: (mode: RemoteStageViewMode) => void;
  onStopSignalGateway: () => void;
  onSendClipboardText: () => void;
  onToggleInputControl: () => void;
  onToggleFullscreen: () => void;
  onToggleRemoteAudio: () => void;
  onRemoteAudioBlocked: () => void;
  onToggleOnScreenKeyboard: () => void;
  onToggleVoice: () => void;
  onToggleInputBridge: () => void;
  onCuaDraftChange: (value: string) => void;
  onSubmitCua: () => void;
  onRevealCua: () => void;
  onCycleStreamQuality: () => void;
  onOskKeyboardInput: (input: { action: "keyboardPress" | "keyboardRelease"; value: string | number }) => void;
}
