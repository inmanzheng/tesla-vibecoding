import { describe, expect, it, vi } from "vitest";

import type {
  RemoteSignalControlRequest,
  RemoteSignalControlResult,
  RemoteSignalGatewayEvent,
  RemoteSignalSoacRequest,
  RemoteSignalSoacResult,
} from "@uurc/shared/types";
import {
  STREAMER_DATA_CHANNEL_LABELS,
  STREAMER_CAPTURE_CHANGE_TYPES,
  STREAMER_ICE_NETWORK_TYPES,
  buildStreamerMouseButtonInputMessage,
  buildStreamerKeyboardInputMessage,
  buildStreamerMacKeyboardInputMessage,
  buildStreamerMacMouseMoveAbsoluteInputMessage,
  buildStreamerMacMouseScrollInputMessage,
  buildStreamerWindowsKeyboardInputMessage,
  buildStreamerTextInputMessage,
  buildStreamerMouseMoveAbsoluteInputMessage,
  buildStreamerMouseScrollInputMessage,
  encodeStreamerEchoResponseMessage,
  encodeStreamerEchoRequestMessage,
  encodeStreamerInputMessage,
  encodeStreamerTextMessage,
} from "@uurc/shared/streamerProtocol";
import { BrowserRemoteSession } from "../src/remote/browserRemoteSession.js";

