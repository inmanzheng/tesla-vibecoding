import { gzipSync, gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";
import { STREAMER_ICE_NETWORK_TYPES, type RemoteRoomJoinContext, type RoomJoinUpstreamSummary, type StreamerRoomConfig } from "@uurc/shared";

import {
  RemoteControlService,
  SocketIoSignalGatewayConnector,
  type SignalGatewayConnectOptions,
  type SignalGatewayConnector,
} from "../src/services/remoteControlService.js";

describe("RemoteControlService", () => {
  it("returns null before a room config has been captured", async () => {
    const service = new RemoteControlService();

    await expect(service.createBootstrap()).resolves.toBeNull();
  });

  it("builds a token-safe app-compatible remote bootstrap from the latest RoomConfig", async () => {
    const service = new RemoteControlService(createRoomConfigSource());
    const bootstrap = await service.createBootstrap();

    expect(bootstrap).toMatchObject({
      status: "ready",
      strategy: "backend_signal_gateway",
      selectedSignalServer: "wss://signal-a.example",
      signalServers: ["wss://signal-a.example", "wss://signal-b.example"],
      joinContext: {
        deviceId: "desktop-1",
        forceJoin: false,
      },
      signalHeaders: {
        "X-NRD-AUTH": "<redacted room token>",
        "X-NRD-CONTROLLING": "0",
        streamer_version: "V3.1.14",
        streamer_flag: '{"sdp_flags":{"gzip_sdp":true}}',
      },
      signalEvents: [
        "soac",
        "streamer_push",
        "forward_setting",
        "device_capability",
      ],
      soac: {
        controllerOutboundTypes: ["offer", "candidate", "restart_ice"],
        controllerInboundTypes: ["answer", "candidate", "restart_ice"],
      },
      signalControl: {
        socketEvents: {
          control: "control",
          leave: "leave",
          bmsgPush: "bmsg_push",
          publisherDisconnect: "publisher_disconnect",
        },
        event: "control",
        payloadKeys: ["app_control_id", "app_data", "streamer_data"],
        ackTimeoutMs: 10000,
      },
      dataChannels: {
        control: "CONTROL_DATA_CHANNEL",
        text: "TEXT_DATA_CHANNEL",
      },
      connectOptions: {
        appClientVersion: "4.23.0",
        clientTypes: {
          Client_ANDROID: 2,
        },
        captureParams: {
          fields: expect.arrayContaining([
            { tag: 1, name: "fps", defaultValue: "FPS_UNKNOWN" },
            { tag: 2, name: "video_quality", defaultValue: "VideoQuality_UNKNOWN" },
          ]),
          fpsValues: {
            FPS_UNKNOWN: 0,
            FPS_60: 2,
          },
          staticDefaults: {
            fps: "FPS_UNKNOWN",
            videoQuality: "VideoQuality_UNKNOWN",
          },
        },
        defaultFeatureFlags: {
          ff_capture_setting: 2,
          ff_clipboard: 3,
        },
      },
      input: {
        supportedBuilders: ["desktop_mouse", "desktop_keyboard", "ime_text", "ime_control", "mumu_system_key", "mumu_touch"],
        imeControlCodes: {
          BACKSPACE: 14,
          ENTER: 28,
          HIDESELF: 100001,
        },
        mumuSystemKeyCodes: {
          BACK: 158,
          HOME: 172,
          MENU: 580,
        },
        touchSlots: [26, 27, 28, 29, 30, 31],
      },
    });
    expect(JSON.stringify(bootstrap)).not.toContain("room-secret-token");
  });

  it("starts a backend signal gateway with raw app-compatible headers but returns only redacted status", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);

    const status = await service.startSignalGateway();

    expect(connector.connectCalls).toHaveLength(1);
    expect(connector.connectCalls[0]).toMatchObject({
      signalServer: "wss://signal-a.example",
      headers: {
        "X-NRD-AUTH": "room-secret-token",
        "X-NRD-CONTROLLING": "0",
        streamer_version: "V3.1.14",
        streamer_flag: '{"sdp_flags":{"gzip_sdp":true}}',
      },
      timeoutMs: 12000,
      reconnectDelayMs: 1500,
    });
    expect(status).toMatchObject({
      status: "connected",
      strategy: "backend_signal_gateway",
      selectedSignalServer: "wss://signal-a.example",
      signalHeaders: {
        "X-NRD-AUTH": "<redacted room token>",
      },
      signalControl: {
        event: "control",
        ackTimeoutMs: 10000,
      },
      connectionId: "fake-signal-1",
    });
    expect(JSON.stringify(status)).not.toContain("room-secret-token");
  });

  it("can start the signal gateway from a selected signal server index", async () => {
    const connector = new FakeSignalGatewayConnector((options) =>
      options.signalServer === "wss://signal-b.example" ? new Error("selected gateway unavailable") : undefined,
    );
    const service = new RemoteControlService(createRoomConfigSource(), connector);

    const status = await service.startSignalGateway({ signalServerIndex: 1 });

    expect(connector.connectCalls.map((call) => call.signalServer)).toEqual([
      "wss://signal-b.example",
      "wss://signal-a.example",
    ]);
    expect(status).toMatchObject({
      status: "connected",
      selectedSignalServer: "wss://signal-a.example",
    });
  });

  it("can start the signal gateway with plain-SDP capability headers", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);

    const status = await service.startSignalGateway({ gzipSdp: false });

    expect(connector.connectCalls[0].headers.streamer_flag).toBe('{"sdp_flags":{"gzip_sdp":false}}');
    expect(status?.signalHeaders.streamer_flag).toBe('{"sdp_flags":{"gzip_sdp":false}}');
  });

  it("falls back to the next App signal server when the primary socket cannot connect", async () => {
    const connector = new FakeSignalGatewayConnector((options) =>
      options.signalServer === "wss://signal-a.example" ? new Error("primary signal down") : undefined,
    );
    const service = new RemoteControlService(createRoomConfigSource(), connector);

    const status = await service.startSignalGateway();

    expect(connector.connectCalls.map((call) => call.signalServer)).toEqual([
      "wss://signal-a.example",
      "wss://signal-b.example",
    ]);
    expect(status).toMatchObject({
      status: "connected",
      selectedSignalServer: "wss://signal-b.example",
      signalServers: ["wss://signal-a.example", "wss://signal-b.example"],
      connectionId: "fake-signal-1",
    });
  });

  it("records signal gateway connector failures without leaking the room token", async () => {
    const connector = new FakeSignalGatewayConnector(new Error("connect failed with auth room-secret-token"));
    const service = new RemoteControlService(createRoomConfigSource(), connector);

    const status = await service.startSignalGateway();

    expect(status).toMatchObject({
      status: "error",
      selectedSignalServer: "wss://signal-a.example",
      error: "connect failed with auth <redacted room token>",
    });
    expect(JSON.stringify(status)).not.toContain("room-secret-token");
  });

  it("stops the current signal gateway connection and clears the App room occupancy", async () => {
    const calls: Array<{ deviceId: string }> = [];
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(
      createRoomConfigSource({
        clearByDevice: async (input) => {
          calls.push(input);
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: {
              code: 0,
              msg: "ok",
              dataKeys: ["ignored_token_like_value"],
            },
          };
        },
      }),
      connector,
    );
    await service.startSignalGateway();

    const status = await service.stopSignalGateway();

    expect(connector.connections[0].closed).toBe(true);
    expect(calls).toEqual([{ deviceId: "desktop-1" }]);
    expect(status).toMatchObject({
      status: "closed",
      selectedSignalServer: "wss://signal-a.example",
      roomClear: {
        status: 200,
        body: {
          code: 0,
          msg: "ok",
          dataKeys: ["ignored_token_like_value"],
        },
      },
    });
    expect(JSON.stringify(status)).not.toContain("do-not-return");
  });

  it("records inbound App signal events from the backend gateway", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    connector.connectCalls[0].onSignalEvent("soac", [
      {
        client_id: "controlled-1",
        data: { type: "answer", sdp: "v=0" },
      },
    ]);

    expect(service.getSignalGatewayEvents()).toMatchObject([
      {
        id: 1,
        direction: "inbound",
        event: "soac",
        payload: [
          {
            client_id: "controlled-1",
            data: { type: "answer", sdp: "v=0" },
          },
        ],
      },
    ]);
  });

  it("unwraps bmsg_push SOAC pushes into inbound SOAC events", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    connector.connectCalls[0].onSignalEvent("bmsg_push", [
      JSON.stringify({
        type: "soac",
        data: {
          client_id: "controlled-1",
          data: { type: "answer", sdp: "v=0" },
        },
      }),
    ]);

    expect(service.getSignalGatewayEvents()).toMatchObject([
      {
        id: 1,
        direction: "inbound",
        event: "bmsg_push",
      },
      {
        id: 2,
        direction: "inbound",
        event: "soac",
        payload: [
          {
            client_id: "controlled-1",
            data: { type: "answer", sdp: "v=0" },
          },
        ],
      },
    ]);
  });

  it("unwraps bmsg_push typed answer pushes into inbound SOAC events", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    connector.connectCalls[0].onSignalEvent("bmsg_push", [
      JSON.stringify({
        type: "answer",
        data: {
          client_id: "controlled-1",
          data: {
            ice_id: "ice-1",
            app_control_id: "control-1",
            sdp: "v=0 typed answer",
          },
        },
      }),
    ]);

    expect(service.getSignalGatewayEvents()).toMatchObject([
      {
        id: 1,
        direction: "inbound",
        event: "bmsg_push",
      },
      {
        id: 2,
        direction: "inbound",
        event: "soac",
        payload: [
          {
            client_id: "controlled-1",
            data: {
              type: "answer",
              ice_id: "ice-1",
              app_control_id: "control-1",
              sdp: "v=0 typed answer",
            },
          },
        ],
      },
    ]);
  });

  it("normalizes direct typed answer events into inbound SOAC events", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    expect(connector.connectCalls[0].inboundEvents).toContain("answer");
    connector.connectCalls[0].onSignalEvent("answer", [
      {
        client_id: "controlled-1",
        data: {
          ice_id: "ice-1",
          app_control_id: "control-1",
          sdp: "v=0 direct typed answer",
        },
      },
    ]);

    expect(service.getSignalGatewayEvents()).toMatchObject([
      {
        id: 1,
        direction: "inbound",
        event: "soac",
        payload: [
          {
            client_id: "controlled-1",
            data: {
              type: "answer",
              ice_id: "ice-1",
              app_control_id: "control-1",
              sdp: "v=0 direct typed answer",
            },
          },
        ],
      },
    ]);
  });

  it("normalizes inbound gzip SOAC SDP into browser-readable plain SDP", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    connector.connectCalls[0].onSignalEvent("bmsg_push", [
      {
        type: "soac",
        data: {
          client_id: "controlled-1",
          data: {
            type: "answer",
            sdp: "",
            gzip_sdp: gzipSync(Buffer.from("v=0 controlled answer", "utf8")),
          },
        },
      },
    ]);

    expect(service.getSignalGatewayEvents()).toMatchObject([
      {
        id: 1,
        direction: "inbound",
        event: "bmsg_push",
      },
      {
        id: 2,
        direction: "inbound",
        event: "soac",
        payload: [
          {
            client_id: "controlled-1",
            data: {
              type: "answer",
              sdp: "v=0 controlled answer",
            },
          },
        ],
      },
    ]);
  });

  it("clears stale signal events when the backend gateway is restarted", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    connector.connectCalls[0].onSignalEvent("soac", [
      {
        client_id: "controlled-1",
        data: { type: "answer", sdp: "v=0 stale answer" },
      },
    ]);
    expect(service.getSignalGatewayEvents()).toHaveLength(1);

    await service.startSignalGateway();

    expect(connector.connections[0].closed).toBe(true);
    expect(service.getSignalGatewayEvents()).toEqual([]);
    connector.connectCalls[1].onSignalEvent("soac", [
      {
        client_id: "controlled-1",
        data: { type: "answer", sdp: "v=0 fresh answer" },
      },
    ]);
    expect(service.getSignalGatewayEvents()[0]).toMatchObject({
      id: 1,
      direction: "inbound",
      event: "soac",
    });
  });

  it("emits the App control event with binary app_data and string streamer_data and returns the ack", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    const streamerData = '{"control_id":"control-1","device_capability":{}}';
    const result = await service.sendSignalControl({
      appControlId: "control-1",
      appDataBase64: Buffer.from("app-data").toString("base64"),
      streamerData,
    });

    expect(connector.connections[0].emitWithAckCalls).toHaveLength(1);
    expect(connector.connections[0].emitWithAckCalls[0].event).toBe("control");
    expect(connector.connections[0].emitWithAckCalls[0].ackTimeoutMs).toBe(10000);
    expect(connector.connections[0].emitWithAckCalls[0].payload.app_control_id).toBe("control-1");
    expect(Buffer.isBuffer(connector.connections[0].emitWithAckCalls[0].payload.app_data)).toBe(true);
    expect(Buffer.from(connector.connections[0].emitWithAckCalls[0].payload.app_data).toString()).toBe("app-data");
    expect(connector.connections[0].emitWithAckCalls[0].payload.streamer_data).toBe(streamerData);
    expect(result).toMatchObject({
      event: "control",
      ackStatus: "success",
      ack: [
        "success",
        {
          code: 0,
          msg: "ok",
          app_data: {
            kind: "binary",
            byteLength: 3,
            base64: "AQID",
          },
        },
      ],
      control: {
        ackStatus: "success",
        result: {
          code: 0,
          msg: "ok",
          appDataBase64: "AQID",
          iceServers: [
            {
              urls: "turn:relay.example:3478?transport=udp",
              username: "turn-user",
              credential: "turn-pass",
            },
          ],
        },
      },
    });
  });

  it("emits App-shaped SOAC messages with the ack callback", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    const result = await service.sendSignalSoac({
      type: "offer",
      clientId: "controlled-1",
      appControlId: "control-1",
      iceId: "ice-1",
      sdp: "v=0",
      gzipSdp: true,
      iceNetworkType: STREAMER_ICE_NETWORK_TYPES.appAuto,
    } as Parameters<RemoteControlService["sendSignalSoac"]>[0] & { iceId: string });

    const connection = connector.connections[0] as unknown as {
      emitCalls: unknown[];
      emitWithOptionalAckCalls: Array<{
        event: string;
        payload: Record<string, unknown>;
        onAck: (ack: unknown[]) => void;
      }>;
    };
    expect(connection.emitCalls).toEqual([]);
    expect(connection.emitWithOptionalAckCalls).toHaveLength(1);
    expect(connection.emitWithOptionalAckCalls[0]).toMatchObject({
      event: "soac",
      payload: {
        client_id: "controlled-1",
        data: {
          type: "offer",
          app_control_id: "control-1",
          ice_id: "ice-1",
          sdp: "",
          gzip_sdp: expect.any(Buffer),
          ice_network_type: 3,
        },
      },
    });
    connection.emitWithOptionalAckCalls[0].onAck(["success", { code: 0 }]);
    expect(service.getSignalGatewayEvents()).toMatchObject([
      {
        direction: "outbound",
        event: "soac",
      },
      {
        direction: "inbound",
        event: "soac:ack",
        payload: ["success", { code: 0 }],
      },
    ]);
    const sentGzipSdp = connection.emitWithOptionalAckCalls[0].payload.data.gzip_sdp;
    expect(Buffer.isBuffer(sentGzipSdp)).toBe(true);
    expect(gunzipSync(sentGzipSdp as Buffer).toString("utf8")).toBe("v=0");
    expect(result).toMatchObject({
      event: "soac",
      payload: {
        client_id: "controlled-1",
        data: {
          type: "offer",
          ice_id: "ice-1",
          sdp: "",
          gzip_sdp: {
            kind: "binary",
            byteLength: expect.any(Number),
            base64: expect.any(String),
          },
        },
      },
    });
  });

  it("emits wire-shaped candidate SOAC messages without ice_network_type", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    await service.sendSignalSoac({
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
    } as Parameters<RemoteControlService["sendSignalSoac"]>[0] & { iceId: string });

    expect(connector.connections[0].emitWithOptionalAckCalls).toMatchObject([
      {
        event: "soac",
        payload: {
          client_id: "controlled-1",
          data: {
            type: "candidate",
            app_control_id: "control-1",
            ice_id: "ice-1",
            candidate: {
              candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host",
              sdpMid: "0",
              sdpMLineIndex: 0,
            },
          },
        },
      },
    ]);
  });

  it("gzips App-shaped restart_ice offers when SDP gzip is enabled", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    const result = await service.sendSignalSoac({
      type: "restart_ice",
      clientId: "controlled-1",
      appControlId: "control-1",
      iceId: "ice-1",
      sdp: "v=0 restart",
      gzipSdp: true,
      iceNetworkType: STREAMER_ICE_NETWORK_TYPES.v4Wlan,
    } as Parameters<RemoteControlService["sendSignalSoac"]>[0] & { iceId: string });

    expect(connector.connections[0].emitWithOptionalAckCalls).toMatchObject([
      {
        event: "soac",
        payload: {
          client_id: "controlled-1",
          data: {
            type: "restart_ice",
            app_control_id: "control-1",
            ice_id: "ice-1",
            sdp: "",
            gzip_sdp: expect.any(Buffer),
            ice_network_type: STREAMER_ICE_NETWORK_TYPES.v4Wlan,
          },
        },
      },
    ]);
    const sentGzipSdp = connector.connections[0].emitWithOptionalAckCalls[0].payload.data.gzip_sdp;
    expect(Buffer.isBuffer(sentGzipSdp)).toBe(true);
    expect(gunzipSync(sentGzipSdp as Buffer).toString("utf8")).toBe("v=0 restart");
    expect(result?.payload).toMatchObject({
      client_id: "controlled-1",
      data: {
        type: "restart_ice",
        ice_id: "ice-1",
        sdp: "",
        gzip_sdp: {
          kind: "binary",
          byteLength: expect.any(Number),
          base64: expect.any(String),
        },
      },
    });
  });
});

