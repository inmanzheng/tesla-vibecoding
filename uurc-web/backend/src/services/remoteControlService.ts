import { gzipSync, gunzipSync } from "node:zlib";

import {
  STREAMER_CONTROLLER_INBOUND_SOAC_TYPES,
  STREAMER_CONTROLLER_SIGNAL_EVENTS,
  STREAMER_CONTROL_EVENT_ACK_TIMEOUT_MS,
  STREAMER_CONTROL_EVENT_NAME,
  STREAMER_SIGNAL_SOCKET_EVENTS,
  STREAMER_SOAC_EVENT,
  buildStreamerSignalHeaders,
  buildSignalGatewayControlPayload,
  buildSignalGatewaySoacPayload,
  createIdleSignalGatewayStatus,
  createSignalGatewayStatus,
  createRemoteControlBootstrap,
  redact,
  analyzeRemoteSignalReadiness,
  normalizeSignalGatewayInboundEvents,
  normalizeSignalGatewayPayload,
  normalizeStreamerSignalControlAck,
  orderSignalGatewayServers,
  redactSignalGatewayToken,
  SIGNAL_GATEWAY_MAX_EVENTS,
  type SignalGatewayBinaryCodec,
  type RoomJoinUpstreamSummary,
  type RemoteControlBootstrap,
  type RemoteSignalControlRequest,
  type RemoteSignalControlResult,
  type RemoteSignalGatewayEvent,
  type RemoteSignalGatewayEventDirection,
  type RemoteSignalGatewayStartRequest,
  type RemoteSignalGatewayStatus,
  type RemoteRoomJoinContext,
  type RemoteSignalReadinessDiagnostics,
  type RemoteSignalSoacRequest,
  type RemoteSignalSoacResult,
  type StreamerRoomConfig,
} from "@uurc/shared";
import { io, type Socket } from "socket.io-client";

type RoomConfigSource = {
  getLatestRoomConfig(): Promise<StreamerRoomConfig | null>;
  getLatestJoinContext?(): Promise<RemoteRoomJoinContext | null>;
  clearByDevice?(input: { deviceId: string }): Promise<RoomJoinUpstreamSummary>;
};

export interface SignalGatewayConnectOptions {
  signalServer: string;
  signalServers: string[];
  headers: Record<string, string>;
  timeoutMs?: number;
  reconnectDelayMs?: number;
  inboundEvents: readonly string[];
  socketEvents: Record<string, string>;
  controlEvent: string;
  onSignalEvent(event: string, payload: unknown[]): void;
}

export interface SignalGatewayConnection {
  id?: string;
  close(): void;
  emit(event: string, payload: object): Promise<void>;
  emitWithAck(event: string, payload: Record<string, unknown>, ackTimeoutMs: number): Promise<unknown[]>;
  emitWithOptionalAck(event: string, payload: Record<string, unknown>, onAck: (ack: unknown[]) => void): Promise<void>;
}

export interface SignalGatewayConnector {
  connect(options: SignalGatewayConnectOptions): Promise<SignalGatewayConnection>;
}

type SocketIoClientFactory = (signalServer: string, options: Parameters<typeof io>[1]) => Socket;

export class RemoteControlService {
  private signalConnection: SignalGatewayConnection | null = null;
  private signalStatus: RemoteSignalGatewayStatus = createIdleSignalGatewayStatus();
  private signalEvents: RemoteSignalGatewayEvent[] = [];
  private nextSignalEventId = 1;
  private activeJoinContext: RemoteRoomJoinContext | null = null;

  constructor(
    private readonly roomConfigSource?: RoomConfigSource,
    private readonly signalConnector: SignalGatewayConnector = new SocketIoSignalGatewayConnector(),
  ) {}

  async createBootstrap(): Promise<RemoteControlBootstrap | null> {
    const roomConfig = await this.roomConfigSource?.getLatestRoomConfig();
    if (!roomConfig) return null;

    const joinContext = await this.roomConfigSource?.getLatestJoinContext?.();
    return createRemoteControlBootstrap({ roomConfig, joinContext });
  }

  getSignalGatewayStatus(): RemoteSignalGatewayStatus {
    return this.signalStatus;
  }

  getSignalGatewayEvents(): RemoteSignalGatewayEvent[] {
    return this.signalEvents;
  }