describe("BrowserRemoteSession", () => {
  it("starts the app-compatible browser WebRTC offer flow from a signal control ack", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      getVideoCodecPreferences: () => [
        {
          mimeType: "video/H264",
          clockRate: 90000,
          sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
        },
      ],
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });

    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: '{"control_id":"control-1","device_capability":{}}',
    });

    expect(api.controlCalls).toEqual([
      {
        appControlId: "control-1",
        appDataBase64: "Cg==",
        streamerData: '{"control_id":"control-1","device_capability":{}}',
      },
    ]);
    expect(peer.configuration).toEqual({
      iceServers: [
        {
          urls: "turn:relay.example:3478?transport=udp",
          username: "turn-user",
          credential: "turn-pass",
        },
      ],
      iceTransportPolicy: "all",
    });
    expect(peer.transceivers).toEqual([
      { kind: "video", direction: "recvonly" },
      { kind: "video", direction: "recvonly" },
      { kind: "video", direction: "recvonly" },
      { kind: "video", direction: "recvonly" },
      { kind: "video", direction: "recvonly" },
      { kind: "audio", direction: "recvonly" },
    ]);
    expect(peer.videoCodecPreferenceCalls).toHaveLength(5);
    expect(peer.videoCodecPreferenceCalls).toEqual(
      Array.from({ length: 5 }, () => [
        {
          mimeType: "video/H264",
          clockRate: 90000,
          sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
        },
      ]),
    );
    expect(peer.dataChannels).toEqual([
      "CONTROL_DATA_CHANNEL",
      "TEXT_DATA_CHANNEL",
      "STREAMER_DATA_CHANNEL",
      "FILE_DATA_CHANNEL",
      "BINARY_DATA_CHANNEL",
    ]);
    expect(api.soacCalls).toEqual([
      {
        type: "offer",
        clientId: "controlled-1",
        iceId: "ice-1",
        appControlId: "control-1",
        sdp: "v=0 browser offer",
        gzipSdp: true,
        iceNetworkType: 3,
      },
    ]);
    peer.onicecandidate?.({
      candidate: {
        toJSON: () => ({ candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host", sdpMid: "0", sdpMLineIndex: 0 }),
      },
    } as RTCPeerConnectionIceEvent);
    await Promise.resolve();
    expect(api.soacCalls.at(-1)).toMatchObject({
      type: "candidate",
      clientId: "controlled-1",
      iceId: "ice-1",
      appControlId: "control-1",
      candidate: {
        candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host",
      },
    });
    expect(api.soacCalls.at(-1)).not.toHaveProperty("iceNetworkType");
  });

  it("keeps H264 RTX codec preferences so lossy relay links can negotiate retransmission", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    vi.stubGlobal("RTCRtpSender", {
      getCapabilities: () => ({
        codecs: [
          { mimeType: "video/VP8", clockRate: 90000 },
          { mimeType: "video/rtx", clockRate: 90000 },
          {
            mimeType: "video/H264",
            clockRate: 90000,
            sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
          },
        ],
      }),
    });
    try {
      const session = new BrowserRemoteSession({
        api,
        createPeerConnection: (configuration) => {
          peer.configuration = configuration;
          return peer;
        },
      });

      await session.start({
        appControlId: "control-1",
        appDataBase64: "Cg==",
        streamerData: "{}",
      });

      expect(peer.videoCodecPreferenceCalls[0].map((codec) => codec.mimeType)).toEqual([
        "video/H264",
        "video/rtx",
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stops before creating WebRTC when signal control ack returns a nonzero ControlResult", async () => {
    const soacCalls: RemoteSignalSoacRequest[] = [];
    const api = {
      async sendSignalControl(input: RemoteSignalControlRequest): Promise<RemoteSignalControlResult> {
        expect(input.appControlId).toBe("control-1");
        return {
          event: "control",
          ackStatus: "fail",
          ack: ["fail", { code: 100002, msg: "rejected" }],
          control: {
            ackStatus: "fail",
            result: {
              clientId: "controlled-1",
              iceId: "ice-1",
              code: 100002,
              msg: "rejected",
              iceServers: [],
            },
          },
          emittedAt: "2026-05-15T00:00:00.000Z",
          ackReceivedAt: "2026-05-15T00:00:00.100Z",
        };
      },
      async sendSignalSoac(input: RemoteSignalSoacRequest): Promise<RemoteSignalSoacResult> {
        soacCalls.push(input);
        return { event: "soac", payload: input, emittedAt: "2026-05-15T00:00:00.200Z" };
      },
    };
    let peerCreated = false;
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: () => {
        peerCreated = true;
        return new FakePeerConnection();
      },
    });

    await expect(
      session.start({
        appControlId: "control-1",
        appDataBase64: "Cg==",
        streamerData: "{}",
      }),
    ).rejects.toThrow("signal control ack failed: ack=fail code=100002 protocol=protocol_error_2022 msg=rejected");

    expect(peerCreated).toBe(false);
    expect(soacCalls).toHaveLength(0);
  });

  it("uses the control ack ICE id for SOAC even when a pre-control fallback id is present", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });

    await session.start({
      appControlId: "control-1",
      iceId: "web-ice-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    expect(session.getState()).toMatchObject({
      iceId: "ice-1",
      controlResultIceId: "ice-1",
      controlIceIdMatch: false,
    });
    expect(api.soacCalls[0]).toMatchObject({
      type: "offer",
      iceId: "ice-1",
    });
  });

  it("queues inbound SOAC candidates until the answer is applied", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    await session.applySignalEvents([
      soacEvent(1, {
        client_id: "controlled-1",
        data: {
          type: "candidate",
          candidate: {
            candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host",
            sdpMid: "0",
            sdpMLineIndex: 0,
          },
        },
      }),
      soacEvent(2, {
        client_id: "controlled-1",
        data: {
          type: "answer",
          sdp: "v=0 controlled answer",
        },
      }),
    ]);

    expect(peer.remoteDescriptions).toEqual([{ type: "answer", sdp: "v=0 controlled answer" }]);
    expect(peer.candidates).toEqual([
      {
        candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
      },
    ]);
  });

  it("ignores inbound SOAC answers that do not belong to the current App control session", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      iceId: "ice-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    await session.applySignalEvents([
      soacEvent(1, {
        client_id: "controlled-2",
        data: {
          type: "answer",
          app_control_id: "control-2",
          ice_id: "ice-2",
          sdp: "v=0 stale answer",
        },
      }),
      soacEvent(2, {
        client_id: "controlled-1",
        data: {
          type: "answer",
          app_control_id: "control-1",
          ice_id: "ice-1",
          sdp: "v=0 controlled answer",
        },
      }),
    ]);

    expect(peer.remoteDescriptions).toEqual([{ type: "answer", sdp: "v=0 controlled answer" }]);
    expect(session.getState().stage).toBe("connected");
  });

  it("ignores inbound SOAC candidates scoped to another ICE connection", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      iceId: "ice-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    await session.applySignalEvents([
      soacEvent(1, {
        client_id: "controlled-1",
        data: {
          type: "answer",
          app_control_id: "control-1",
          ice_id: "ice-1",
          sdp: "v=0 controlled answer",
        },
      }),
      soacEvent(2, {
        client_id: "controlled-1",
        data: {
          type: "candidate",
          app_control_id: "control-1",
          ice_id: "ice-2",
          candidate: {
            candidate: "candidate:stale 1 udp 1 192.168.1.9 10001 typ host",
            sdpMid: "0",
            sdpMLineIndex: 0,
          },
        },
      }),
      soacEvent(3, {
        client_id: "controlled-1",
        data: {
          type: "candidate",
          app_control_id: "control-1",
          ice_id: "ice-1",
          candidate: {
            candidate: "candidate:current 1 udp 1 192.168.1.2 10000 typ host",
            sdpMid: "0",
            sdpMLineIndex: 0,
          },
        },
      }),
    ]);

    expect(peer.candidates).toEqual([
      {
        candidate: "candidate:current 1 udp 1 192.168.1.2 10000 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
      },
    ]);
  });

  it("does not reapply already processed SOAC events during polling", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    const events = [
      soacEvent(2, {
        client_id: "controlled-1",
        data: {
          type: "answer",
          sdp: "v=0 controlled answer",
        },
      }),
    ];

    await session.applySignalEvents(events);
    await session.applySignalEvents(events);

    expect(peer.remoteDescriptions).toEqual([{ type: "answer", sdp: "v=0 controlled answer" }]);
  });

  it("applies inbound SOAC restart_ice as an App remote answer", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
      gzipSdp: false,
    });

    await session.applySignalEvents([
      soacEvent(2, {
        client_id: "controlled-1",
        data: {
          type: "restart_ice",
          sdp: "v=0 controlled restart answer",
          ice_network_type: STREAMER_ICE_NETWORK_TYPES.v4Wlan,
        },
      }),
    ]);

    expect(peer.restartIceCalls).toBe(0);
    expect(peer.createOfferCalls).toEqual([undefined]);
    expect(peer.remoteDescriptions).toEqual([{ type: "answer", sdp: "v=0 controlled restart answer" }]);
    expect(api.soacCalls).toHaveLength(1);
    expect(session.getState().stage).toBe("connected");
  });

  it("ignores stale SOAC answers when the peer is no longer in have-local-offer", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    await session.applySignalEvents([
      soacEvent(1, {
        client_id: "controlled-1",
        data: { type: "answer", sdp: "v=0 controlled answer" },
      }),
    ]);
    expect(peer.signalingState).toBe("stable");

    await session.applySignalEvents([
      soacEvent(2, {
        client_id: "controlled-1",
        data: { type: "answer", sdp: "v=0 stale controlled answer" },
      }),
    ]);

    expect(peer.remoteDescriptions).toEqual([{ type: "answer", sdp: "v=0 controlled answer" }]);
    const debugEvents = session.getState().debugEvents;
    expect(
      debugEvents.some(
        (event) => event.kind === "signal" && event.summary === "忽略状态不匹配的 SOAC answer",
      ),
    ).toBe(true);
  });

  it("records a debug event when setRemoteDescription rejects instead of throwing", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    peer.setRemoteDescriptionShouldThrow = true;

    await expect(
      session.applySignalEvents([
        soacEvent(1, {
          client_id: "controlled-1",
          data: { type: "answer", sdp: "v=0 controlled answer" },
        }),
      ]),
    ).resolves.toBeUndefined();

    expect(peer.remoteDescriptions).toEqual([]);
    expect(session.getState().stage).not.toBe("connected");
    const debugEvents = session.getState().debugEvents;
    expect(
      debugEvents.some(
        (event) => event.kind === "signal" && event.summary === "应用 SOAC answer 失败",
      ),
    ).toBe(true);
  });

  it("handles App switch_network_notify by sending one restart_ice offer for the same ICE connection", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    const events = [
      {
        id: 10,
        direction: "inbound",
        event: "switch_network_notify",
        receivedAt: "2026-05-15T00:00:01.000Z",
        payload: [{ transport_type: STREAMER_ICE_NETWORK_TYPES.appAuto, attempt_switch_type: 2, ice_id: "ice-1" }],
      } satisfies RemoteSignalGatewayEvent,
    ];

    await session.applySignalEvents(events);
    await session.applySignalEvents(events);

    expect(peer.restartIceCalls).toBe(1);
    expect(peer.createOfferCalls).toEqual([undefined, { iceRestart: true }]);
    expect(api.soacCalls.at(-1)).toMatchObject({
      type: "restart_ice",
      clientId: "controlled-1",
      iceId: "ice-1",
      appControlId: "control-1",
      sdp: "v=0 browser restart offer",
      gzipSdp: true,
      iceNetworkType: STREAMER_ICE_NETWORK_TYPES.appAuto,
    });
  });

  it("can send a plain-SDP offer for streamer compatibility testing", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });

    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
      gzipSdp: false,
    });

    expect(api.controlCalls).toEqual([
      {
        appControlId: "control-1",
        appDataBase64: "Cg==",
        streamerData: "{}",
      },
    ]);
    expect(api.soacCalls[0]).toMatchObject({
      type: "offer",
      sdp: "v=0 browser offer",
      gzipSdp: false,
    });
  });

  it("can force the browser WebRTC path through relay candidates", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });

    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
      forceRelay: true,
    });

    expect(peer.configuration).toMatchObject({
      iceTransportPolicy: "relay",
    });
  });

  it("keeps automatic browser ICE gathering open when the signal service recommends relay", async () => {
    const api = new FakeRemoteApi({
      forceRelay: true,
    });
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });

    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    expect(peer.configuration).toMatchObject({
      iceTransportPolicy: "all",
    });
    expect(session.getState().controlResult?.forceRelay).toBe(true);
  });

  it("still lets the operator explicitly force relay candidates", async () => {
    const api = new FakeRemoteApi({
      forceRelay: true,
    });
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });

    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
      forceRelay: true,
    });

    expect(peer.configuration).toMatchObject({
      iceTransportPolicy: "relay",
    });
  });

  it("publishes remote media streams and sends text data on the App text channel", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    let remoteStream: MediaStream | null = null;
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 1234,
      onRemoteStream: (stream) => {
        remoteStream = stream;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    const stream = { id: "stream-1" } as MediaStream;
    peer.ontrack?.({ streams: [stream], track: {} } as RTCTrackEvent);
    session.sendTextData(" hello ");

    expect(remoteStream).toBe(stream);
    expect(session.getState().remoteTrackCount).toBe(1);
    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.text)?.sent).toEqual([
      encodeStreamerTextMessage({
        sequence: 1,
        timestampMs: 1,
        inputMessage: "hello",
      }),
    ]);
  });

  it("sends desktop mouse input on the App control channel", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 2000,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.sendMouseClick({ absX: 320, absY: 240, button: "primary" });
    session.sendMouseScroll({ deltaX: 0, deltaY: -120 });

    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 2,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 320, absY: 240 }),
      }),
      encodeStreamerInputMessage({
        sequence: 2,
        timestampMs: 2,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mousePress", button: "primary" }),
      }),
      encodeStreamerInputMessage({
        sequence: 3,
        timestampMs: 2,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mouseRelease", button: "primary" }),
      }),
      encodeStreamerInputMessage({
        sequence: 4,
        timestampMs: 2,
        inputMessage: buildStreamerMouseScrollInputMessage({ deltaX: 0, deltaY: -120 }),
      }),
    ]);
    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "data_send",
          summary: "发送控制输入",
          details: expect.objectContaining({
            label: STREAMER_DATA_CHANNEL_LABELS.control,
            sequence: 1,
            input: {
              action: "mouse_move_absolute",
              abs_x: 320,
              abs_y: 240,
            },
          }),
        }),
        expect.objectContaining({
          kind: "data_send",
          summary: "发送控制输入",
          details: expect.objectContaining({
            label: STREAMER_DATA_CHANNEL_LABELS.control,
            sequence: 4,
            input: {
              action: "mouse_scroll",
              delta_x: 0,
              delta_y: -120,
            },
          }),
        }),
      ]),
    );
  });

  it("starts the App echo heartbeat on the control data channel and stops it when closed", async () => {
    vi.useFakeTimers();
    try {
      const api = new FakeRemoteApi();
      const peer = new FakePeerConnection();
      let now = 4100;
      const session = new BrowserRemoteSession({
        api,
        createPeerConnection: (configuration) => {
          peer.configuration = configuration;
          return peer;
        },
        now: () => now,
      });
      await session.start({
        appControlId: "control-1",
        appDataBase64: "Cg==",
        streamerData: "{}",
      });

      const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control);
      control?.onopen?.(new Event("open"));

      expect(control?.sent).toEqual([
        encodeStreamerEchoRequestMessage({
          sequence: 1,
          timestampMs: 4,
        }),
      ]);

      now = 4200;
      vi.advanceTimersByTime(100);

      expect(control?.sent).toEqual([
        encodeStreamerEchoRequestMessage({
          sequence: 1,
          timestampMs: 4,
        }),
        encodeStreamerEchoRequestMessage({
          sequence: 2,
          timestampMs: 4,
        }),
      ]);

      control?.close();
      now = 4500;
      vi.advanceTimersByTime(500);

      expect(control?.sent).toHaveLength(2);
      expect(session.getState().debugEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "data_send",
            summary: "发送控制心跳",
            details: expect.objectContaining({
              label: STREAMER_DATA_CHANNEL_LABELS.control,
              sequence: 1,
              intervalMs: 100,
            }),
          }),
        ]),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("records throttled inbound data channel messages for control debugging", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    let now = 5000;
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => now,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control);
    control?.emitMessage(new Uint8Array([1, 2, 3]).buffer);
    now = 6000;
    control?.emitMessage(new Uint8Array([4, 5]).buffer);
    now = 36000;
    control?.emitMessage("ok");

    const receiveEvents = session.getState().debugEvents.filter((event) => event.kind === "data_recv");
    expect(receiveEvents).toEqual([
      expect.objectContaining({
        summary: "收到 CONTROL_DATA_CHANNEL 数据",
        details: {
          label: STREAMER_DATA_CHANNEL_LABELS.control,
          payloadType: "arraybuffer",
          byteLength: 3,
          hexPrefix: "01 02 03",
          decoded: {
            topLevelTags: [],
          },
        },
      }),
      expect.objectContaining({
        summary: "收到 CONTROL_DATA_CHANNEL 数据",
        details: {
          label: STREAMER_DATA_CHANNEL_LABELS.control,
          payloadType: "string",
          charLength: 2,
        },
      }),
    ]);
  });

  it("replies to App control EchoRequest messages like the desktop controller", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    let now = 7000;
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => now,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control);
    now = 7100;
    control?.emitMessage(
      encodeStreamerEchoRequestMessage({
        sequence: 41,
        timestampMs: 7050,
      }).buffer,
    );

    expect(control?.sent).toEqual([
      encodeStreamerEchoResponseMessage({
        sequence: 1,
        timestampMs: 7,
        responseSequence: 41,
      }),
    ]);
    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "data_send",
          summary: "回复控制 EchoRequest",
          details: expect.objectContaining({
            label: STREAMER_DATA_CHANNEL_LABELS.control,
            sequence: 1,
            responseSequence: 41,
          }),
        }),
        expect.objectContaining({
          kind: "data_recv",
          summary: "收到 CONTROL_DATA_CHANNEL 数据",
          details: expect.objectContaining({
            decoded: expect.objectContaining({
              sequence: 41,
              simpleAction: expect.objectContaining({
                actionName: "ACTION_TYPE_ECHO_REQUEST",
                seq: 41,
              }),
            }),
          }),
        }),
      ]),
    );
  });

  it("sends pointer drag input as separate App mouse messages", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 2500,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.sendMouseMove({ absX: 120, absY: 80 });
    session.sendMouseButton({ action: "mousePress", button: "primary" });
    session.sendMouseMove({ absX: 520, absY: 340 });
    session.sendMouseButton({ action: "mouseRelease", button: "primary" });

    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 2,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 120, absY: 80 }),
      }),
      encodeStreamerInputMessage({
        sequence: 2,
        timestampMs: 2,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mousePress", button: "primary" }),
      }),
      encodeStreamerInputMessage({
        sequence: 3,
        timestampMs: 2,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 520, absY: 340 }),
      }),
      encodeStreamerInputMessage({
        sequence: 4,
        timestampMs: 2,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mouseRelease", button: "primary" }),
      }),
    ]);
  });

  it("transforms browser input through the Mac server keymap shape for Mac targets", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 2600,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
      targetPlatform: 4,
    });

    session.sendMouseMove({ absX: 384, absY: 1037, surfaceWidth: 1920, surfaceHeight: 1080 });
    session.sendKeyboardInput({ action: "keyboardPress", value: 59 });
    session.sendMouseScroll({ deltaX: 0, deltaY: -120 });

    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      buildStreamerMacMouseMoveAbsoluteInputMessage({
        absX: 384,
        absY: 1037,
        surfaceWidth: 1920,
        surfaceHeight: 1080,
      }),
      buildStreamerMacKeyboardInputMessage({ action: "keyboardPress", value: 59 }),
      buildStreamerMacMouseScrollInputMessage({ deltaX: 0, deltaY: -120 }),
    ]);
  });

  it("transforms browser input through the Windows server keymap shape for Windows targets", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 2600,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
      targetPlatform: 1,
    });

    session.sendMouseMove({ absX: 384, absY: 1037, surfaceWidth: 1920, surfaceHeight: 1080 });
    session.sendKeyboardInput({ action: "keyboardPress", value: 113 });
    session.sendTextInput("o");
    session.sendMouseScroll({ deltaX: 0, deltaY: -120 });

    // Windows 是桌面被控端:与 Mac 一样走「裸 JSON(非 protobuf)+ 归一化坐标」，键码换成 Windows VK；
    // 打字走 text_input(单字符上屏)。
    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      buildStreamerMacMouseMoveAbsoluteInputMessage({
        absX: 384,
        absY: 1037,
        surfaceWidth: 1920,
        surfaceHeight: 1080,
      }),
      buildStreamerWindowsKeyboardInputMessage({ action: "keyboardPress", value: 113 }),
      buildStreamerTextInputMessage("o"),
      buildStreamerMacMouseScrollInputMessage({ deltaX: 0, deltaY: -120 }),
    ]);
  });

  it("sends desktop keyboard input on the App control channel", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 3000,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.sendKeyboardInput({ action: "keyboardPress", value: "A" });
    session.sendKeyboardInput({ action: "keyboardRelease", value: "A" });

    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 3,
        inputMessage: buildStreamerKeyboardInputMessage({ action: "keyboardPress", value: "A" }),
      }),
      encodeStreamerInputMessage({
        sequence: 2,
        timestampMs: 3,
        inputMessage: buildStreamerKeyboardInputMessage({ action: "keyboardRelease", value: "A" }),
      }),
    ]);
  });

  it("uses app-compatible second timestamps for control input messages", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 1_778_857_057_890,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.sendKeyboardInput({ action: "keyboardPress", value: "F12" });

    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 1_778_857_057,
        inputMessage: buildStreamerKeyboardInputMessage({ action: "keyboardPress", value: "F12" }),
      }),
    ]);
  });

  it("uses device_capability display ids for desktop SendToRom input messages", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 3200,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    await session.applySignalEvents([
      {
        id: 20,
        direction: "inbound",
        event: "forward_setting",
        receivedAt: "2026-05-15T00:00:02.000Z",
        payload: [
          {
            client_id: "controlled-1",
            data: {
              type: "device_capability",
              device_capability: {
                display_info: [{ id: 1, fps: 75, type: 0, hdr: -1 }],
              },
            },
          },
        ],
      },
    ]);
    session.sendKeyboardInput({ action: "keyboardPress", value: "A" });

    expect(session.getState().remoteDisplayId).toBe(1);
    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 3,
        inputMessage: buildStreamerKeyboardInputMessage({ action: "keyboardPress", value: "A" }),
        displayId: 1,
      }),
    ]);
    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "signal",
          summary: "记录受控端显示器",
          details: {
            displayId: 1,
          },
        }),
        expect.objectContaining({
          kind: "data_send",
          summary: "发送控制输入",
          details: expect.objectContaining({
            remoteDisplayId: 1,
          }),
        }),
      ]),
    );
  });

  it("uses the Mac keymap raw control-string route", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 3300,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
      targetPlatform: 4,
    });

    await session.applySignalEvents([
      {
        id: 21,
        direction: "inbound",
        event: "device_capability",
        receivedAt: "2026-05-15T00:00:03.000Z",
        payload: {
          client_id: "controlled-1",
          data: {
            type: "device_capability",
            device_capability: {
              display_info: [{ id: 1, fps: 75, type: 0, hdr: -1 }],
            },
          },
        },
      },
    ]);
    session.sendKeyboardInput({ action: "keyboardPress", value: 29 });

    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      buildStreamerMacKeyboardInputMessage({ action: "keyboardPress", value: 29 }),
    ]);
  });

  it("uses the MuMu capture_change id as the SendToRom input index", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 3250,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control);
    control?.emitMessage(
      new Uint8Array([
        0x08, 0x01, 0x10, 0x02, 0x42, 0x04, 0x08, STREAMER_CAPTURE_CHANGE_TYPES.CT_MUMU, 0x10, 0x05,
      ]).buffer,
    );
    session.sendMouseButton({ action: "mousePress", button: "primary" });

    expect(session.getState().remoteInputDisplayId).toBe(5);
    expect(control?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 3,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mousePress", button: "primary" }),
        displayId: 5,
      }),
    ]);
  });

  it("closes peer and App data channels when the browser session is stopped", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const states: string[] = [];
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      onStateChange: (state) => {
        states.push(state.stage);
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.close();

    expect(peer.closed).toBe(true);
    expect([...peer.channels.values()].every((channel) => channel.closed)).toBe(true);
    expect(session.getState()).toMatchObject({
      appControlId: "",
      connectionPath: "unknown",
      dataChannels: {},
      remoteTrackCount: 0,
      stage: "idle",
    });
    expect(states.at(-1)).toBe("idle");
  });

  it("classifies the active WebRTC path from selected relay candidate stats", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    peer.stats = new Map<string, Record<string, unknown>>([
      [
        "pair-1",
        {
          id: "pair-1",
          type: "candidate-pair",
          selected: true,
          state: "succeeded",
          localCandidateId: "local-1",
          remoteCandidateId: "remote-1",
        },
      ],
      ["local-1", { id: "local-1", type: "local-candidate", candidateType: "relay", protocol: "udp", address: "203.0.113.10" }],
      ["remote-1", { id: "remote-1", type: "remote-candidate", candidateType: "relay", address: "203.0.113.11" }],
    ]);

    await session.refreshConnectionStats();

    expect(session.getState().connectionPath).toBe("relay");
    expect(session.getState().selectedCandidatePair).toMatchObject({
      localCandidateType: "relay",
      remoteCandidateType: "relay",
      protocol: "udp",
    });
  });

  it("classifies private host candidate pairs as LAN", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    peer.stats = new Map<string, Record<string, unknown>>([
      [
        "pair-1",
        {
          id: "pair-1",
          type: "candidate-pair",
          nominated: true,
          state: "succeeded",
          localCandidateId: "local-1",
          remoteCandidateId: "remote-1",
        },
      ],
      ["local-1", { id: "local-1", type: "local-candidate", candidateType: "host", address: "192.168.1.20" }],
      ["remote-1", { id: "remote-1", type: "remote-candidate", candidateType: "host", address: "192.168.1.30" }],
    ]);

    await session.refreshConnectionStats();

    expect(session.getState().connectionPath).toBe("lan");
    expect(session.getState().selectedCandidatePair).toMatchObject({
      localAddress: "192.168.1.20",
      remoteAddress: "192.168.1.30",
    });
  });

  it("publishes inbound video RTP stats for freeze diagnostics", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    peer.stats = new Map<string, Record<string, unknown>>([
      [
        "video-1",
        {
          id: "video-1",
          type: "inbound-rtp",
          kind: "video",
          packetsReceived: 120,
          bytesReceived: 98000,
          framesDecoded: 60,
          framesReceived: 66,
          framesDropped: 2,
          frameWidth: 2560,
          frameHeight: 1440,
          timestamp: 123456,
        },
      ],
    ]);

    await session.refreshConnectionStats();

    expect(session.getState().inboundVideo).toMatchObject({
      packetsReceived: 120,
      bytesReceived: 98000,
      framesDecoded: 60,
      framesReceived: 66,
      framesDropped: 2,
      frameWidth: 2560,
      frameHeight: 1440,
      timestampMs: 123456,
    });
  });

  it("diagnoses a decode-side stall when RTP bytes advance but decoded frames do not", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    peer.stats = makeInboundVideoStats({ packetsReceived: 100, bytesReceived: 90000, framesDecoded: 50 });
    await session.refreshConnectionStats();
    peer.stats = makeInboundVideoStats({ packetsReceived: 130, bytesReceived: 125000, framesDecoded: 50 });
    await session.refreshConnectionStats();

    expect(session.getState().videoFlow).toMatchObject({
      status: "decode_stalled",
      title: "RTP 仍在收包，解码帧未增长",
      delta: {
        packetsReceived: 30,
        bytesReceived: 35000,
        framesDecoded: 0,
      },
    });
    expect(session.getState().debugEvents.at(-1)).toMatchObject({
      kind: "stats",
      summary: "RTP 仍在收包，解码帧未增长",
    });
    expect(session.getState().inboundVideo).toMatchObject({
      codecMimeType: "video/H264",
      decoderImplementation: "VideoToolbox",
    });
  });

  it("records pli/nack/keyDecoded deltas alongside decode_stalled stats", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    peer.stats = makeInboundVideoStats({
      packetsReceived: 100,
      bytesReceived: 90000,
      framesDecoded: 50,
      keyFramesDecoded: 1,
      pliCount: 0,
      nackCount: 0,
      framesDropped: 0,
    });
    await session.refreshConnectionStats();
    peer.stats = makeInboundVideoStats({
      packetsReceived: 130,
      bytesReceived: 125000,
      framesDecoded: 50,
      keyFramesDecoded: 1,
      pliCount: 3,
      nackCount: 7,
      framesDropped: 4,
    });
    await session.refreshConnectionStats();

    const flow = session.getState().videoFlow;
    expect(flow?.status).toBe("decode_stalled");
    expect(flow?.delta).toMatchObject({
      pliCount: 3,
      nackCount: 7,
      framesDropped: 4,
      keyFramesDecoded: 0,
    });
    expect(flow?.detail).toContain("pli +3");
    expect(flow?.detail).toContain("nack +7");
    expect(flow?.detail).toContain("dropped +4");
  });

  it("diagnoses a transport-side stall when neither RTP nor selected pair bytes advance", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    peer.stats = makeInboundVideoStats({ packetsReceived: 100, bytesReceived: 90000, framesDecoded: 50 });
    await session.refreshConnectionStats();
    peer.stats = makeInboundVideoStats({ packetsReceived: 100, bytesReceived: 90000, framesDecoded: 50 });
    await session.refreshConnectionStats();

    expect(session.getState().videoFlow).toMatchObject({
      status: "transport_stalled",
      title: "RTP 收包无增量",
      delta: {
        packetsReceived: 0,
        bytesReceived: 0,
        framesDecoded: 0,
      },
    });
  });

  it("records browser video element samples for playback diagnostics", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.recordVideoElementSample({
      event: "playing",
      currentTimeMs: 1200,
      totalVideoFrames: 72,
      droppedVideoFrames: 1,
      readyState: 4,
      paused: false,
      ended: false,
      width: 1920,
      height: 1080,
    });

    expect(session.getState().videoElement).toMatchObject({
      event: "playing",
      currentTimeMs: 1200,
      totalVideoFrames: 72,
      width: 1920,
      height: 1080,
    });
    expect(session.getState().debugEvents.at(-1)).toMatchObject({
      kind: "video_element",
      summary: "video playing",
    });
  });

  it("keeps the active video element sample when inactive transceivers report blank elements", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.recordVideoElementSample({
      event: "sample",
      currentTimeMs: 47,
      totalVideoFrames: 9,
      droppedVideoFrames: 4,
      readyState: 4,
      paused: false,
      ended: false,
      width: 2560,
      height: 1440,
    });
    session.recordVideoElementSample({
      event: "sample",
      currentTimeMs: 1047,
      totalVideoFrames: 62,
      droppedVideoFrames: 4,
      readyState: 4,
      paused: false,
      ended: false,
      width: 2560,
      height: 1440,
    });
    const flowAfterActiveSample = session.getState().videoFlow;
    const eventCountAfterActiveSample = session.getState().debugEvents.length;
    session.recordVideoElementSample({
      event: "sample",
      currentTimeMs: 0,
      totalVideoFrames: 0,
      droppedVideoFrames: 0,
      readyState: 0,
      paused: false,
      ended: false,
      width: 0,
      height: 0,
    });

    expect(session.getState().videoElement).toMatchObject({
      currentTimeMs: 1047,
      totalVideoFrames: 62,
      readyState: 4,
      width: 2560,
      height: 1440,
    });
    expect(session.getState().videoFlow).toEqual(flowAfterActiveSample);
    expect(session.getState().debugEvents).toHaveLength(eventCountAfterActiveSample);
  });
  it("releases all held mouse buttons and keys via releaseAllInputs", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 9000,
    });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });

    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control);
    session.sendMouseButton({ action: "mousePress", button: "secondary" });
    session.sendKeyboardInput({ action: "keyboardPress", value: "A" });
    control!.sent.length = 0;

    session.releaseAllInputs();

    expect(control?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 3,
        timestampMs: 9,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mouseRelease", button: "secondary" }),
      }),
      encodeStreamerInputMessage({
        sequence: 4,
        timestampMs: 9,
        inputMessage: buildStreamerKeyboardInputMessage({ action: "keyboardRelease", value: "A" }),
      }),
    ]);

    control!.sent.length = 0;
    session.releaseAllInputs();
    expect(control?.sent).toEqual([]);
  });
});

