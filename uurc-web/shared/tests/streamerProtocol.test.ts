import { describe, expect, it } from "vitest";

import {
  STREAMER_DATA_CHANNEL_LABELS,
  STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY,
  STREAMER_DEVICE_CAPABILITY_JSON_KEYS,
  STREAMER_CONTROLLER_SIGNAL_EVENTS,
  STREAMER_CONTROLLER_INBOUND_SOAC_TYPES,
  STREAMER_CONTROLLER_OUTBOUND_SOAC_TYPES,
  STREAMER_CONNECT_OPTIONS_FIELDS,
  STREAMER_CONTROL_CONNECT_TYPES,
  STREAMER_CONTROL_EVENT_ACK_TIMEOUT_MS,
  STREAMER_CONTROL_EVENT_NAME,
  STREAMER_CONTROL_EVENT_WIRE_ARGUMENT_ORDER,
  STREAMER_CONTROL_EVENT_PAYLOAD_KEYS,
  STREAMER_CONTROL_EVENT_PAYLOAD_TYPES,
  STREAMER_CONTROL_RESULT_KEYS,
  STREAMER_CONTROL_STREAMER_DATA_JSON_KEYS,
  STREAMER_CAPTURE_TYPES,
  STREAMER_CAPTURE_CHANGE_TYPES,
  STREAMER_APP_CLIENT_VERSION,
  STREAMER_CAPTURE_PARAM_FIELDS,
  STREAMER_CAPTURE_PARAM_DEFAULTS,
  STREAMER_CHOOSE_RESOLUTION_TYPES,
  STREAMER_CHROMA_FORMATS,
  STREAMER_CLIENT_TYPES,
  STREAMER_DECODER_CAP_FIELDS,
  STREAMER_DECODER_CHROMA_FORMATS,
  STREAMER_DECODER_CODEC_TYPES,
  STREAMER_DISPLAY_INFO_KEYS,
  STREAMER_DEFAULT_FEATURE_FLAGS,
  STREAMER_DEFAULT_SIGNAL_HEADER_VALUES,
  STREAMER_FEATURE_FLAG_FIELDS,
  STREAMER_FPS_VALUES,
  STREAMER_INPUT_MANAGER_IME_CONTROL_CODES,
  STREAMER_MUMU_SYSTEM_KEY_CODES,
  STREAMER_SCREEN_RESOLUTION_FIELDS,
  STREAMER_VIDEO_QUALITY_VALUES,
  STREAMER_ROM_MESSAGE_TYPES,
  STREAMER_ROM_MESSAGE_WIRE_FIELDS,
  STREAMER_SEND_TO_ROM_WIRE_FIELDS,
  STREAMER_SIMPLE_ACTION_WIRE_FIELDS,
  STREAMER_SIMPLE_ACTION_TYPES,
  STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS,
  STREAMER_ROOM_CONFIG_FIELDS,
  STREAMER_MAX_DATA_BUFFER_BYTES,
  STREAMER_CLIENT_VERSION,
  buildStreamerFlagHeader,
  buildStreamerImeControlInputMessage,
  buildStreamerImeTextInputMessage,
  buildStreamerKeyboardInputMessage,
  buildStreamerMacKeyboardInputMessage,
  buildStreamerMacMouseMoveAbsoluteInputMessage,
  buildStreamerMacMouseScrollInputMessage,
  buildStreamerWindowsKeyboardInputMessage,
  buildStreamerTextInputMessage,
  buildStreamerMouseButtonInputMessage,
  buildStreamerMouseMoveAbsoluteInputMessage,
  buildStreamerMouseScrollInputMessage,
  buildStreamerSystemKeyInputMessages,
  buildDefaultStreamerConnectOptionsBase64,
  buildDefaultStreamerDecoderCap,
  createStreamerTouchInputTracker,
  encodeStreamerConnectOptions,
  encodeStreamerControlStringMessage,
  encodeStreamerDecoderCap,
  encodeStreamerEchoRequestMessage,
  encodeStreamerEchoResponseMessage,
  encodeStreamerInputMessage,
  encodeStreamerTextMessage,
  decodeStreamerControlMessage,
  buildStreamerSignalHeaders,
  buildStreamerControlStreamerDataJson,
  STREAMER_INPUT_MANAGER_TOUCH_SLOTS,
  STREAMER_ICE_NETWORK_TYPES,
  STREAMER_MOUSE_BUTTON_CODES,
  STREAMER_DESKTOP_INPUT_EVENT_TYPES,
  STREAMER_SIGNAL_HEADER_KEYS,
  STREAMER_SIGNAL_SOCKET_EVENTS,
  STREAMER_SOAC_EVENT,
  STREAMER_SOAC_MESSAGE_KEYS,
  STREAMER_SOAC_PAYLOAD_KEYS,
  STREAMER_SOAC_TYPES,
  STREAMER_VIDEO_CODEC_CAPABILITY_KEYS,
  STREAMER_VIDEO_CODECS,
  buildStreamerSoacPayload,
  buildStreamerRtcConfiguration,
  buildStreamerBrowserDeviceCapability,
  classifyStreamerConnectionPath,
  isStreamerDataChannelLabel,
  analyzeRemoteSignalReadiness,
  normalizeStreamerSignalControlAck,
  STREAMER_CONTROL_RESULT_ICE_SERVER_KEYS,
} from "../src/streamerProtocol.js";