  getSignalReadinessDiagnostics(): RemoteSignalReadinessDiagnostics {
    return analyzeRemoteSignalReadiness({
      events: this.signalEvents,
      signalStatus: this.signalStatus,
    });
  }

  async startSignalGateway(input: RemoteSignalGatewayStartRequest = {}): Promise<RemoteSignalGatewayStatus | null> {
    const roomConfig = input.roomConfig ?? await this.roomConfigSource?.getLatestRoomConfig();
    if (!roomConfig) return null;
    this.activeJoinContext = input.joinContext ?? await this.roomConfigSource?.getLatestJoinContext?.() ?? null;

    this.signalConnection?.close();
    this.signalConnection = null;
    this.signalEvents = [];
    this.nextSignalEventId = 1;

    const startedAt = new Date().toISOString();
    const rawHeaders = buildStreamerSignalHeaders({ token: roomConfig.token, gzipSdp: input.gzipSdp ?? true });
    this.signalStatus = createSignalGatewayStatus({
      status: "connecting",
      roomConfig,
      rawHeaders,
      startedAt,
    });

    let lastError: unknown;
    for (const signalServer of orderSignalGatewayServers(roomConfig.signalServers, input.signalServerIndex)) {
      try {
        const connection = await this.signalConnector.connect({
          signalServer,
          signalServers: roomConfig.signalServers,
          headers: rawHeaders,
          timeoutMs: roomConfig.timeout,
          reconnectDelayMs: roomConfig.signalReconnectDelay,
          inboundEvents: [
            ...STREAMER_CONTROLLER_SIGNAL_EVENTS,
            ...STREAMER_CONTROLLER_INBOUND_SOAC_TYPES,
            "switch_network_notify",
          ],
          socketEvents: STREAMER_SIGNAL_SOCKET_EVENTS,
          controlEvent: STREAMER_CONTROL_EVENT_NAME,
          onSignalEvent: (event, payload) => {
            for (const normalized of normalizeSignalGatewayInboundEvents(event, payload, nodeSignalGatewayBinary)) {
              this.recordSignalEvent({
                direction: "inbound",
                event: normalized.event,
                payload: normalized.payload,
              });
            }
          },
        });
        this.signalConnection = connection;
        this.signalStatus = createSignalGatewayStatus({
          status: "connected",
          roomConfig,
          rawHeaders,
          startedAt,
          connectionId: connection.id,
          selectedSignalServer: signalServer,
        });
        return this.signalStatus;
      } catch (error) {
        lastError = error;
        this.signalConnection?.close();
        this.signalConnection = null;
      }
    }

    this.signalStatus = createSignalGatewayStatus({
      status: "error",
      roomConfig,
      rawHeaders,
      startedAt,
      error: redactSignalGatewayToken(lastError instanceof Error ? lastError.message : String(lastError), roomConfig.token),
    });
    return this.signalStatus;
  }

  async sendSignalControl(input: RemoteSignalControlRequest): Promise<RemoteSignalControlResult | null> {
    if (!this.signalConnection) return null;

    const emittedAt = new Date().toISOString();
    const payload = buildSignalGatewayControlPayload(input, nodeSignalGatewayBinary);
    this.recordSignalEvent({
      direction: "outbound",
      event: STREAMER_CONTROL_EVENT_NAME,
      payload,
    });
    const ack = await this.signalConnection.emitWithAck(
      STREAMER_CONTROL_EVENT_NAME,
      payload,
      STREAMER_CONTROL_EVENT_ACK_TIMEOUT_MS,
    );
    const normalizedAck = normalizeSignalGatewayPayload(ack, nodeSignalGatewayBinary);
    const ackStatus = Array.isArray(normalizedAck) && typeof normalizedAck[0] === "string" ? normalizedAck[0] : undefined;
    const result: RemoteSignalControlResult = {
      event: STREAMER_CONTROL_EVENT_NAME,
      ackStatus,
      ack: Array.isArray(normalizedAck) ? normalizedAck : [normalizedAck],
      control: normalizeStreamerSignalControlAck(normalizedAck),
      emittedAt,
      ackReceivedAt: new Date().toISOString(),
    };
    this.recordSignalEvent({
      direction: "inbound",
      event: `${STREAMER_CONTROL_EVENT_NAME}:ack`,
      payload: result.ack,
    });
    return result;
  }