describe("SocketIoSignalGatewayConnector", () => {
  it("uses the Engine.IO binary prefix on WebSocket frames", async () => {
    const socket = new FakeSocketIoClient();
    const rawSentFrames: unknown[] = [];
    const rawInboundFrames: unknown[] = [];
    socket.io.engine.transport.ws.send = (data: unknown) => {
      rawSentFrames.push(data);
    };
    socket.io.engine.transport.onData = (data: unknown) => {
      rawInboundFrames.push(data);
    };
    const connector = new SocketIoSignalGatewayConnector(() => socket as never);

    await connector.connect({
      signalServer: "wss://signal-a.example",
      signalServers: ["wss://signal-a.example"],
      headers: {},
      inboundEvents: [],
      socketEvents: {
        control: "control",
        leave: "leave",
        bmsgPush: "bmsg_push",
        publisherDisconnect: "publisher_disconnect",
      },
      controlEvent: "control",
      onSignalEvent: () => {},
    });

    socket.io.engine.transport.ws.send(Buffer.from([0x08, 0x01]));
    socket.io.engine.transport.ws.send(Buffer.from([0x04, 0x08, 0x01]));
    socket.io.engine.transport.onData(Buffer.from([0x04, 0x08, 0x01]));

    expect(rawSentFrames.map((frame) => Buffer.from(frame as Buffer))).toEqual([
      Buffer.from([0x04, 0x08, 0x01]),
      Buffer.from([0x04, 0x08, 0x01]),
    ]);
    expect(rawInboundFrames.map((frame) => Buffer.from(frame as Buffer))).toEqual([
      Buffer.from([0x08, 0x01]),
    ]);
  });

  it("captures unknown direct socket.io events for live signal diagnostics", async () => {
    const socket = new FakeSocketIoClient();
    const seenEvents: Array<{ event: string; payload: unknown[] }> = [];
    const connector = new SocketIoSignalGatewayConnector(() => socket as never);

    const connected = connector.connect({
      signalServer: "wss://signal-a.example",
      signalServers: ["wss://signal-a.example"],
      headers: {},
      inboundEvents: ["soac"],
      socketEvents: {
        control: "control",
        leave: "leave",
        bmsgPush: "bmsg_push",
        publisherDisconnect: "publisher_disconnect",
      },
      controlEvent: "control",
      onSignalEvent: (event, payload) => seenEvents.push({ event, payload }),
    });

    await connected;
    socket.dispatch("soac", { data: { type: "answer" } });
    socket.dispatch("server_side_debug", { reason: "not in allowed list" });

    expect(seenEvents).toEqual([
      {
        event: "soac",
        payload: [{ data: { type: "answer" } }],
      },
      {
        event: "server_side_debug",
        payload: [{ reason: "not in allowed list" }],
      },
    ]);
  });
});

