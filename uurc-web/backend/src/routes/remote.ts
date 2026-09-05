import { Router } from "express";
import {
  STREAMER_ICE_NETWORK_TYPES,
  STREAMER_SOAC_TYPES,
  type RemoteSignalGatewayStartRequest,
  type RemoteSignalSoacCandidate,
  type RemoteRoomJoinContext,
  type StreamerRoomConfig,
  type StreamerIceNetworkType,
  type StreamerSoacType,
} from "@uurc/shared";

import type { RemoteControlService } from "../services/remoteControlService.js";

export function createRemoteRouter(remoteControl: RemoteControlService): Router {
  const router = Router();

  router.get("/remote/bootstrap", async (_req, res, next) => {
    try {
      const bootstrap = await remoteControl.createBootstrap();
      if (!bootstrap) {
        res.status(404).json({ error: "Join a room before starting remote control" });
        return;
      }

      res.json(bootstrap);
    } catch (error) {
      next(error);
    }
  });

  router.post("/remote/signal/start", async (req, res, next) => {
    try {
      const input = parseSignalGatewayStartRequest(req.body);
      const status = await remoteControl.startSignalGateway(input);
      if (!status) {
        res.status(404).json({ error: "Join a room before starting remote control" });
        return;
      }

      res.json(status);
    } catch (error) {
      if (error instanceof BadRequestError) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.get("/remote/signal/status", (_req, res) => {
    res.json(remoteControl.getSignalGatewayStatus());
  });

  router.get("/remote/signal/events", (_req, res) => {
    res.json(remoteControl.getSignalGatewayEvents());
  });

  router.get("/remote/signal/diagnostics", (_req, res) => {
    res.json(remoteControl.getSignalReadinessDiagnostics());
  });

  router.post("/remote/signal/control", async (req, res, next) => {
    try {
      const input = parseSignalControlRequest(req.body);
      const result = await remoteControl.sendSignalControl(input);
      if (!result) {
        res.status(409).json({ error: "Start the signal gateway before sending control" });
        return;
      }

      res.json(result);
    } catch (error) {
      if (error instanceof BadRequestError) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.post("/remote/signal/soac", async (req, res, next) => {
    try {
      const input = parseSignalSoacRequest(req.body);
      const result = await remoteControl.sendSignalSoac(input);
      if (!result) {
        res.status(409).json({ error: "Start the signal gateway before sending SOAC" });
        return;
      }

      res.json(result);
    } catch (error) {
      if (error instanceof BadRequestError) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.delete("/remote/signal", async (_req, res, next) => {
    try {
      res.json(await remoteControl.stopSignalGateway());
    } catch (error) {
      next(error);
    }
  });

  return router;
}

class BadRequestError extends Error {}

function parseSignalGatewayStartRequest(body: unknown): RemoteSignalGatewayStartRequest {
  if (body === undefined || body === null) return {};
  if (typeof body !== "object") {
    throw new BadRequestError("Expected a JSON signal gateway payload");
  }

  const record = body as Record<string, unknown>;
  assertOptionalBoolean(record.gzipSdp, "gzipSdp");
  assertOptionalNonNegativeInteger(record.signalServerIndex, "signalServerIndex");

  return {
    gzipSdp: record.gzipSdp,
    signalServerIndex: record.signalServerIndex,
    roomConfig: parseOptionalRoomConfig(record.roomConfig),
    joinContext: parseOptionalJoinContext(record.joinContext),
  };
}

function parseOptionalRoomConfig(value: unknown): StreamerRoomConfig | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestError("roomConfig must be an object");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.token !== "string" || record.token.length === 0) {
    throw new BadRequestError("roomConfig.token is required");
  }
  if (!Array.isArray(record.signalServers) || !record.signalServers.every((item) => typeof item === "string" && item.length > 0)) {
    throw new BadRequestError("roomConfig.signalServers must be a string array");
  }
  assertOptionalNonNegativeInteger(record.timeout, "roomConfig.timeout");
  assertOptionalNonNegativeInteger(record.signalReconnectDelay, "roomConfig.signalReconnectDelay");
  assertOptionalString(record.reportToken, "roomConfig.reportToken");
  assertOptionalString(record.reportUrl, "roomConfig.reportUrl");
  assertOptionalString(record.reportServerAddress, "roomConfig.reportServerAddress");
  assertOptionalString(record.appData, "roomConfig.appData");

  return {
    token: record.token,
    signalServers: record.signalServers,
    timeout: record.timeout,
    signalReconnectDelay: record.signalReconnectDelay,
    reportToken: record.reportToken,
    reportUrl: record.reportUrl,
    reportServerAddress: record.reportServerAddress,
    appData: record.appData,
  };
}

function parseOptionalJoinContext(value: unknown): RemoteRoomJoinContext | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestError("joinContext must be an object");
  }
  const record = value as Record<string, unknown>;
  assertOptionalString(record.capturedAt, "joinContext.capturedAt");
  assertOptionalString(record.deviceId, "joinContext.deviceId");
  assertOptionalBoolean(record.forceJoin, "joinContext.forceJoin");
  if (!record.capturedAt || !record.deviceId || record.forceJoin === undefined) {
    throw new BadRequestError("joinContext.capturedAt, deviceId, and forceJoin are required");
  }
  return {
    capturedAt: record.capturedAt,
    deviceId: record.deviceId,
    forceJoin: record.forceJoin,
  };
}

function parseSignalControlRequest(body: unknown): {
  appControlId: string;
  appDataBase64?: string;
  streamerData?: string;
} {
  if (!body || typeof body !== "object") {
    throw new BadRequestError("Expected a JSON control payload");
  }

  const record = body as Record<string, unknown>;
  if (typeof record.appControlId !== "string" || record.appControlId.length === 0) {
    throw new BadRequestError("appControlId is required");
  }

  const appDataBase64 = record.appDataBase64;
  const streamerData = record.streamerData;
  assertOptionalBase64String(appDataBase64, "appDataBase64");
  assertOptionalString(streamerData, "streamerData");

  return {
    appControlId: record.appControlId,
    appDataBase64,
    streamerData,
  };
}

function assertOptionalBase64String(value: unknown, fieldName: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new BadRequestError(`${fieldName} must be a base64 string`);
  }
}

function parseSignalSoacRequest(body: unknown): {
  type: StreamerSoacType;
  clientId?: string;
  appControlId?: string;
  iceId?: string;
  sdp?: string;
  gzipSdp?: boolean;
  iceNetworkType?: StreamerIceNetworkType;
  candidate?: RemoteSignalSoacCandidate;
} {
  if (!body || typeof body !== "object") {
    throw new BadRequestError("Expected a JSON SOAC payload");
  }

  const record = body as Record<string, unknown>;
  if (!isStreamerSoacType(record.type)) {
    throw new BadRequestError(`type must be one of ${STREAMER_SOAC_TYPES.join(", ")}`);
  }

  assertOptionalString(record.clientId, "clientId");
  assertOptionalString(record.appControlId, "appControlId");
  assertOptionalString(record.iceId, "iceId");
  assertOptionalString(record.sdp, "sdp");
  assertOptionalStreamerIceNetworkType(record.iceNetworkType, "iceNetworkType");
  assertOptionalBoolean(record.gzipSdp, "gzipSdp");

  const candidate = parseOptionalSoacCandidate(record.candidate);
  if (record.type === "candidate" && !candidate) {
    throw new BadRequestError("candidate is required for SOAC candidate messages");
  }

  return {
    type: record.type,
    clientId: record.clientId,
    appControlId: record.appControlId,
    iceId: record.iceId,
    sdp: record.sdp,
    gzipSdp: record.gzipSdp,
    iceNetworkType: record.iceNetworkType,
    candidate,
  };
}

function isStreamerSoacType(value: unknown): value is StreamerSoacType {
  return typeof value === "string" && (STREAMER_SOAC_TYPES as readonly string[]).includes(value);
}

function assertOptionalString(value: unknown, fieldName: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new BadRequestError(`${fieldName} must be a string`);
  }
}

function assertOptionalBoolean(value: unknown, fieldName: string): asserts value is boolean | undefined {
  if (value !== undefined && typeof value !== "boolean") {
    throw new BadRequestError(`${fieldName} must be a boolean`);
  }
}

function assertOptionalNonNegativeInteger(value: unknown, fieldName: string): asserts value is number | undefined {
  if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
    throw new BadRequestError(`${fieldName} must be a non-negative integer`);
  }
}

function assertOptionalStreamerIceNetworkType(value: unknown, fieldName: string): asserts value is StreamerIceNetworkType | undefined {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isInteger(value) || !Object.values(STREAMER_ICE_NETWORK_TYPES).includes(value as StreamerIceNetworkType)) {
    throw new BadRequestError(`${fieldName} must be a known streamer ICE network type`);
  }
}

function parseOptionalSoacCandidate(value: unknown): RemoteSignalSoacCandidate | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") {
    throw new BadRequestError("candidate must be an object");
  }

  const record = value as Record<string, unknown>;
  if (typeof record.candidate !== "string" || record.candidate.length === 0) {
    throw new BadRequestError("candidate.candidate is required");
  }
  assertOptionalString(record.sdpMid, "candidate.sdpMid");
  if (record.sdpMLineIndex !== undefined) {
    if (!Number.isInteger(record.sdpMLineIndex)) {
      throw new BadRequestError("candidate.sdpMLineIndex must be an integer");
    }
  }

  return {
    candidate: record.candidate,
    sdpMid: record.sdpMid,
    sdpMLineIndex: record.sdpMLineIndex as number | undefined,
  };
}