  async sendSignalSoac(input: RemoteSignalSoacRequest): Promise<RemoteSignalSoacResult | null> {
    if (!this.signalConnection) return null;

    const emittedAt = new Date().toISOString();
    const payload = buildSignalGatewaySoacPayload(input, nodeSignalGatewayBinary);
    this.recordSignalEvent({
      direction: "outbound",
      event: STREAMER_SOAC_EVENT,
      payload,
    });
    await this.signalConnection.emitWithOptionalAck(STREAMER_SOAC_EVENT, payload, (ack) => {
      this.recordSignalEvent({
        direction: "inbound",
        event: `${STREAMER_SOAC_EVENT}:ack`,
        payload: ack,
      });
    });
    return {
      event: STREAMER_SOAC_EVENT,
      payload: normalizeSignalGatewayPayload(payload, nodeSignalGatewayBinary),
      emittedAt,
    };
  }

  async stopSignalGateway(): Promise<RemoteSignalGatewayStatus> {
    const joinContext = this.activeJoinContext ?? await this.roomConfigSource?.getLatestJoinContext?.();
    this.signalConnection?.close();
    this.signalConnection = null;

    this.signalStatus = {
      ...this.signalStatus,
      status: "closed",
      connectionId: undefined,
      roomClear: undefined,
      roomClearError: undefined,
      updatedAt: new Date().toISOString(),
    };
    if (joinContext?.deviceId && this.roomConfigSource?.clearByDevice) {
      try {
        this.signalStatus = {
          ...this.signalStatus,
          roomClear: await this.roomConfigSource.clearByDevice({ deviceId: joinContext.deviceId }),
          updatedAt: new Date().toISOString(),
        };
      } catch (error) {
        this.signalStatus = {
          ...this.signalStatus,
          roomClearError: String(redact(error instanceof Error ? error.message : error)),
          updatedAt: new Date().toISOString(),
        };
      }
    }
    return this.signalStatus;
  }

  private recordSignalEvent(input: {
    direction: RemoteSignalGatewayEventDirection;
    event: string;
    payload: unknown;
  }): RemoteSignalGatewayEvent {
    const record: RemoteSignalGatewayEvent = {
      id: this.nextSignalEventId++,
      direction: input.direction,
      event: input.event,
      receivedAt: new Date().toISOString(),
      payload: normalizeSignalGatewayPayload(input.payload, nodeSignalGatewayBinary),
    };
    this.signalEvents = [...this.signalEvents, record].slice(-SIGNAL_GATEWAY_MAX_EVENTS);
    console.log(`signal event ${summarizeSignalEventForLog(record)}`);
    return record;
  }
}

export class SocketIoSignalGatewayConnector implements SignalGatewayConnector {
  constructor(private readonly socketFactory: SocketIoClientFactory = io) {}

  async connect(options: SignalGatewayConnectOptions): Promise<SignalGatewayConnection> {
    return new Promise((resolve, reject) => {
      const socket = this.socketFactory(options.signalServer, {
        autoConnect: false,
        extraHeaders: options.headers,
        forceNew: true,
        reconnection: true,
        reconnectionDelay: options.reconnectDelayMs,
        timeout: options.timeoutMs,
        transports: ["websocket"],
      });
      let settled = false;

      const cleanup = () => {
        socket.off("connect", onConnect);
        socket.off("connect_error", onConnectError);
      };
      const onConnect = () => {
        if (settled) return;
        settled = true;
        cleanup();
        installEngineIoBinaryFrameInterop(socket);
        resolve(new SocketIoSignalGatewayConnection(socket));
      };
      const onConnectError = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        socket.disconnect();
        reject(error);
      };

      const inboundEvents = new Set<string>([
        ...options.inboundEvents,
        ...Object.values(options.socketEvents),
      ]);
      for (const event of inboundEvents) {
        socket.on(event, (...payload: unknown[]) => {
          options.onSignalEvent(event, payload);
        });
      }
      socket.onAny((event, ...payload: unknown[]) => {
        if (inboundEvents.has(event) || isSocketIoLifecycleEvent(event)) return;
        options.onSignalEvent(event, payload);
      });
      installSocketLifecycleLogging(socket, options.signalServer);
      socket.once("connect", onConnect);
      socket.once("connect_error", onConnectError);
      socket.connect();
    });
  }
}