function soacEvent(id: number, payload: unknown): RemoteSignalGatewayEvent {
  return {
    id,
    direction: "inbound",
    event: "soac",
    receivedAt: "2026-05-15T00:00:00.000Z",
    payload: [payload],
  };
}

function makeInboundVideoStats(input: {
  packetsReceived: number;
  bytesReceived: number;
  framesDecoded: number;
  framesReceived?: number;
  framesDropped?: number;
  keyFramesDecoded?: number;
  pliCount?: number;
  nackCount?: number;
  firCount?: number;
  freezeCount?: number;
}): Map<string, Record<string, unknown>> {
  return new Map<string, Record<string, unknown>>([
    [
      "video-1",
      {
        id: "video-1",
        type: "inbound-rtp",
        kind: "video",
        packetsReceived: input.packetsReceived,
        bytesReceived: input.bytesReceived,
        framesDecoded: input.framesDecoded,
        framesReceived: input.framesReceived ?? input.framesDecoded,
        framesDropped: input.framesDropped,
        keyFramesDecoded: input.keyFramesDecoded,
        pliCount: input.pliCount,
        nackCount: input.nackCount,
        firCount: input.firCount,
        freezeCount: input.freezeCount,
        codecId: "codec-1",
        decoderImplementation: "VideoToolbox",
        timestamp: 123456,
      },
    ],
    [
      "codec-1",
      {
        id: "codec-1",
        type: "codec",
        mimeType: "video/H264",
        payloadType: 102,
        clockRate: 90000,
      },
    ],
    [
      "pair-1",
      {
        id: "pair-1",
        type: "candidate-pair",
        selected: true,
        state: "succeeded",
        localCandidateId: "local-1",
        remoteCandidateId: "remote-1",
        bytesReceived: input.bytesReceived,
        bytesSent: 2048,
      },
    ],
    ["local-1", { id: "local-1", type: "local-candidate", candidateType: "host", address: "192.168.1.20" }],
    ["remote-1", { id: "remote-1", type: "remote-candidate", candidateType: "host", address: "192.168.1.30" }],
  ]);
}

