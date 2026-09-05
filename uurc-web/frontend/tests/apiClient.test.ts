import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelRemoteAssistance,
  getRemoteAssistanceControlMode,
  getRuntimeProfile,
  getRemoteSignalDiagnostics,
  getRemoteSignalEvents,
  joinRemoteAssistanceByCode,
  joinRemoteAssistanceByConfirmation,
  sendRemoteSignalControl,
  sendRemoteSignalSoac,
  updateRoomAppFlag,
} from "../src/api/client.js";

describe("frontend API client remote signal helpers", () => {
  beforeEach(() => {
    window.localStorage.setItem(
      "uurc.loginState",
      JSON.stringify({
        token: "header.payload.signature",
        userId: "user-1",
        clientId: "client-1",
        deviceId: "web-device-1",
      }),
    );
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("calls backend signal event, control, and SOAC routes", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({ path: String(input), init });
        if (String(input) === "/api/remote/signal/events") {
          return jsonResponse([{ id: 1, direction: "inbound", event: "soac", receivedAt: "now", payload: [] }]);
        }
        if (String(input) === "/api/runtime") {
          return jsonResponse({
            ok: true,
            runtime: "node",
            uuProxyPath: "/api/proxy/uu",
            signalGateway: "node-socket-io",
            remoteApiBase: "/api/remote",
            wispProxy: true,
          });
        }
        if (String(input) === "/api/remote/signal/diagnostics") {
          return jsonResponse({
            stage: "answer_missing",
            blocker: "answer_missing",
            checks: {
              signalGatewayConnected: true,
              controlAckReceived: true,
              offerSent: true,
              beControlledReceived: true,
              answerReceived: false,
            },
            counts: {
              inbound: 2,
              outbound: 1,
            },
          });
        }
        if (String(input) === "/api/remote/signal/control") {
          return jsonResponse({ event: "control", ack: [], control: { ackStatus: "success" }, emittedAt: "now", ackReceivedAt: "now" });
        }
        if (String(input) === "/api/remote/signal/soac") {
          return jsonResponse({ event: "soac", payload: {}, emittedAt: "now" });
        }
        if (String(input) === "/api/proxy/uu") {
          return jsonResponse({
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: { code: 0 },
          });
        }
        return jsonResponse({});
      }),
    );

    await expect(getRuntimeProfile()).resolves.toMatchObject({
      runtime: "node",
      uuProxyPath: "/api/proxy/uu",
      remoteApiBase: "/api/remote",
    });
    await expect(getRemoteSignalEvents()).resolves.toHaveLength(1);
    await expect(getRemoteSignalDiagnostics()).resolves.toMatchObject({
      stage: "answer_missing",
      blocker: "answer_missing",
    });
    await expect(
      sendRemoteSignalControl({
        appControlId: "control-1",
        appDataBase64: "AQID",
        streamerData: "{}",
      }),
    ).resolves.toMatchObject({ event: "control" });
    await expect(
      sendRemoteSignalSoac({
        type: "offer",
        appControlId: "control-1",
        sdp: "v=0",
      }),
    ).resolves.toMatchObject({ event: "soac" });
    await expect(updateRoomAppFlag({ publisherDeviceId: "desktop-1", controlMode: null })).resolves.toMatchObject({
      appFlag: { controlMode: null },
    });

    expect(calls.map((call) => [call.path, call.init?.method ?? "GET", call.init?.body ? JSON.parse(String(call.init.body)) : null])).toEqual([
      ["/api/runtime", "GET", null],
      ["/api/remote/signal/events", "GET", null],
      ["/api/remote/signal/diagnostics", "GET", null],
      [
        "/api/remote/signal/control",
        "POST",
        {
          appControlId: "control-1",
          appDataBase64: "AQID",
          streamerData: "{}",
        },
      ],
      [
        "/api/remote/signal/soac",
        "POST",
        {
          type: "offer",
          appControlId: "control-1",
          sdp: "v=0",
        },
      ],
      [
        "/api/proxy/uu",
        "POST",
        {
          method: "POST",
          path: "/api/v1/room/app_flag",
          body: {
            publisher_device_id: "desktop-1",
            app_flag: {
              control_mode: null,
            },
          },
          headers: expect.objectContaining({
            "X-Param-SIGN": expect.any(String),
          }),
        },
      ],
    ]);
  });

  it("calls UU remote assistance routes through the signed proxy", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({ path: String(input), init });
        const request = init?.body ? JSON.parse(String(init.body)) : null;
        if (String(input) !== "/api/proxy/uu") {
          return jsonResponse({});
        }
        if (request.path === "/api/v2/room/share/control_mode") {
          return jsonResponse(proxyResponse({
            code: 0,
            data: {
              can_remote_control: true,
              control_mode: "by_password",
            },
          }));
        }
        if (request.path === "/api/v2/room/join/share/by_code") {
          return jsonResponse(proxyResponse(remoteAssistanceRoomBody("assist-room-token")));
        }
        if (request.path === "/api/v2/room/join/share/by_confirmation") {
          return jsonResponse(proxyResponse(remoteAssistanceRoomBody("assist-confirm-room-token")));
        }
        if (request.path === "/api/v2/room/share/cancel_remote_assist") {
          return jsonResponse(proxyResponse({ code: 0, msg: "ok" }));
        }
        return jsonResponse({});
      }),
    );

    await expect(getRemoteAssistanceControlMode("982123456")).resolves.toMatchObject({
      connectId: "982123456",
      canRemoteControl: true,
      controlMode: "by_password",
    });
    await expect(
      joinRemoteAssistanceByCode({
        connectId: "982123456",
        connectCode: "L6026CCD",
        controlMode: "by_password",
        targetPlatform: 1,
      }),
    ).resolves.toMatchObject({
      assistance: {
        connectId: "982123456",
        connectCodeProvided: true,
        controlMode: "by_password",
        deviceName: "Partner PC",
        targetPlatform: 1,
      },
      roomConfigSummary: {
        signalServers: ["wss://assist.example"],
      },
    });
    await expect(
      joinRemoteAssistanceByConfirmation({
        connectId: "982123456",
        controlId: "control-1",
        controlMode: "by_confirmation",
        targetPlatform: 1,
      }),
    ).resolves.toMatchObject({
      assistance: {
        connectId: "982123456",
        controlId: "control-1",
        usedConfirmation: true,
        targetPlatform: 1,
      },
    });
    await expect(cancelRemoteAssistance("982123456")).resolves.toMatchObject({
      body: {
        code: 0,
      },
    });

    expect(calls.map((call) => [call.path, call.init?.method ?? "GET", call.init?.body ? JSON.parse(String(call.init.body)) : null])).toEqual([
      [
        "/api/proxy/uu",
        "POST",
        {
          method: "POST",
          path: "/api/v2/room/share/control_mode",
          body: {
            connect_id: "982123456",
          },
          headers: expect.objectContaining({
            "X-Param-SIGN": expect.any(String),
          }),
        },
      ],
      [
        "/api/proxy/uu",
        "POST",
        {
          method: "POST",
          path: "/api/v2/room/join/share/by_code",
          body: {
            connect_id: "982123456",
            connect_code: "L6026CCD",
          },
          headers: expect.objectContaining({
            "X-Param-SIGN": expect.any(String),
          }),
        },
      ],
      [
        "/api/proxy/uu",
        "POST",
        {
          method: "POST",
          path: "/api/v2/room/join/share/by_confirmation",
          body: {
            connect_id: "982123456",
            control_id: "control-1",
          },
          headers: expect.objectContaining({
            "X-Param-SIGN": expect.any(String),
          }),
        },
      ],
      [
        "/api/proxy/uu",
        "POST",
        {
          method: "POST",
          path: "/api/v2/room/share/cancel_remote_assist",
          body: {
            connect_id: "982123456",
          },
          headers: expect.objectContaining({
            "X-Param-SIGN": expect.any(String),
          }),
        },
      ],
    ]);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function proxyResponse(body: unknown) {
  return {
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    body,
  };
}

function remoteAssistanceRoomBody(token: string) {
  return {
    code: 0,
    data: {
      control_id: "control-1",
      device_name: "Partner PC",
      platform: 1,
      room_config: {
        token,
        signaling_server: "wss://assist.example",
        ws_connect_timeout_ms: 12000,
        streamer_retry_delta_ms: 900,
        report_token: "assist-report-token",
        report_url: "https://report.example/qos",
      },
    },
  };
}