function createRoomConfigSource(overrides: {
  clearByDevice?: (input: { deviceId: string }) => Promise<RoomJoinUpstreamSummary>;
} = {}) {
  const roomConfig: StreamerRoomConfig = {
    token: "room-secret-token",
    signalServers: ["wss://signal-a.example", "wss://signal-b.example"],
    timeout: 12000,
    signalReconnectDelay: 1500,
    appData: "{}",
  };
  const joinContext: RemoteRoomJoinContext = {
    capturedAt: "2026-05-15T00:00:00.000Z",
    deviceId: "desktop-1",
    forceJoin: false,
  };

  return {
    getLatestRoomConfig: async () => roomConfig,
    getLatestJoinContext: async () => joinContext,
    clearByDevice: overrides.clearByDevice,
  };
}

class FakeSignalGatewayConnector implements SignalGatewayConnector {
  readonly connectCalls: SignalGatewayConnectOptions[] = [];
  readonly connections: FakeSignalGatewayConnection[] = [];

  constructor(private readonly failure?: Error | ((options: SignalGatewayConnectOptions) => Error | undefined)) {}

  async connect(options: SignalGatewayConnectOptions): Promise<FakeSignalGatewayConnection> {
    this.connectCalls.push(options);
    const failure = typeof this.failure === "function" ? this.failure(options) : this.failure;
    if (failure) throw failure;
    const connection = new FakeSignalGatewayConnection(`fake-signal-${this.connections.length + 1}`);
    this.connections.push(connection);
    return connection;
  }
}