describe("streamer protocol constants", () => {
  it("captures the data channel labels and SOAC payload surface", () => {
    expect(Object.values(STREAMER_DATA_CHANNEL_LABELS)).toEqual([
      "CONTROL_DATA_CHANNEL",
      "TEXT_DATA_CHANNEL",
      "STREAMER_DATA_CHANNEL",
      "FILE_DATA_CHANNEL",
      "BINARY_DATA_CHANNEL",
    ]);
    expect(STREAMER_SOAC_EVENT).toBe("soac");
    expect(STREAMER_SOAC_TYPES).toEqual(["offer", "answer", "candidate", "restart_ice"]);
    expect(STREAMER_CONTROLLER_OUTBOUND_SOAC_TYPES).toEqual(["offer", "candidate", "restart_ice"]);
    expect(STREAMER_CONTROLLER_INBOUND_SOAC_TYPES).toEqual(["answer", "candidate", "restart_ice"]);
    expect(STREAMER_ICE_NETWORK_TYPES.appAuto).toBe(3);
    expect(STREAMER_SOAC_MESSAGE_KEYS).toEqual(["client_id", "data"]);
    expect(STREAMER_SOAC_PAYLOAD_KEYS).toEqual([
      "type",
      "sdp",
      "ice_id",
      "app_control_id",
      "gzip_sdp",
      "ice_network_type",
      "candidate",
      "sdpMid",
      "sdpMLineIndex",
    ]);
    expect(STREAMER_CONTROLLER_SIGNAL_EVENTS).toEqual([
      "soac",
      "streamer_push",
      "forward_setting",
      "device_capability",
    ]);
  });

  it("captures signal connection headers used by upstream socket.io connect", () => {
    expect(STREAMER_SIGNAL_HEADER_KEYS).toEqual([
      "X-NRD-AUTH",
      "X-NRD-CONTROLLING",
      "streamer_version",
      "streamer_flag",
    ]);
    expect(STREAMER_CLIENT_VERSION).toBe("V3.1.14");
    expect(STREAMER_DEFAULT_SIGNAL_HEADER_VALUES).toEqual({
      "X-NRD-CONTROLLING": "0",
      streamer_version: "V3.1.14",
    });
    expect(buildStreamerFlagHeader({ gzipSdp: true })).toBe('{"sdp_flags":{"gzip_sdp":true}}');
  });

  it("captures controller socket.io event names and control payload keys", () => {
    expect(STREAMER_SIGNAL_SOCKET_EVENTS).toEqual({
      control: "control",
      leave: "leave",
      bmsgPush: "bmsg_push",
      publisherDisconnect: "publisher_disconnect",
    });
    expect(STREAMER_CONTROL_EVENT_NAME).toBe("control");
    expect(STREAMER_CONTROL_EVENT_PAYLOAD_KEYS).toEqual(["app_control_id", "app_data", "streamer_data"]);
    expect(STREAMER_CONTROL_EVENT_PAYLOAD_TYPES).toEqual({
      app_control_id: "string",
      app_data: "binary",
      streamer_data: "string",
    });
    expect(STREAMER_CONTROL_EVENT_WIRE_ARGUMENT_ORDER).toEqual(["app_control_id", "app_data", "streamer_data"]);
    expect(STREAMER_CONTROL_STREAMER_DATA_JSON_KEYS).toEqual(["control_id", "device_capability"]);
    expect(STREAMER_DEVICE_CAPABILITY_JSON_KEYS).toEqual([
      "display_info",
      "video_codec_capability",
      "ice_id",
    ]);
    expect(STREAMER_VIDEO_CODEC_CAPABILITY_KEYS).toEqual([
      "video_codec",
      "width",
      "height",
      "chroma_sampling",
      "bit_depth",
      "codec_impl",
    ]);
    expect(STREAMER_CONTROL_EVENT_ACK_TIMEOUT_MS).toBe(10000);
  });

  it("builds the StreamerControlConfig JSON carried by control streamer_data", () => {
    expect(STREAMER_VIDEO_CODECS).toEqual({
      Unknown: 0,
      H264: 1,
      H265: 2,
      VP8: 3,
      VP9: 4,
      AV1: 5,
    });
    expect(buildStreamerBrowserDeviceCapability()).toEqual(STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY);
    const streamerData = JSON.parse(buildStreamerControlStreamerDataJson({ controlId: "control-1" }));
    expect(Object.keys(streamerData)).toEqual(STREAMER_CONTROL_STREAMER_DATA_JSON_KEYS);
    expect(Object.keys(streamerData.device_capability)).toEqual(STREAMER_DEVICE_CAPABILITY_JSON_KEYS);
    expect(Object.keys(streamerData.device_capability.display_info[0])).toEqual(STREAMER_DISPLAY_INFO_KEYS);
    expect(Object.keys(streamerData.device_capability.video_codec_capability[0])).toEqual(
      STREAMER_VIDEO_CODEC_CAPABILITY_KEYS,
    );
    expect(streamerData).toEqual({
      control_id: "control-1",
      device_capability: {
        display_info: [
          {
            id: 0,
            fps: 60,
            type: 0,
            hdr: -1,
          },
        ],
        video_codec_capability: [
          {
            video_codec: STREAMER_VIDEO_CODECS.H264,
            width: 3840,
            height: 2160,
            chroma_sampling: 1,
            bit_depth: 8,
            codec_impl: -1,
          },
        ],
        ice_id: "",
      },
    });
    expect(
      buildStreamerControlStreamerDataJson({
        controlId: "control-1",
        iceId: "ice-1",
      }),
    ).toContain('"ice_id":"ice-1"');
    expect(
      buildStreamerControlStreamerDataJson({
        controlId: "control-1",
        deviceCapability: {
          video_codec_capability: [{ video_codec: STREAMER_VIDEO_CODECS.VP8 }],
        },
      }),
    ).toBe('{"control_id":"control-1","device_capability":{"video_codec_capability":[{"video_codec":3}]}}');
  });

  it("normalizes App control ack into browser WebRTC ICE configuration", () => {
    expect(STREAMER_CONTROL_RESULT_KEYS).toEqual([
      "client_id",
      "ice_id",
      "iceServers",
      "app_data",
      "streamer_data",
      "app_control_id",
      "controller_platform",
      "force_relay",
      "auto_switch_network",
      "relay_ins_type",
      "force_auto_switch_pkt_loss",
      "force_auto_switch_latency",
      "possible_auto_switch_pkt_loss",
      "possible_auto_switch_latency",
      "code",
      "msg",
    ]);
    expect(STREAMER_CONTROL_RESULT_ICE_SERVER_KEYS).toEqual(["urls", "username", "credential"]);

    const control = normalizeStreamerSignalControlAck([
      "success",
      {
        client_id: "controlled-1",
        ice_id: "ice-1",
        app_control_id: "control-1",
        iceServers: [
          {
            urls: "turn:relay.example:3478?transport=udp",
            username: "turn-user",
            credential: "turn-pass",
          },
          {
            urls: "stun:stun.example:3478",
          },
        ],
        app_data: {
          kind: "binary",
          byteLength: 3,
          base64: "AQID",
        },
        streamer_data: '{"control_id":"control-1"}',
        controller_platform: 4,
        publisher_country: "CN",
        publisher_province: "Zhejiang",
        publisher_city: "Hangzhou",
        publisher_isp: "cmcc",
        publisher_relay_isp: "uu",
        subscriber_country: "CN",
        subscriber_province: "Shanghai",
        subscriber_city: "Shanghai",
        subscriber_isp: "telecom",
        subscriber_relay_isp: "uu",
        force_relay: true,
        auto_switch_network: true,
        relay_ins_type: 2,
        force_auto_switch_pkt_loss: 18,
        force_auto_switch_latency: 160,
        possible_auto_switch_pkt_loss: 8,
        possible_auto_switch_latency: 90,
        code: 0,
        msg: "ok",
      },
    ]);

    expect(control).toEqual({
      ackStatus: "success",
      result: {
        clientId: "controlled-1",
        iceId: "ice-1",
        appControlId: "control-1",
        code: 0,
        msg: "ok",
        appDataBase64: "AQID",
        streamerData: '{"control_id":"control-1"}',
        controllerPlatform: 4,
        forceRelay: true,
        autoSwitchNetwork: true,
        relayInsType: 2,
        forceAutoSwitchPacketLoss: 18,
        forceAutoSwitchLatency: 160,
        possibleAutoSwitchPacketLoss: 8,
        possibleAutoSwitchLatency: 90,
        iceServers: [
          {
            urls: "turn:relay.example:3478?transport=udp",
            username: "turn-user",
            credential: "turn-pass",
          },
          {
            urls: "stun:stun.example:3478",
          },
        ],
        publisher: {
          country: "CN",
          province: "Zhejiang",
          city: "Hangzhou",
          isp: "cmcc",
          relayIsp: "uu",
        },
        subscriber: {
          country: "CN",
          province: "Shanghai",
          city: "Shanghai",
          isp: "telecom",
          relayIsp: "uu",
        },
      },
    });
    expect(buildStreamerRtcConfiguration(control.result)).toEqual({
      iceServers: [
        {
          urls: "turn:relay.example:3478?transport=udp",
          username: "turn-user",
          credential: "turn-pass",
        },
        {
          urls: "stun:stun.example:3478",
        },
      ],
      iceTransportPolicy: "relay",
    });
  });

  it("builds app-compatible signal headers with room token and gzip SDP support", () => {
    expect(buildStreamerSignalHeaders({ token: "room-token" })).toEqual({
      "X-NRD-AUTH": "room-token",
      "X-NRD-CONTROLLING": "0",
      streamer_version: "V3.1.14",
      streamer_flag: '{"sdp_flags":{"gzip_sdp":true}}',
    });
  });

  it("diagnoses a wire-shaped control ack followed by offer and leave as missing controlled answer", () => {
    const diagnostics = analyzeRemoteSignalReadiness({
      signalStatus: {
        status: "connected",
        selectedSignalServer: "wss://signal.example",
        updatedAt: "2026-05-15T00:00:04.000Z",
      },
      events: [
        {
          id: 1,
          direction: "outbound",
          event: "control",
          receivedAt: "2026-05-15T00:00:00.000Z",
          payload: { app_control_id: "control-1" },
        },
        {
          id: 2,
          direction: "inbound",
          event: "control:ack",
          receivedAt: "2026-05-15T00:00:00.050Z",
          payload: ["success", { code: 0 }],
        },
        {
          id: 3,
          direction: "outbound",
          event: "soac",
          receivedAt: "2026-05-15T00:00:00.100Z",
          payload: { client_id: "controlled-1", data: { type: "offer", ice_id: "ice-1" } },
        },
        {
          id: 4,
          direction: "outbound",
          event: "soac",
          receivedAt: "2026-05-15T00:00:00.200Z",
          payload: { client_id: "controlled-1", data: { type: "candidate" } },
        },
        {
          id: 5,
          direction: "inbound",
          event: "leave",
          receivedAt: "2026-05-15T00:00:01.000Z",
          payload: [{ ice_id: "ice-1", "ntes-trace-id": "trace-server-kick-1" }],
        },
      ],
    });

    expect(diagnostics).toMatchObject({
      stage: "offer_sent",
      blocker: "controlled_left_before_answer",
      selectedSignalServer: "wss://signal.example",
      checks: {
        signalGatewayConnected: true,
        controlAckReceived: true,
        offerSent: true,
        answerReceived: false,
        terminalSignalReceived: true,
      },
      counts: {
        outboundControl: 1,
        inboundControlAck: 1,
        outboundOffer: 1,
        outboundCandidate: 1,
        inboundAnswer: 0,
        inboundLeave: 1,
      },
      lastEventAt: "2026-05-15T00:00:01.000Z",
      terminalSignal: {
        event: "leave",
        reason: "server_kick",
        traceId: "trace-server-kick-1",
        iceIdPresent: true,
        iceIdMatchesLastOffer: true,
        receivedAt: "2026-05-15T00:00:01.000Z",
      },
    });
  });

  it("keeps diagnosing the last signal session after the gateway is stopped", () => {
    const diagnostics = analyzeRemoteSignalReadiness({
      signalStatus: {
        status: "closed",
        selectedSignalServer: "wss://signal.example",
        updatedAt: "2026-05-15T00:00:04.000Z",
      },
      events: [
        {
          id: 1,
          direction: "outbound",
          event: "control",
          receivedAt: "2026-05-15T00:00:00.000Z",
          payload: { app_control_id: "control-1" },
        },
        {
          id: 2,
          direction: "inbound",
          event: "control:ack",
          receivedAt: "2026-05-15T00:00:00.050Z",
          payload: ["success", { code: 0 }],
        },
        {
          id: 3,
          direction: "outbound",
          event: "soac",
          receivedAt: "2026-05-15T00:00:00.100Z",
          payload: { client_id: "controlled-1", data: { type: "offer", ice_id: "ice-1" } },
        },
        {
          id: 4,
          direction: "inbound",
          event: "leave",
          receivedAt: "2026-05-15T00:00:01.000Z",
          payload: [{ ice_id: "ice-1", "ntes-trace-id": "trace-server-kick-1" }],
        },
      ],
    });

    expect(diagnostics).toMatchObject({
      stage: "offer_sent",
      blocker: "controlled_left_before_answer",
      checks: {
        signalGatewayConnected: false,
        controlAckReceived: true,
        offerSent: true,
        terminalSignalReceived: true,
      },
      terminalSignal: {
        event: "leave",
        iceIdMatchesLastOffer: true,
      },
    });
  });

  it("treats nonzero control ack ControlResult as a failed control gate", () => {
    const diagnostics = analyzeRemoteSignalReadiness({
      signalStatus: {
        status: "connected",
        selectedSignalServer: "wss://signal.example",
        updatedAt: "2026-05-15T00:00:01.000Z",
      },
      events: [
        {
          id: 1,
          direction: "outbound",
          event: "control",
          receivedAt: "2026-05-15T00:00:00.000Z",
          payload: { app_control_id: "control-1" },
        },
        {
          id: 2,
          direction: "inbound",
          event: "control:ack",
          receivedAt: "2026-05-15T00:00:00.050Z",
          payload: ["fail", { code: 100002, msg: "rejected" }],
        },
      ],
    });

    expect(diagnostics).toMatchObject({
      stage: "gateway_connected",
      blocker: "control_ack_failed",
      checks: {
        controlAckReceived: false,
        offerSent: false,
      },
      counts: {
        inboundControlAck: 1,
        inboundControlAckSuccess: 0,
        inboundControlAckFailure: 1,
      },
      controlAckError: {
        ackStatus: "fail",
        code: 100002,
        message: "rejected",
        protocolError: "protocol_error_2022",
        receivedAt: "2026-05-15T00:00:00.050Z",
      },
    });
  });

  it("diagnoses missing controller-side answer without waiting for controlled-side be-controlled", () => {
    const baseEvents = [
      {
        id: 1,
        direction: "outbound",
        event: "control",
        receivedAt: "2026-05-15T00:00:00.000Z",
        payload: { app_control_id: "control-1" },
      },
      {
        id: 2,
        direction: "inbound",
        event: "control:ack",
        receivedAt: "2026-05-15T00:00:00.050Z",
        payload: ["success", { code: 0 }],
      },
      {
        id: 3,
        direction: "outbound",
        event: "soac",
        receivedAt: "2026-05-15T00:00:00.100Z",
        payload: { client_id: "controlled-1", data: { type: "offer", ice_id: "ice-1" } },
      },
    ] as const;

    const beforeAnswer = analyzeRemoteSignalReadiness({
      signalStatus: { status: "connected", updatedAt: "2026-05-15T00:00:01.000Z" },
      events: baseEvents,
    });
    const afterUnexpectedBeControlled = analyzeRemoteSignalReadiness({
      signalStatus: { status: "connected", updatedAt: "2026-05-15T00:00:02.000Z" },
      events: [
        ...baseEvents,
        {
          id: 4,
          direction: "inbound",
          event: "bmsg_push",
          receivedAt: "2026-05-15T00:00:00.145Z",
          payload: [{ type: "be-controlled", data: { code: 0 } }],
        },
        {
          id: 5,
          direction: "inbound",
          event: "be-controlled",
          receivedAt: "2026-05-15T00:00:00.150Z",
          payload: [{ code: 0 }],
        },
      ],
    });

    expect(beforeAnswer).toMatchObject({
      stage: "offer_sent",
      blocker: "answer_missing",
      checks: {
        beControlledReceived: false,
        answerReceived: false,
      },
      counts: {
        inboundBeControlled: 0,
      },
    });
    expect(afterUnexpectedBeControlled).toMatchObject({
      stage: "offer_sent",
      blocker: "answer_missing",
      checks: {
        beControlledReceived: true,
        answerReceived: false,
      },
      counts: {
        inboundBeControlled: 1,
        inboundBmsgPush: 1,
      },
    });
  });

  it("treats nonzero be-controlled ControlResult as a failed control gate", () => {
    const diagnostics = analyzeRemoteSignalReadiness({
      signalStatus: { status: "connected", updatedAt: "2026-05-15T00:00:02.000Z" },
      events: [
        {
          id: 1,
          direction: "outbound",
          event: "control",
          receivedAt: "2026-05-15T00:00:00.000Z",
          payload: { app_control_id: "control-1" },
        },
        {
          id: 2,
          direction: "inbound",
          event: "control:ack",
          receivedAt: "2026-05-15T00:00:00.050Z",
          payload: ["success", { code: 0 }],
        },
        {
          id: 3,
          direction: "outbound",
          event: "soac",
          receivedAt: "2026-05-15T00:00:00.100Z",
          payload: { client_id: "controlled-1", data: { type: "offer", ice_id: "ice-1" } },
        },
        {
          id: 4,
          direction: "inbound",
          event: "be-controlled",
          receivedAt: "2026-05-15T00:00:00.150Z",
          payload: [{ code: 100001, msg: "occupied" }],
        },
      ],
    });

    expect(diagnostics).toMatchObject({
      stage: "offer_sent",
      blocker: "be_controlled_failed",
      checks: {
        beControlledReceived: false,
        answerReceived: false,
      },
      counts: {
        inboundBeControlled: 1,
        inboundBeControlledSuccess: 0,
        inboundBeControlledFailure: 1,
      },
      beControlledError: {
        code: 100001,
        message: "occupied",
        protocolError: "protocol_error_2021",
        receivedAt: "2026-05-15T00:00:00.150Z",
      },
    });
  });

  it("captures the ConnectOptions wire field tags recovered from the App", () => {
    expect(STREAMER_CONNECT_OPTIONS_FIELDS).toEqual([
      { tag: 1, name: "capture_type", repeated: false },
      { tag: 2, name: "type_value", repeated: false },
      { tag: 3, name: "capture_params", repeated: false },
      { tag: 4, name: "decoder_cap_list", repeated: true },
      { tag: 5, name: "force_virtual_display", repeated: false },
      { tag: 6, name: "virtual_display_modes", repeated: true },
      { tag: 7, name: "virtual_display_init_resolution", repeated: false },
      { tag: 8, name: "client_type", repeated: false },
      { tag: 9, name: "device_id", repeated: false },
      { tag: 10, name: "control_connect_type", repeated: false },
      { tag: 11, name: "feature_flag", repeated: false },
      { tag: 12, name: "client_version", repeated: false },
    ]);
  });

  it("captures confirmed ConnectOptions enums", () => {
    expect(STREAMER_CAPTURE_TYPES).toEqual({
      CT_UNKNOWN: 0,
      CT_DESKTOP: 1,
      CT_WINDOW: 2,
      CT_MUMU: 3,
      CT_HOOK: 4,
      CT_FILETRANSFER: 5,
      CT_SECOND_SCREEN: 6,
      CT_QUICKLAUNCH: 7,
      CT_TERMINAL: 8,
    });
    expect(STREAMER_CONTROL_CONNECT_TYPES).toEqual({
      ControlConnectType_UNKNOWN: 0,
      ControlConnectType_Normal: 1,
      ControlConnectType_Assistance: 2,
    });
    expect(STREAMER_CLIENT_TYPES).toEqual({
      Client_UNSPECIFIED: 0,
      Client_IOS: 1,
      Client_ANDROID: 2,
      Client_WINDOWS: 3,
      Client_MAC: 4,
    });
    expect(STREAMER_APP_CLIENT_VERSION).toBe("4.23.0");
    expect(STREAMER_DECODER_CAP_FIELDS).toEqual([
      { tag: 1, name: "fps", defaultValue: 0 },
      { tag: 2, name: "codec_type", defaultValue: "CodecType_UNKNOWN" },
      { tag: 3, name: "resolution_width", defaultValue: 0 },
      { tag: 4, name: "resolution_height", defaultValue: 0 },
      { tag: 5, name: "chroma_format", defaultValue: "ChromaFormat_UNKNOWN" },
    ]);
    expect(STREAMER_DECODER_CODEC_TYPES).toEqual({
      CodecType_UNKNOWN: 0,
      CodecType_H264: 1,
      CodecType_H265: 2,
    });
    expect(STREAMER_DECODER_CHROMA_FORMATS).toEqual({
      ChromaFormat_UNKNOWN: 0,
      ChromaFormat_420: 1,
      ChromaFormat_422: 2,
      ChromaFormat_444: 3,
      ChromaFormat_400: 4,
    });
    expect(STREAMER_FEATURE_FLAG_FIELDS.map((field) => field.name)).toEqual([
      "ff_capture_setting",
      "ff_simple_action",
      "ff_system_metrics",
      "ff_private_screen",
      "ff_update_acquire",
      "ff_file_transfer_ftp",
      "ff_file_transfer_ftp2",
      "ff_clipboard",
      "ff_qos_stat",
      "ff_mumu_control",
      "ff_virtual_mouse_device",
    ]);
    expect(STREAMER_DEFAULT_FEATURE_FLAGS).toEqual({
      ff_capture_setting: 2,
      ff_simple_action: 1,
      ff_system_metrics: 2,
      ff_private_screen: 2,
      ff_update_acquire: 0,
      ff_file_transfer_ftp: 2,
      ff_file_transfer_ftp2: 2,
      ff_clipboard: 3,
      ff_qos_stat: 0,
      ff_mumu_control: 0,
      ff_virtual_mouse_device: 0,
    });
  });

  it("captures CaptureParams fields, enums, and static defaults", () => {
    expect(STREAMER_CAPTURE_PARAM_FIELDS).toEqual([
      { tag: 1, name: "fps", defaultValue: "FPS_UNKNOWN" },
      { tag: 2, name: "video_quality", defaultValue: "VideoQuality_UNKNOWN" },
      { tag: 3, name: "cursor_capture", defaultValue: false },
      { tag: 4, name: "choose_resolution_type", defaultValue: "ChooseType_UNKNOWN" },
      { tag: 5, name: "local_resolution", defaultValue: null },
      { tag: 6, name: "choose_resolution", defaultValue: null },
      { tag: 7, name: "chroma_format", defaultValue: "ChromaFormat_UNKNOWN" },
      { tag: 8, name: "max_custom_bitrate", defaultValue: 0 },
      { tag: 9, name: "enable_hdr", defaultValue: false },
      { tag: 10, name: "auto_frame_quality", defaultValue: "VideoQuality_UNKNOWN" },
      { tag: 11, name: "fpsCount", defaultValue: 0 },
    ]);
    expect(STREAMER_SCREEN_RESOLUTION_FIELDS).toEqual([
      { tag: 1, name: "width", defaultValue: 0 },
      { tag: 2, name: "height", defaultValue: 0 },
    ]);
    expect(STREAMER_FPS_VALUES).toEqual({
      FPS_UNKNOWN: 0,
      FPS_30: 1,
      FPS_60: 2,
      FPS_90: 3,
      FPS_144: 4,
    });
    expect(STREAMER_VIDEO_QUALITY_VALUES).toEqual({
      VideoQuality_UNKNOWN: 0,
      VideoQuality_Fast: 1,
      VideoQuality_General: 2,
      VideoQuality_HD: 3,
      VideoQuality_Bluray: 4,
      VideoQuality_Auto: 5,
      VideoQuality_Custom: 6,
    });
    expect(STREAMER_CHOOSE_RESOLUTION_TYPES).toEqual({
      ChooseType_UNKNOWN: 0,
      ChooseType_DEFAULT: 1,
      ChooseType_FOLLOW_LOCAL: 2,
      ChooseType_FOLLOW_REMOTE: 3,
      ChooseType_RESOLUTION: 4,
    });
    expect(STREAMER_CHROMA_FORMATS).toEqual({
      ChromaFormat_UNKNOWN: 0,
      ChromaFormat_420: 1,
      ChromaFormat_422: 2,
      ChromaFormat_444: 3,
      ChromaFormat_400: 4,
    });
    expect(STREAMER_CAPTURE_PARAM_DEFAULTS).toEqual({
      fps: "FPS_UNKNOWN",
      videoQuality: "VideoQuality_UNKNOWN",
      cursorCapture: false,
      chooseResolutionType: "ChooseType_UNKNOWN",
      localResolution: null,
      chooseResolution: null,
      chromaFormat: "ChromaFormat_UNKNOWN",
      maxCustomBitrate: 0,
      enableHdr: false,
      autoFrameQuality: "VideoQuality_UNKNOWN",
      fpsCount: 0,
    });
  });

  it("encodes a default App-shaped ConnectOptions payload for browser control", () => {
    const decoderCap = buildDefaultStreamerDecoderCap();
    expect(Array.from(decoderCap)).toEqual([
      0x08, 0x3c,
      0x10, 0x01,
      0x18, 0x80, 0x1e,
      0x20, 0xf0, 0x10,
      0x28, 0x01,
    ]);
    expect(Array.from(encodeStreamerDecoderCap({
      fps: 60,
      codecType: STREAMER_DECODER_CODEC_TYPES.CodecType_H264,
      width: 3840,
      height: 2160,
      chromaFormat: STREAMER_DECODER_CHROMA_FORMATS.ChromaFormat_420,
    }))).toEqual(Array.from(decoderCap));

    const bytes = encodeStreamerConnectOptions({
      deviceId: "web-device-1",
      captureType: STREAMER_CAPTURE_TYPES.CT_DESKTOP,
      typeValue: -1,
      captureParams: {
        fps: STREAMER_FPS_VALUES.FPS_60,
        videoQuality: STREAMER_VIDEO_QUALITY_VALUES.VideoQuality_HD,
        cursorCapture: true,
        chooseResolutionType: STREAMER_CHOOSE_RESOLUTION_TYPES.ChooseType_DEFAULT,
        localResolution: { width: 1920, height: 1080 },
      },
      decoderCapList: [decoderCap],
      virtualDisplayModes: [{ width: 1920, height: 1080, fps: 60 }],
      clientType: STREAMER_CLIENT_TYPES.Client_ANDROID,
      controlConnectType: STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_Normal,
      featureFlags: STREAMER_DEFAULT_FEATURE_FLAGS,
      clientVersion: STREAMER_APP_CLIENT_VERSION,
    });

    expect(Array.from(bytes)).toEqual([
      0x08, 0x01,
      0x10, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01,
      0x1a, 0x10, 0x08, 0x02, 0x10, 0x03, 0x18, 0x01, 0x20, 0x01, 0x2a, 0x06, 0x08, 0x80, 0x0f, 0x10, 0xb8, 0x08,
      0x22, 0x0c, 0x08, 0x3c, 0x10, 0x01, 0x18, 0x80, 0x1e, 0x20, 0xf0, 0x10, 0x28, 0x01,
      0x32, 0x08, 0x08, 0x80, 0x0f, 0x10, 0xb8, 0x08, 0x18, 0x3c,
      0x40, 0x02,
      0x4a, 0x0c, 0x77, 0x65, 0x62, 0x2d, 0x64, 0x65, 0x76, 0x69, 0x63, 0x65, 0x2d, 0x31,
      0x50, 0x01,
      0x5a, 0x0e, 0x08, 0x02, 0x10, 0x01, 0x18, 0x02, 0x20, 0x02, 0x30, 0x02, 0x38, 0x02, 0x40, 0x03,
      0x62, 0x06, 0x34, 0x2e, 0x32, 0x33, 0x2e, 0x30,
    ]);
    expect(buildDefaultStreamerConnectOptionsBase64({ deviceId: "web-device-1" })).toBe(
      "CAEQ////////////ARoQCAIQAxgBIAEqBgiADxC4CCIMCDwQARiAHiDwECgBMggIgA8QuAgYPEACSgx3ZWItZGV2aWNlLTFQAVoOCAIQARgCIAIwAjgCQANiBjQuMjMuMA==",
    );
    expect(
      buildDefaultStreamerConnectOptionsBase64({
        deviceId: "web-device-1",
        controlConnectType: STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_Assistance,
      }),
    ).toBe(
      "CAEQ////////////ARoQCAIQAxgBIAEqBgiADxC4CCIMCDwQARiAHiDwECgBMggIgA8QuAgYPEACSgx3ZWItZGV2aWNlLTFQAloOCAIQARgCIAIwAjgCQANiBjQuMjMuMA==",
    );
  });

  it("omits the ConnectOptions type_value tag by default for normal desktop control", () => {
    const bytes = encodeStreamerConnectOptions({
      deviceId: "web-device-1",
      captureType: STREAMER_CAPTURE_TYPES.CT_DESKTOP,
    });

    expect(Array.from(bytes).slice(0, 4)).toEqual([0x08, 0x01, 0x40, 0x02]);
  });

  it("builds App-shaped SOAC messages for browser SDP and ICE candidates", () => {
    expect(
      buildStreamerSoacPayload({
        type: "offer",
        clientId: "controlled-1",
        appControlId: "control-1",
        iceId: "ice-1",
        sdp: "v=0",
        iceNetworkType: STREAMER_ICE_NETWORK_TYPES.appAuto,
      } as Parameters<typeof buildStreamerSoacPayload>[0] & { iceId: string }),
    ).toEqual({
      client_id: "controlled-1",
      data: {
        type: "offer",
        sdp: "v=0",
        ice_id: "ice-1",
        app_control_id: "control-1",
        ice_network_type: 3,
      },
    });

    expect(
      buildStreamerSoacPayload({
        type: "candidate",
        clientId: "controlled-1",
        appControlId: "control-1",
        iceId: "ice-1",
        iceNetworkType: STREAMER_ICE_NETWORK_TYPES.appAuto,
        candidate: {
          candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host",
          sdpMid: "0",
          sdpMLineIndex: 0,
        },
      } as Parameters<typeof buildStreamerSoacPayload>[0] & { iceId: string }),
    ).toEqual({
      client_id: "controlled-1",
      data: {
        type: "candidate",
        ice_id: "ice-1",
        app_control_id: "control-1",
        candidate: {
          candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host",
          sdpMid: "0",
          sdpMLineIndex: 0,
        },
      },
    });
  });

  it("captures SendToRom wire tags and encodes VINPUT control messages", () => {
    expect(STREAMER_SEND_TO_ROM_WIRE_FIELDS).toEqual({
      envelopeTag: 11,
      inputTypeTag: 1,
      inputMessageTag: 2,
      displayIdTag: 3,
    });
    expect(STREAMER_ROM_MESSAGE_TYPES.RomMsg_VINPUT).toBe(0);

    expect(
      Array.from(
        encodeStreamerInputMessage({
          sequence: 1,
          timestampMs: 2,
          displayId: 5,
          inputMessage: "abc",
        }),
      ),
      ).toEqual([0x08, 0x01, 0x10, 0x02, 0x5a, 0x07, 0x12, 0x03, 0x61, 0x62, 0x63, 0x18, 0x05]);
  });

  it("captures legacy RomMessage tags and encodes Mac keymap input as a raw control string", () => {
    expect(STREAMER_ROM_MESSAGE_WIRE_FIELDS).toEqual({
      envelopeTag: 10,
      nameTag: 1,
      valueTag: 2,
      displayIdTag: 3,
      byteValueTag: 4,
    });

    const payload = encodeStreamerControlStringMessage('{"action":"kbd_press","key":0}');

    expect(Array.from(payload)).toEqual([
      0x7b, 0x22, 0x61, 0x63, 0x74, 0x69, 0x6f, 0x6e, 0x22, 0x3a, 0x22, 0x6b, 0x62, 0x64,
      0x5f, 0x70, 0x72, 0x65, 0x73, 0x73, 0x22, 0x2c, 0x22, 0x6b, 0x65, 0x79, 0x22, 0x3a,
      0x30, 0x7d,
    ]);
  });

  it("encodes text channel SendToRom messages with RomMsg_Text type", () => {
    expect(STREAMER_ROM_MESSAGE_TYPES.RomMsg_Text).toBe(1);
    expect(
      Array.from(
        encodeStreamerTextMessage({
          sequence: 1,
          timestampMs: 2,
          inputMessage: "hi",
        }),
      ),
    ).toEqual([0x08, 0x01, 0x10, 0x02, 0x5a, 0x06, 0x08, 0x01, 0x12, 0x02, 0x68, 0x69]);
  });

  it("encodes App SendEchoRequest simple action heartbeat messages", () => {
    expect(STREAMER_SIMPLE_ACTION_WIRE_FIELDS).toEqual({
      envelopeTag: 3,
      actionTag: 1,
      argsTag: 2,
      featureFlagTag: 4,
    });
    expect(STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST).toBe(0);
    expect(STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS).toEqual({
      useClipboard: 2,
      autoClipboard: 1,
      enableKeyMouse: 2,
      enableGamepad: 2,
      enableTouch: 2,
      enableIme: 2,
      enableDisplayControl: 3,
    });

    expect(
      Array.from(
        encodeStreamerEchoRequestMessage({
          sequence: 1,
          timestampMs: 2,
        }),
      ),
    ).toEqual([
      0x08, 0x01, 0x10, 0x02, 0x1a, 0x1b, 0x12, 0x09, 0x7b, 0x22, 0x73, 0x65, 0x71, 0x22, 0x3a, 0x31,
      0x7d, 0x22, 0x0e, 0x08, 0x02, 0x10, 0x01, 0x18, 0x02, 0x20, 0x02, 0x30, 0x02, 0x38, 0x02,
      0x40, 0x03,
    ]);
  });

  it("encodes and decodes App simple-action echo messages", () => {
    const request = encodeStreamerEchoRequestMessage({
      sequence: 41,
      timestampMs: 4200,
    });
    expect(decodeStreamerControlMessage(request)).toEqual({
      sequence: 41,
      timestampMs: 4200,
      byteLength: request.byteLength,
      topLevelTags: [1, 2, 3],
      simpleAction: {
        action: STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST,
        actionName: "ACTION_TYPE_ECHO_REQUEST",
        args: '{"seq":41}',
        seq: 41,
        featureFlags: STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS,
      },
    });

    expect(
      Array.from(
        encodeStreamerEchoResponseMessage({
          sequence: 7,
          timestampMs: 8,
          responseSequence: 99,
        }),
      ),
    ).toEqual([
      0x08, 0x07, 0x10, 0x08, 0x1a, 0x1e, 0x08, 0x01, 0x12, 0x0a, 0x7b, 0x22, 0x73, 0x65, 0x71,
      0x22, 0x3a, 0x39, 0x39, 0x7d, 0x22, 0x0e, 0x08, 0x02, 0x10, 0x01, 0x18, 0x02, 0x20,
      0x02, 0x30, 0x02, 0x38, 0x02, 0x40, 0x03,
    ]);
    expect(
      decodeStreamerControlMessage(
        encodeStreamerEchoResponseMessage({
          sequence: 7,
          timestampMs: 8,
          responseSequence: 99,
        }),
      ).simpleAction,
    ).toEqual({
      action: STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_RESPONSE,
      actionName: "ACTION_TYPE_ECHO_RESPONSE",
      args: '{"seq":99}',
      seq: 99,
      featureFlags: STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS,
    });
  });

  it("decodes App capture_change and SendToRom control envelopes", () => {
    const captureChange = new Uint8Array([
      0x08, 0x01, 0x10, 0x02, 0x42, 0x0a, 0x08, STREAMER_CAPTURE_CHANGE_TYPES.CT_DESKTOP, 0x10, 0x05,
      0x1a, 0x04, 0x6d, 0x61, 0x69, 0x6e,
    ]);
    expect(decodeStreamerControlMessage(captureChange)).toEqual({
      sequence: 1,
      timestampMs: 2,
      byteLength: captureChange.byteLength,
      topLevelTags: [1, 2, 8],
      captureChange: {
        captureType: STREAMER_CAPTURE_CHANGE_TYPES.CT_DESKTOP,
        captureTypeName: "CT_DESKTOP",
        captureId: 5,
        desc: "main",
      },
    });

    expect(
      decodeStreamerControlMessage(
        encodeStreamerInputMessage({
          sequence: 3,
          timestampMs: 4,
          displayId: 6,
          inputMessage: '{"action":"mouse_press","button":1}',
        }),
      ).sendToRom,
    ).toEqual({
      inputType: STREAMER_ROM_MESSAGE_TYPES.RomMsg_VINPUT,
      inputTypeName: "RomMsg_VINPUT",
      inputMessage: '{"action":"mouse_press","button":1}',
      displayId: 6,
    });
  });

  it("builds recovered InputManagerStub IME and system-key input messages", () => {
    expect(buildStreamerImeTextInputMessage("你好")).toBe("TEXT:你好");
    expect(STREAMER_INPUT_MANAGER_IME_CONTROL_CODES).toEqual({
      BACKSPACE: 14,
      ENTER: 28,
      HIDESELF: 100001,
    });
    expect(buildStreamerImeControlInputMessage("ENTER")).toBe("TEXT_CONTROL:ENTER");

    expect(STREAMER_MUMU_SYSTEM_KEY_CODES).toEqual({
      BACK: 158,
      HOME: 172,
      MENU: 580,
    });
    expect(buildStreamerSystemKeyInputMessages({ displayId: 7, key: "BACK" })).toEqual([
      "7:KBDPR:158:1\n",
      "7:KBDRL:158:0\n",
    ]);
  });

  it("builds recovered desktop InputManager JSON input messages", () => {
    expect(STREAMER_DESKTOP_INPUT_EVENT_TYPES).toMatchObject({
      mousePress: "mouse_press",
      mouseRelease: "mouse_release",
      mouseClick: "mouse_click",
      mouseMoveAbsolute: "mouse_move_absolute",
      mouseScroll: "mouse_scroll",
      keyboardPress: "kbd_press",
      keyboardRelease: "kbd_release",
      keyboardClick: "kbd_click",
    });
    expect(STREAMER_MOUSE_BUTTON_CODES).toMatchObject({
      primary: 1,
      secondary: 2,
      tertiary: 4,
      back: 8,
      forward: 16,
    });

    expect(buildStreamerMouseButtonInputMessage({ action: "mousePress", button: "primary" })).toBe(
      '{"action":"mouse_press","button":1}',
    );
    expect(buildStreamerMouseMoveAbsoluteInputMessage({ absX: 320, absY: 240 })).toBe(
      '{"action":"mouse_move_absolute","abs_x":320,"abs_y":240}',
    );
    expect(buildStreamerMouseScrollInputMessage({ deltaX: 0, deltaY: -120 })).toBe(
      '{"action":"mouse_scroll","delta_x":0,"delta_y":-120}',
    );
    expect(buildStreamerKeyboardInputMessage({ action: "keyboardClick", value: "A" })).toBe(
      '{"action":"kbd_click","key":"A"}',
    );
  });

  it("builds verified Android-to-Mac InputManager output messages", () => {
    expect(
      buildStreamerMacMouseMoveAbsoluteInputMessage({
        absX: 384,
        absY: 1037,
        surfaceWidth: 1920,
        surfaceHeight: 1080,
      }),
    ).toBe('{"action":"mouse_move_absolute","abs_x":0.2,"abs_y":0.9601851851851851}');
    expect(buildStreamerMacMouseScrollInputMessage({ deltaX: 0, deltaY: -120 })).toBe(
      '{"action":"mouse_scroll","delta_x":0,"delta_y":-120}',
    );
    expect(buildStreamerMacKeyboardInputMessage({ action: "keyboardPress", value: 59 })).toBe(
      '{"action":"kbd_press","key":56}',
    );
    expect(buildStreamerMacKeyboardInputMessage({ action: "keyboardRelease", value: 29 })).toBe(
      '{"action":"kbd_release","key":0}',
    );
    expect(buildStreamerMacKeyboardInputMessage({ action: "keyboardPress", value: "A" })).toBe("");
  });

  it("builds verified Android-to-Windows keyboard output messages (VK codes + interrept)", () => {
    // 与真机抓包一致:key 为 Windows VK，且带 interrept 字段。
    // ControlLeft(android 113)→ VK_LCONTROL 162;A(29)→ 65;Backspace(67)→ VK_BACK 8;MetaLeft(117)→ VK_LWIN 91。
    expect(buildStreamerWindowsKeyboardInputMessage({ action: "keyboardPress", value: 113 })).toBe(
      '{"action":"kbd_press","key":162,"interrept":true}',
    );
    expect(buildStreamerWindowsKeyboardInputMessage({ action: "keyboardPress", value: 29 })).toBe(
      '{"action":"kbd_press","key":65,"interrept":true}',
    );
    expect(buildStreamerWindowsKeyboardInputMessage({ action: "keyboardRelease", value: 67 })).toBe(
      '{"action":"kbd_release","key":8,"interrept":true}',
    );
    expect(buildStreamerWindowsKeyboardInputMessage({ action: "keyboardPress", value: 117 })).toBe(
      '{"action":"kbd_press","key":91,"interrept":true}',
    );
    // 未命中(非数字/未映射)返回空串，由发送层静默跳过。
    expect(buildStreamerWindowsKeyboardInputMessage({ action: "keyboardPress", value: "A" })).toBe("");
  });

  it("builds desktop text_input messages for typed characters", () => {
    expect(buildStreamerTextInputMessage("o")).toBe('{"action":"text_input","content":"o"}');
    expect(buildStreamerTextInputMessage("ABC ")).toBe('{"action":"text_input","content":"ABC "}');
    expect(buildStreamerTextInputMessage("你看")).toBe('{"action":"text_input","content":"你看"}');
  });

  it("builds recovered MuMu touch input messages with stable control slots", () => {
    expect(STREAMER_INPUT_MANAGER_TOUCH_SLOTS).toEqual([26, 27, 28, 29, 30, 31]);

    const tracker = createStreamerTouchInputTracker({
      displayId: 7,
      width: 1920,
      height: 1080,
      rotation: 0,
    });

    expect(tracker.start()).toEqual(["7:SLOTMULTIRELEASE:26:27:28:29:30:31\n"]);
    expect(tracker.update([{ id: 10, relX: 0.25, relY: 0.5 }])).toEqual(["7:SLOTMULTIPRESS:26:26:480:540\n"]);
    expect(
      tracker.update([
        { id: 10, relX: 0.3, relY: 0.6 },
        { id: 20, relX: 0.75, relY: 0.25 },
      ]),
    ).toEqual(["7:SLOTMULTIPRESS:26:26:576:648:27:27:1440:270\n"]);
    expect(tracker.update([{ id: 20, relX: 1, relY: 1 }])).toEqual([
      "7:SLOTMULTIRELEASE:26\n",
      "7:SLOTMULTIPRESS:27:27:1920:1080\n",
    ]);
    expect(tracker.end()).toEqual(["7:SLOTMULTIRELEASE:26:27:28:29:30:31\n"]);
  });

  it("matches MuMu touch rotation handling for 90 and 270 degrees", () => {
    expect(
      createStreamerTouchInputTracker({
        displayId: 1,
        width: 1000,
        height: 500,
        rotation: 90,
      }).update([{ id: 1, relX: 0.2, relY: 0.3 }]),
    ).toEqual(["1:SLOTMULTIPRESS:26:26:700:100\n"]);

    expect(
      createStreamerTouchInputTracker({
        displayId: 1,
        width: 1000,
        height: 500,
        rotation: 270,
      }).update([{ id: 1, relX: 0.2, relY: 0.3 }]),
    ).toEqual(["1:SLOTMULTIPRESS:26:26:300:400\n"]);
  });

  it("keeps room config fields explicit", () => {
    expect(STREAMER_ROOM_CONFIG_FIELDS).toEqual([
      "token",
      "signalServers",
      "timeout",
      "signalReconnectDelay",
      "reportToken",
      "reportUrl",
      "reportServerAddress",
    ]);
  });

  it("validates known channel labels and the binary send size limit", () => {
    expect(isStreamerDataChannelLabel("CONTROL_DATA_CHANNEL")).toBe(true);
    expect(isStreamerDataChannelLabel("UNKNOWN_CHANNEL")).toBe(false);
    expect(STREAMER_MAX_DATA_BUFFER_BYTES).toBe(512 * 1024);
  });
});

describe("streamer connection path classification", () => {
  it("prioritizes LAN over candidate type", () => {
    expect(classifyStreamerConnectionPath({ candidateType: "relay", isLanConnection: true })).toBe("lan");
  });

  it("classifies relay and direct candidate paths", () => {
    expect(classifyStreamerConnectionPath({ candidateType: "relay" })).toBe("relay");
    expect(classifyStreamerConnectionPath({ candidateType: "host" })).toBe("p2p");
    expect(classifyStreamerConnectionPath({ candidateType: "srflx" })).toBe("p2p");
    expect(classifyStreamerConnectionPath({ candidateType: "prflx" })).toBe("p2p");
  });

  it("returns unknown when session stats have not arrived", () => {
    expect(classifyStreamerConnectionPath({})).toBe("unknown");
  });
});