class FakeRemoteApi {
  readonly controlCalls: RemoteSignalControlRequest[] = [];
  readonly soacCalls: RemoteSignalSoacRequest[] = [];

  constructor(private readonly controlResultOverrides: Partial<NonNullable<RemoteSignalControlResult["control"]["result"]>> = {}) {}

  async sendSignalControl(input: RemoteSignalControlRequest): Promise<RemoteSignalControlResult> {
    this.controlCalls.push(input);
    return {
      event: "control",
      ackStatus: "success",
      ack: [],
      control: {
        ackStatus: "success",
        result: {
          clientId: "controlled-1",
          iceId: "ice-1",
          iceServers: [
            {
              urls: "turn:relay.example:3478?transport=udp",
              username: "turn-user",
              credential: "turn-pass",
            },
          ],
          ...this.controlResultOverrides,
        },
      },
      emittedAt: "2026-05-15T00:00:00.000Z",
      ackReceivedAt: "2026-05-15T00:00:00.100Z",
    };
  }

  async sendSignalSoac(input: RemoteSignalSoacRequest): Promise<RemoteSignalSoacResult> {
    this.soacCalls.push(input);
    return {
      event: "soac",
      payload: input,
      emittedAt: "2026-05-15T00:00:00.200Z",
    };
  }
}