class FakeSignalGatewayConnection {
  closed = false;
  readonly emitCalls: Array<{
    event: string;
    payload: Record<string, unknown>;
  }> = [];
  readonly emitWithOptionalAckCalls: Array<{
    event: string;
    payload: Record<string, unknown>;
    onAck: (ack: unknown[]) => void;
  }> = [];
  readonly emitWithAckCalls: Array<{
    event: string;
    payload: Record<string, unknown>;
    ackTimeoutMs: number;
  }> = [];

  constructor(readonly id: string) {}

  close(): void {
    this.closed = true;
  }

  async emit(event: string, payload: Record<string, unknown>): Promise<void> {
    this.emitCalls.push({ event, payload });
  }

  async emitWithOptionalAck(event: string, payload: Record<string, unknown>, onAck: (ack: unknown[]) => void): Promise<void> {
    this.emitWithOptionalAckCalls.push({ event, payload, onAck });
  }

  async emitWithAck(event: string, payload: Record<string, unknown>, ackTimeoutMs: number): Promise<unknown[]> {
    this.emitWithAckCalls.push({ event, payload, ackTimeoutMs });
    return [
      "success",
      {
        code: 0,
        msg: "ok",
        app_data: Buffer.from([1, 2, 3]),
        iceServers: [
          {
            urls: "turn:relay.example:3478?transport=udp",
            username: "turn-user",
            credential: "turn-pass",
          },
        ],
      },
    ];
  }
}

