import {
  STREAMER_APP_CLIENT_VERSION,
  STREAMER_CAPTURE_PARAM_DEFAULTS,
  STREAMER_CAPTURE_PARAM_FIELDS,
  STREAMER_CAPTURE_TYPES,
  STREAMER_CHOOSE_RESOLUTION_TYPES,
  STREAMER_CHROMA_FORMATS,
  STREAMER_CLIENT_TYPES,
  STREAMER_CONNECT_OPTIONS_FIELDS,
  STREAMER_CONTROLLER_INBOUND_SOAC_TYPES,
  STREAMER_CONTROLLER_OUTBOUND_SOAC_TYPES,
  STREAMER_CONTROLLER_SIGNAL_EVENTS,
  STREAMER_CONTROL_CONNECT_TYPES,
  STREAMER_CONTROL_EVENT_ACK_TIMEOUT_MS,
  STREAMER_CONTROL_EVENT_NAME,
  STREAMER_CONTROL_EVENT_WIRE_ARGUMENT_ORDER,
  STREAMER_CONTROL_EVENT_PAYLOAD_KEYS,
  STREAMER_CONTROL_EVENT_PAYLOAD_TYPES,
  STREAMER_CONTROL_STREAMER_DATA_JSON_KEYS,
  STREAMER_DATA_CHANNEL_LABELS,
  STREAMER_DEFAULT_FEATURE_FLAGS,
  STREAMER_FPS_VALUES,
  STREAMER_INPUT_MANAGER_IME_CONTROL_CODES,
  STREAMER_INPUT_MANAGER_TOUCH_SLOTS,
  STREAMER_MUMU_SYSTEM_KEY_CODES,
  STREAMER_SCREEN_RESOLUTION_FIELDS,
  STREAMER_SEND_TO_ROM_WIRE_FIELDS,
  STREAMER_SIGNAL_SOCKET_EVENTS,
  STREAMER_SOAC_EVENT,
  STREAMER_SOAC_PAYLOAD_KEYS,
  STREAMER_SOAC_TYPES,
  STREAMER_VIDEO_QUALITY_VALUES,
  buildStreamerSignalHeaders,
} from "./streamerProtocol.js";
import { summarizeStreamerRoomConfig } from "./roomConfig.js";
import type { RemoteControlBootstrap, RemoteRoomJoinContext, StreamerRoomConfig } from "./types.js";

export function createRemoteControlBootstrap({
  roomConfig,
  joinContext,
}: {
  roomConfig: StreamerRoomConfig;
  joinContext?: RemoteRoomJoinContext | null;
}): RemoteControlBootstrap | null {
  const roomConfigSummary = summarizeStreamerRoomConfig(roomConfig);
  if (!roomConfigSummary) return null;

  const signalHeaders = buildStreamerSignalHeaders({ token: roomConfig.token });

  return {
    status: "ready",
    strategy: "backend_signal_gateway",
    selectedSignalServer: roomConfig.signalServers[0],
    signalServers: roomConfig.signalServers,
    signalHeaders: {
      ...signalHeaders,
      "X-NRD-AUTH": "<redacted room token>",
    },
    signalEvents: STREAMER_CONTROLLER_SIGNAL_EVENTS,
    soac: {
      event: STREAMER_SOAC_EVENT,
      types: STREAMER_SOAC_TYPES,
      controllerOutboundTypes: STREAMER_CONTROLLER_OUTBOUND_SOAC_TYPES,
      controllerInboundTypes: STREAMER_CONTROLLER_INBOUND_SOAC_TYPES,
      payloadKeys: STREAMER_SOAC_PAYLOAD_KEYS,
    },
    signalControl: {
      socketEvents: STREAMER_SIGNAL_SOCKET_EVENTS,
      event: STREAMER_CONTROL_EVENT_NAME,
      payloadKeys: STREAMER_CONTROL_EVENT_PAYLOAD_KEYS,
      payloadTypes: STREAMER_CONTROL_EVENT_PAYLOAD_TYPES,
      wireArgumentOrder: STREAMER_CONTROL_EVENT_WIRE_ARGUMENT_ORDER,
      streamerDataJsonKeys: STREAMER_CONTROL_STREAMER_DATA_JSON_KEYS,
      ackTimeoutMs: STREAMER_CONTROL_EVENT_ACK_TIMEOUT_MS,
    },
    dataChannels: STREAMER_DATA_CHANNEL_LABELS,
    connectOptions: {
      fields: STREAMER_CONNECT_OPTIONS_FIELDS,
      appClientVersion: STREAMER_APP_CLIENT_VERSION,
      clientTypes: STREAMER_CLIENT_TYPES,
      captureTypes: STREAMER_CAPTURE_TYPES,
      controlConnectTypes: STREAMER_CONTROL_CONNECT_TYPES,
      defaultFeatureFlags: STREAMER_DEFAULT_FEATURE_FLAGS,
      captureParams: {
        fields: STREAMER_CAPTURE_PARAM_FIELDS,
        resolutionFields: STREAMER_SCREEN_RESOLUTION_FIELDS,
        fpsValues: STREAMER_FPS_VALUES,
        videoQualityValues: STREAMER_VIDEO_QUALITY_VALUES,
        chooseResolutionTypes: STREAMER_CHOOSE_RESOLUTION_TYPES,
        chromaFormats: STREAMER_CHROMA_FORMATS,
        staticDefaults: STREAMER_CAPTURE_PARAM_DEFAULTS,
      },
    },
    input: {
      supportedBuilders: ["desktop_mouse", "desktop_keyboard", "ime_text", "ime_control", "mumu_system_key", "mumu_touch"],
      sendToRomWireFields: STREAMER_SEND_TO_ROM_WIRE_FIELDS,
      imeControlCodes: STREAMER_INPUT_MANAGER_IME_CONTROL_CODES,
      mumuSystemKeyCodes: STREAMER_MUMU_SYSTEM_KEY_CODES,
      touchSlots: STREAMER_INPUT_MANAGER_TOUCH_SLOTS,
    },
    joinContext: joinContext ?? undefined,
    roomConfigSummary,
    gatewayRequiredReason: "Upstream signal connect requires custom socket.io headers; the browser cannot set those headers on a WebSocket handshake.",
  };
}