class FakePeerConnection {
  configuration: unknown;
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  signalingState: RTCSignalingState = "stable";
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  readonly transceivers: Array<{ kind: string; direction?: RTCRtpTransceiverDirection }> = [];
  readonly dataChannels: string[] = [];
  readonly videoCodecPreferenceCalls: RTCRtpCodecCapability[][] = [];
  readonly channels = new Map<string, FakeDataChannel>();
  readonly remoteDescriptions: RTCSessionDescriptionInit[] = [];
  readonly candidates: RTCIceCandidateInit[] = [];
  readonly createOfferCalls: Array<RTCOfferOptions | undefined> = [];
  setRemoteDescriptionShouldThrow = false;
  closed = false;
  restartIceCalls = 0;
  stats: Map<string, Record<string, unknown>> = new Map();

  createDataChannel(label: string): FakeDataChannel {
    this.dataChannels.push(label);
    const channel = new FakeDataChannel(label);
    this.channels.set(label, channel);
    return channel;
  }

  addTransceiver(kind: "audio" | "video", init?: RTCRtpTransceiverInit): RTCRtpTransceiver {
    this.transceivers.push({ kind, direction: init?.direction });
    return {
      setCodecPreferences: (codecs: RTCRtpCodecCapability[]) => {
        if (kind === "video") this.videoCodecPreferenceCalls.push(codecs);
      },
    } as RTCRtpTransceiver;
  }