class FakeSocketIoClient {
  id = "fake-socket";
  connected = false;
  io = {
    engine: {
      transport: {
        ws: {
          send: (_data: unknown) => {},
        },
        onData: (_data: unknown) => {},
      },
    },
  };
  private readonly handlers = new Map<string, Array<(...payload: unknown[]) => void>>();
  private readonly onceHandlers = new Map<string, Array<(...payload: unknown[]) => void>>();
  private readonly anyHandlers: Array<(event: string, ...payload: unknown[]) => void> = [];

  on(event: string, handler: (...payload: unknown[]) => void): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  onAny(handler: (event: string, ...payload: unknown[]) => void): this {
    this.anyHandlers.push(handler);
    return this;
  }

  once(event: string, handler: (...payload: unknown[]) => void): this {
    this.onceHandlers.set(event, [...(this.onceHandlers.get(event) ?? []), handler]);
    return this;
  }

  off(event: string, handler: (...payload: unknown[]) => void): this {
    this.handlers.set(event, (this.handlers.get(event) ?? []).filter((item) => item !== handler));
    this.onceHandlers.set(event, (this.onceHandlers.get(event) ?? []).filter((item) => item !== handler));
    return this;
  }

  connect(): void {
    this.connected = true;
    this.dispatch("connect");
  }

  disconnect(): void {
    this.connected = false;
  }

  emit(): void {
    // Not needed for this connector registration test.
  }

  dispatch(event: string, ...payload: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...payload);
    }
    for (const handler of this.onceHandlers.get(event) ?? []) {
      handler(...payload);
    }
    this.onceHandlers.delete(event);
    for (const handler of this.anyHandlers) {
      handler(event, ...payload);
    }
  }
}