function isSocketIoLifecycleEvent(event: string): boolean {
  return event === "connect" || event === "connect_error" || event === "disconnect" || event === "disconnecting";
}

class SocketIoSignalGatewayConnection implements SignalGatewayConnection {
  constructor(private readonly socket: Socket) {
    installEngineIoBinaryFrameInterop(this.socket);
    this.socket.on("connect", () => installEngineIoBinaryFrameInterop(this.socket));
  }

  get id(): string | undefined {
    return this.socket.id;
  }

  close(): void {
    this.socket.disconnect();
  }

  async emitWithAck(event: string, payload: Record<string, unknown>, ackTimeoutMs: number): Promise<unknown[]> {
    if (!this.socket.connected) {
      throw new Error("signal gateway socket is not connected");
    }

    installEngineIoBinaryFrameInterop(this.socket);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`signal event ${event} ack timed out after ${ackTimeoutMs}ms`));
      }, ackTimeoutMs);

      this.socket.emit(event, payload, (...ack: unknown[]) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ack);
      });
    });
  }

  async emit(event: string, payload: object): Promise<void> {
    if (!this.socket.connected) {
      throw new Error("signal gateway socket is not connected");
    }

    installEngineIoBinaryFrameInterop(this.socket);
    this.socket.emit(event, payload);
  }

  async emitWithOptionalAck(event: string, payload: Record<string, unknown>, onAck: (ack: unknown[]) => void): Promise<void> {
    if (!this.socket.connected) {
      throw new Error("signal gateway socket is not connected");
    }

    installEngineIoBinaryFrameInterop(this.socket);
    this.socket.emit(event, payload, (...ack: unknown[]) => onAck(ack));
  }
}

const engineIoBinaryFramePrefix = 0x04;
const binarySendPatchSymbol = Symbol("uurc.engineIoBinarySendPatch");
const binaryOnDataPatchSymbol = Symbol("uurc.engineIoBinaryOnDataPatch");

type BinaryFramePatchableFunction = ((data: unknown, ...args: unknown[]) => unknown) & {
  [binarySendPatchSymbol]?: boolean;
  [binaryOnDataPatchSymbol]?: boolean;
};

type BinaryFramePatchableTransport = {
  ws?: {
    send?: BinaryFramePatchableFunction;
  };
  onData?: BinaryFramePatchableFunction;
};

type SocketWithEngineTransport = Socket & {
  io?: {
    engine?: {
      transport?: BinaryFramePatchableTransport;
    };
  };
};

function installEngineIoBinaryFrameInterop(socket: Socket): void {
  const transport = (socket as SocketWithEngineTransport).io?.engine?.transport;
  if (!transport) return;

  const ws = transport.ws;
  if (ws?.send && !ws.send[binarySendPatchSymbol]) {
    const rawSend = ws.send;
    const patchedSend: BinaryFramePatchableFunction = function patchedEngineIoBinarySend(
      this: typeof ws,
      data: unknown,
      ...args: unknown[]
    ) {
      return rawSend.call(this, ensureEngineIoBinaryFramePrefix(data), ...args);
    };
    patchedSend[binarySendPatchSymbol] = true;
    ws.send = patchedSend;
  }

  if (transport.onData && !transport.onData[binaryOnDataPatchSymbol]) {
    const rawOnData = transport.onData;
    const patchedOnData: BinaryFramePatchableFunction = function patchedEngineIoBinaryOnData(
      this: BinaryFramePatchableTransport,
      data: unknown,
      ...args: unknown[]
    ) {
      return rawOnData.call(this, stripEngineIoBinaryFramePrefix(data), ...args);
    };
    patchedOnData[binaryOnDataPatchSymbol] = true;
    transport.onData = patchedOnData;
  }
}

function ensureEngineIoBinaryFramePrefix(value: unknown): unknown {
  const buffer = toBinaryFrameBuffer(value);
  if (!buffer) return value;
  if (buffer[0] === engineIoBinaryFramePrefix) return value;
  return Buffer.concat([Buffer.from([engineIoBinaryFramePrefix]), buffer]);
}

function stripEngineIoBinaryFramePrefix(value: unknown): unknown {
  const buffer = toBinaryFrameBuffer(value);
  if (!buffer || buffer[0] !== engineIoBinaryFramePrefix) return value;
  return buffer.subarray(1);
}

function toBinaryFrameBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

const nodeSignalGatewayBinary: SignalGatewayBinaryCodec<Buffer> = {
  decodeBase64: (value) => Buffer.from(value ?? "", "base64"),
  toBinary: toSignalBuffer,
  byteLength: (value) => value.byteLength,
  encodeBase64: (value) => value.toString("base64"),
  gzipText: (value) => gzipSync(Buffer.from(value, "utf8"), { level: 6 }),
  gunzipText: (value) => {
    const buffer = toSignalBuffer(value);
    if (!buffer) return null;
    try {
      return gunzipSync(buffer).toString("utf8");
    } catch {
      return null;
    }
  },
};

function toSignalBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  if (record.kind === "binary" && typeof record.base64 === "string") {
    return Buffer.from(record.base64, "base64");
  }
  return null;
}

function installSocketLifecycleLogging(socket: Socket, signalServer: string): void {
  socket.on("connect", () => {
    console.log(`signal socket connect server=${signalServer} id=${socket.id ?? "<no id>"}`);
  });
  socket.on("disconnect", (reason: unknown, description: unknown) => {
    const parts = [`reason=${formatLifecycleValue(reason)}`];
    if (description !== undefined) parts.push(`description=${formatLifecycleValue(description)}`);
    console.log(`signal socket disconnect server=${signalServer} ${parts.join(" ")}`);
  });
  socket.on("connect_error", (error: unknown) => {
    console.log(`signal socket connect_error server=${signalServer} ${formatLifecycleValue(error)}`);
  });
  const manager = (socket as Socket & { io?: unknown }).io;
  if (manager && typeof manager === "object" && "on" in manager && typeof (manager as { on: unknown }).on === "function") {
    const on = (manager as { on: (event: string, listener: (...args: unknown[]) => void) => void }).on.bind(manager);
    on("reconnect_attempt", (attempt: unknown) => {
      console.log(`signal manager reconnect_attempt server=${signalServer} attempt=${formatLifecycleValue(attempt)}`);
    });
    on("reconnect", (attempt: unknown) => {
      console.log(`signal manager reconnect server=${signalServer} attempt=${formatLifecycleValue(attempt)}`);
    });
    on("reconnect_error", (error: unknown) => {
      console.log(`signal manager reconnect_error server=${signalServer} ${formatLifecycleValue(error)}`);
    });
    on("reconnect_failed", () => {
      console.log(`signal manager reconnect_failed server=${signalServer}`);
    });
  }
}

function formatLifecycleValue(value: unknown): string {
  if (value === undefined) return "<undefined>";
  if (value === null) return "<null>";
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeSignalEventForLog(record: RemoteSignalGatewayEvent): string {
  const segments: string[] = [`#${record.id}`, record.direction, record.event];
  const items = Array.isArray(record.payload) ? record.payload : [record.payload];
  for (const item of items) {
    const summary = describeSignalLogItem(item);
    if (summary) segments.push(summary);
  }
  return segments.join(" ");
}

function describeSignalLogItem(item: unknown): string | null {
  if (typeof item === "string") return `ack=${item}`;
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;

  const record = item as Record<string, unknown>;
  const parts: string[] = [];
  pushLogField(parts, "appControlId", record.app_control_id);
  pushLogField(parts, "clientId", record.client_id);

  const data = record.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const inner = data as Record<string, unknown>;
    pushLogField(parts, "type", inner.type);
    pushLogField(parts, "iceId", inner.ice_id);
    pushLogField(parts, "reason", inner.reason);
    if (typeof inner.sdp === "string") parts.push(`sdpLen=${inner.sdp.length}`);
    const candidate = inner.candidate;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const candidateStr = (candidate as Record<string, unknown>).candidate;
      if (typeof candidateStr === "string") {
        const typMatch = /typ\s+(\S+)/.exec(candidateStr);
        if (typMatch) parts.push(`cand=${typMatch[1]}`);
      }
    }
  } else {
    pushLogField(parts, "type", record.type);
    pushLogField(parts, "iceId", record.ice_id);
    pushLogField(parts, "reason", record.reason);
  }
  return parts.length ? parts.join(" ") : null;
}

function pushLogField(parts: string[], label: string, value: unknown): void {
  if (typeof value === "string" && value.length > 0) parts.push(`${label}=${value}`);
}