  async createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    this.createOfferCalls.push(options);
    return {
      type: "offer",
      sdp: options?.iceRestart ? "v=0 browser restart offer" : "v=0 browser offer",
    };
  }

  restartIce(): void {
    this.restartIceCalls += 1;
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description;
    if (description.type === "offer") {
      this.signalingState = "have-local-offer";
    } else if (description.type === "answer") {
      this.signalingState = "stable";
    }
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    if (this.setRemoteDescriptionShouldThrow) {
      throw new Error("InvalidStateError: setRemoteDescription wrong state");
    }
    this.remoteDescription = description;
    this.remoteDescriptions.push(description);
    if (description.type === "answer") {
      this.signalingState = "stable";
    } else if (description.type === "offer") {
      this.signalingState = "have-remote-offer";
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.candidates.push(candidate);
  }

  async getStats(): Promise<Map<string, Record<string, unknown>>> {
    return this.stats;
  }

  close(): void {
    this.closed = true;
  }
}

class FakeDataChannel {
  binaryType: BinaryType = "arraybuffer";
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  readyState: RTCDataChannelState = "open";
  readonly sent: Array<string | Blob | ArrayBuffer | ArrayBufferView> = [];
  closed = false;

  constructor(readonly label: string) {}

  send(data: string | Blob | ArrayBuffer | ArrayBufferView): void {
    this.sent.push(data);
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  close(): void {
    this.closed = true;
    this.readyState = "closed";
    this.onclose?.(new Event("close"));
  }
}
