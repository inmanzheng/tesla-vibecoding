import { DurableObject } from "cloudflare:workers";
import {
  STREAMER_CONTROL_EVENT_ACK_TIMEOUT_MS,
  STREAMER_CONTROL_EVENT_NAME,
  STREAMER_SOAC_EVENT,
  analyzeRemoteSignalReadiness,
  buildStreamerSignalHeaders,
  normalizeStreamerSignalControlAck,
} from "@uurc/shared/streamerProtocol";
import {
  buildSignalGatewayControlPayload,
  buildSignalGatewaySoacPayloadAsync,
  createIdleSignalGatewayStatus,
  createSignalGatewayStatus,
  normalizeSignalGatewayInboundEventsAsync,
  normalizeSignalGatewayPayload,
  normalizeSignalGatewayRoomConfig,
  orderSignalGatewayServers,
  redactSignalGatewayToken,
  SIGNAL_GATEWAY_MAX_EVENTS,
  type AsyncSignalGatewayBinaryCodec,
} from "@uurc/shared/signalGatewayProtocol";
import type {
  RemoteSignalControlRequest,
  RemoteSignalControlResult,
  RemoteSignalGatewayEvent,
  RemoteSignalGatewayEventDirection,
  RemoteSignalGatewayStartRequest,
  RemoteSignalGatewayStatus,
  RemoteSignalSoacRequest,
  RemoteSignalSoacResult,
  StreamerRoomConfig,
} from "@uurc/shared/types";

const SOCKET_IO_NAMESPACE = "/";
const ENGINE_IO_OPEN = "0";
const ENGINE_IO_CLOSE = "1";
const ENGINE_IO_PING = "2";
const ENGINE_IO_PONG = "3";
const ENGINE_IO_MESSAGE = "4";
const ENGINE_IO_BINARY_FRAME_PREFIX = 0x04;

type JsonRecord = Record<string, unknown>;

type SignalSessionEnv = Record<string, never>;

interface EngineOpenPacket {
  sid?: string;
}

interface PendingAck {
  event: string;
  timeout: ReturnType<typeof setTimeout>;
  resolve(ack: unknown[]): void;
  reject(error: Error): void;
}

interface PendingBinaryPacket {
  packet: SocketIoPacket;
  buffers: Uint8Array[];
}

interface SocketIoPacket {
  type: number;
  namespace: string;
  attachments: number;
  id?: number;
  data?: unknown;
}

export class RemoteSignalSession extends DurableObject<SignalSessionEnv> {
  private socket: WebSocket | null = null;
  private connectionId: string | undefined;
  private status: RemoteSignalGatewayStatus | null = null;
  private rawHeaders: Record<string, string> = {};
  private nextAckId = 0;
  private pendingAcks = new Map<number, PendingAck>();
  private pendingBinaryPacket: PendingBinaryPacket | null = null;
  private manualClose = false;

  constructor(ctx: DurableObjectState, env: SignalSessionEnv) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS signal_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS signal_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          direction TEXT NOT NULL,
          event TEXT NOT NULL,
          received_at TEXT NOT NULL,
          payload_json TEXT NOT NULL
        );
      `);
      this.status = this.readStoredStatus() ?? createIdleSignalGatewayStatus();
      if (!this.readStoredStatus()) {
        this.writeStatus(this.status);
      }
    });
  }

  async getStatus(): Promise<RemoteSignalGatewayStatus> {
    const status = this.readStatus();
    if (status.status === "connected" && !this.socket) {
      return this.setStatus({
        ...status,
        status: "closed",
        updatedAt: new Date().toISOString(),
        error: "Worker instance has no active upstream signal socket; restart the signal gateway.",
      });
    }
    return status;
  }

  async getEvents(): Promise<RemoteSignalGatewayEvent[]> {
    return this.readEvents();
  }

  async getDiagnostics() {
    return analyzeRemoteSignalReadiness({
      events: this.readEvents(),
      signalStatus: await this.getStatus(),
    });
  }

  async start(input: RemoteSignalGatewayStartRequest = {}): Promise<RemoteSignalGatewayStatus> {
    const roomConfig = normalizeSignalGatewayRoomConfig(input.roomConfig);
    if (!roomConfig) {
      return this.setStatus({
        ...createIdleSignalGatewayStatus(),
        status: "error",
        updatedAt: new Date().toISOString(),
        error: "roomConfig with token and signalServers is required",
      });
    }

    await this.closeSocket();
    this.ctx.storage.sql.exec("DELETE FROM signal_events");
    this.pendingAcks.clear();
    this.pendingBinaryPacket = null;
    this.nextAckId = 0;

    const startedAt = new Date().toISOString();
    this.rawHeaders = buildStreamerSignalHeaders({
      token: roomConfig.token,
      gzipSdp: input.gzipSdp ?? true,
    });

    this.setStatus(createSignalGatewayStatus({
      status: "connecting",
      roomConfig,
      rawHeaders: this.rawHeaders,
      startedAt,
    }));

    let lastError: unknown;
    for (const signalServer of orderSignalGatewayServers(roomConfig.signalServers, input.signalServerIndex)) {
      try {
        await this.connectToSignalServer(signalServer, roomConfig, startedAt);
        return this.readStatus();
      } catch (error) {
        lastError = error;
        await this.closeSocket();
      }
    }

    return this.setStatus(createSignalGatewayStatus({
      status: "error",
      roomConfig,
      rawHeaders: this.rawHeaders,
      startedAt,
      error: redactSignalGatewayToken(errorMessage(lastError), roomConfig.token),
    }));
  }

  async stop(): Promise<RemoteSignalGatewayStatus> {
    await this.closeSocket();
    this.ctx.storage.sql.exec("DELETE FROM signal_events");
    return this.setStatus({
      ...createIdleSignalGatewayStatus(),
      status: "closed",
      updatedAt: new Date().toISOString(),
    });
  }

  async sendControl(input: RemoteSignalControlRequest): Promise<RemoteSignalControlResult | null> {
    if (!this.isConnected()) return null;

    const emittedAt = new Date().toISOString();
    const payload = buildSignalGatewayControlPayload(input, workerSignalGatewayBinary);
    this.recordEvent({ direction: "outbound", event: STREAMER_CONTROL_EVENT_NAME, payload: normalizeSignalGatewayPayload(payload, workerSignalGatewayBinary) });
    const ack = await this.emitWithAck(STREAMER_CONTROL_EVENT_NAME, payload, STREAMER_CONTROL_EVENT_ACK_TIMEOUT_MS);
    const normalizedAck = normalizeSignalGatewayPayload(ack, workerSignalGatewayBinary);
    const ackArray = Array.isArray(normalizedAck) ? normalizedAck : [normalizedAck];
    const result: RemoteSignalControlResult = {
      event: STREAMER_CONTROL_EVENT_NAME,
      ackStatus: typeof ackArray[0] === "string" ? ackArray[0] : undefined,
      ack: ackArray,
      control: normalizeStreamerSignalControlAck(ackArray),
      emittedAt,
      ackReceivedAt: new Date().toISOString(),
    };
    this.recordEvent({ direction: "inbound", event: `${STREAMER_CONTROL_EVENT_NAME}:ack`, payload: result.ack });
    return result;
  }

  async sendSoac(input: RemoteSignalSoacRequest): Promise<RemoteSignalSoacResult | null> {
    if (!this.isConnected()) return null;

    const emittedAt = new Date().toISOString();
    const payload = await buildSignalGatewaySoacPayloadAsync(input, workerSignalGatewayBinary);
    this.recordEvent({ direction: "outbound", event: STREAMER_SOAC_EVENT, payload: normalizeSignalGatewayPayload(payload, workerSignalGatewayBinary) });
    this.emitWithOptionalAck(STREAMER_SOAC_EVENT, payload, (ack) => {
      this.recordEvent({ direction: "inbound", event: `${STREAMER_SOAC_EVENT}:ack`, payload: normalizeSignalGatewayPayload(ack, workerSignalGatewayBinary) });
    });
    return {
      event: STREAMER_SOAC_EVENT,
      payload: normalizeSignalGatewayPayload(payload, workerSignalGatewayBinary),
      emittedAt,
    };
  }

  private async connectToSignalServer(signalServer: string, roomConfig: StreamerRoomConfig, startedAt: string): Promise<void> {
    const socket = await openSignalWebSocket(signalServer, this.rawHeaders, roomConfig.timeout);
    this.socket = socket;
    this.manualClose = false;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`signal socket connect timed out after ${roomConfig.timeout ?? 10000}ms`));
      }, roomConfig.timeout ?? 10000);

      const cleanup = () => {
        clearTimeout(timeout);
        socket.removeEventListener("message", onMessage);
        socket.removeEventListener("close", onCloseBeforeConnect);
        socket.removeEventListener("error", onErrorBeforeConnect);
      };
      const onMessage = (event: MessageEvent) => {
        void this.handleSocketMessage(event.data, {
          onConnected: () => {
            cleanup();
            resolve();
          },
          onConnectError: (error) => {
            cleanup();
            reject(error);
          },
        });
      };
      const onCloseBeforeConnect = (event: CloseEvent) => {
        cleanup();
        reject(new Error(`signal socket closed before connect code=${event.code} reason=${event.reason}`));
      };
      const onErrorBeforeConnect = () => {
        cleanup();
        reject(new Error("signal socket error before connect"));
      };

      socket.addEventListener("message", onMessage);
      socket.addEventListener("close", onCloseBeforeConnect);
      socket.addEventListener("error", onErrorBeforeConnect);
    });

    socket.addEventListener("message", (event) => {
      void this.handleSocketMessage(event.data);
    });
    socket.addEventListener("close", (event) => {
      this.handleSocketClose(event);
    });
    socket.addEventListener("error", () => {
      this.handleSocketError();
    });

    this.setStatus(createSignalGatewayStatus({
      status: "connected",
      roomConfig,
      rawHeaders: this.rawHeaders,
      startedAt,
      selectedSignalServer: signalServer,
      connectionId: this.connectionId,
    }));
  }

  private async handleSocketMessage(
    value: unknown,
    callbacks: { onConnected?: () => void; onConnectError?: (error: Error) => void } = {},
  ): Promise<void> {
    if (typeof value === "string") {
      await this.handleTextFrame(value, callbacks);
      return;
    }
    await this.handleBinaryFrame(await toBytes(value));
  }

  private async handleTextFrame(frame: string, callbacks: { onConnected?: () => void; onConnectError?: (error: Error) => void }): Promise<void> {
    if (frame.startsWith(ENGINE_IO_OPEN)) {
      const openPacket = parseEngineOpenPacket(frame.slice(1));
      this.connectionId = openPacket.sid;
      this.sendRaw(`${ENGINE_IO_MESSAGE}0`);
      return;
    }
    if (frame === ENGINE_IO_PING) {
      this.sendRaw(ENGINE_IO_PONG);
      return;
    }
    if (frame === ENGINE_IO_CLOSE) {
      await this.closeSocket();
      return;
    }
    if (!frame.startsWith(ENGINE_IO_MESSAGE)) return;

    const packet = parseSocketIoPacket(frame.slice(1));
    if (packet.type === 0) {
      const data = asRecord(packet.data);
      this.connectionId = typeof data?.sid === "string" ? data.sid : this.connectionId;
      callbacks.onConnected?.();
      return;
    }
    if (packet.type === 4) {
      callbacks.onConnectError?.(new Error(`socket.io connect error: ${safeJson(packet.data)}`));
      return;
    }
    if (packet.attachments > 0) {
      this.pendingBinaryPacket = { packet, buffers: [] };
      return;
    }
    await this.processSocketIoPacket(packet);
  }

  private async handleBinaryFrame(rawBytes: Uint8Array): Promise<void> {
    const bytes = stripEngineIoBinaryFramePrefix(rawBytes);
    const pending = this.pendingBinaryPacket;
    if (!pending) {
      this.recordEvent({
        direction: "inbound",
        event: "binary",
        payload: normalizeSignalGatewayPayload(bytes, workerSignalGatewayBinary),
      });
      return;
    }

    pending.buffers.push(bytes);
    if (pending.buffers.length < pending.packet.attachments) return;

    this.pendingBinaryPacket = null;
    await this.processSocketIoPacket({
      ...pending.packet,
      data: reconstructBinaryPlaceholders(pending.packet.data, pending.buffers),
    });
  }

  private async processSocketIoPacket(packet: SocketIoPacket): Promise<void> {
    if (packet.type === 2 || packet.type === 5) {
      await this.processSocketIoEvent(packet.data);
      return;
    }
    if (packet.type === 3 || packet.type === 6) {
      this.resolveAck(packet);
    }
  }

  private async processSocketIoEvent(data: unknown): Promise<void> {
    if (!Array.isArray(data) || typeof data[0] !== "string") return;
    const event = data[0];
    const payload = data.slice(1);
    for (const normalized of await normalizeSignalGatewayInboundEventsAsync(event, payload, workerSignalGatewayBinary)) {
      // 诊断：把入站信令事件打到 Workers Logs，便于定位卡死时是否伴随 leave / 切网通知 / 重协商。
      console.log(`[uurc-do] inbound ${normalized.event}`);
      this.recordEvent({
        direction: "inbound",
        event: normalized.event,
        payload: normalizeSignalGatewayPayload(normalized.payload, workerSignalGatewayBinary),
      });
    }
  }

  private resolveAck(packet: SocketIoPacket): void {
    if (packet.id === undefined) return;
    const pending = this.pendingAcks.get(packet.id);
    if (!pending) return;
    this.pendingAcks.delete(packet.id);
    clearTimeout(pending.timeout);
    pending.resolve(Array.isArray(packet.data) ? packet.data : [packet.data]);
  }

  private emitWithAck(event: string, payload: JsonRecord, ackTimeoutMs: number): Promise<unknown[]> {
    const ackId = this.emitSocketEvent(event, payload, true);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(ackId);
        reject(new Error(`signal event ${event} ack timed out after ${ackTimeoutMs}ms`));
      }, ackTimeoutMs);
      this.pendingAcks.set(ackId, { event, timeout, resolve, reject });
    });
  }

  private emitWithOptionalAck(event: string, payload: JsonRecord, onAck: (ack: unknown[]) => void): void {
    const ackId = this.emitSocketEvent(event, payload, true);
    const timeout = setTimeout(() => {
      this.pendingAcks.delete(ackId);
    }, STREAMER_CONTROL_EVENT_ACK_TIMEOUT_MS);
    this.pendingAcks.set(ackId, {
      event,
      timeout,
      resolve: (ack) => onAck(ack),
      reject: () => {},
    });
  }

  private emitSocketEvent(event: string, payload: JsonRecord, withAck: boolean): number {
    if (!this.socket) throw new Error("signal gateway socket is not connected");
    const ackId = withAck ? this.nextAckId++ : undefined;
    const deconstructed = deconstructBinary([event, payload]);
    const packetType = deconstructed.buffers.length > 0 ? 5 : 2;
    const encoded = encodeSocketIoPacket({
      type: packetType,
      namespace: SOCKET_IO_NAMESPACE,
      attachments: deconstructed.buffers.length,
      id: ackId,
      data: deconstructed.data,
    });
    this.sendRaw(`${ENGINE_IO_MESSAGE}${encoded}`);
    for (const buffer of deconstructed.buffers) {
      this.sendRaw(ensureEngineIoBinaryFramePrefix(buffer));
    }
    return ackId ?? -1;
  }

  private sendRaw(frame: string | Uint8Array): void {
    this.socket?.send(frame);
  }

  private handleSocketClose(event: CloseEvent): void {
    console.log(`[uurc-do] upstream socket close code=${event.code} reason=${event.reason} manual=${this.manualClose}`);
    for (const [id, pending] of this.pendingAcks) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`signal socket closed before ${pending.event} ack code=${event.code} reason=${event.reason}`));
      this.pendingAcks.delete(id);
    }
    this.socket = null;
    if (!this.manualClose) {
      const status = this.readStatus();
      if (status.status === "connected" || status.status === "connecting") {
        this.setStatus({
          ...status,
          status: "closed",
          updatedAt: new Date().toISOString(),
          error: `signal socket closed code=${event.code} reason=${event.reason}`,
        });
      }
    }
  }

  private handleSocketError(): void {
    console.log(`[uurc-do] upstream socket error`);
    const status = this.readStatus();
    if (status.status === "connected" || status.status === "connecting") {
      this.setStatus({
        ...status,
        status: "error",
        updatedAt: new Date().toISOString(),
        error: "signal socket error",
      });
    }
  }

  private async closeSocket(): Promise<void> {
    this.manualClose = true;
    for (const [id, pending] of this.pendingAcks) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("signal socket closed"));
      this.pendingAcks.delete(id);
    }
    if (this.socket) {
      try {
        if (this.isConnected()) this.socket.send(`${ENGINE_IO_MESSAGE}1`);
        this.socket.close(1000, "gateway stopped");
      } catch {
        // Best-effort close.
      }
    }
    this.socket = null;
    this.connectionId = undefined;
  }

  private isConnected(): boolean {
    return this.socket !== null && this.readStatus().status === "connected";
  }

  private readStatus(): RemoteSignalGatewayStatus {
    return this.status ?? this.readStoredStatus() ?? createIdleSignalGatewayStatus();
  }

  private readStoredStatus(): RemoteSignalGatewayStatus | null {
    const row = this.ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM signal_state WHERE key = ?", "status")
      .toArray()[0];
    if (!row?.value) return null;
    try {
      return JSON.parse(row.value) as RemoteSignalGatewayStatus;
    } catch {
      return null;
    }
  }

  private setStatus(status: RemoteSignalGatewayStatus): RemoteSignalGatewayStatus {
    this.status = status;
    this.writeStatus(status);
    return status;
  }

  private writeStatus(status: RemoteSignalGatewayStatus): void {
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO signal_state (key, value) VALUES (?, ?)",
      "status",
      JSON.stringify(status),
    );
  }

  private readEvents(): RemoteSignalGatewayEvent[] {
    return this.ctx.storage.sql
      .exec<{
        id: number;
        direction: RemoteSignalGatewayEventDirection;
        event: string;
        received_at: string;
        payload_json: string;
      }>(
        "SELECT id, direction, event, received_at, payload_json FROM signal_events ORDER BY id ASC LIMIT ?",
        SIGNAL_GATEWAY_MAX_EVENTS,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        direction: row.direction,
        event: row.event,
        receivedAt: row.received_at,
        payload: parseJson(row.payload_json),
      }));
  }

  private recordEvent(input: Omit<RemoteSignalGatewayEvent, "id" | "receivedAt">): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO signal_events (direction, event, received_at, payload_json) VALUES (?, ?, ?, ?)",
      input.direction,
      input.event,
      new Date().toISOString(),
      JSON.stringify(input.payload ?? null),
    );
    this.ctx.storage.sql.exec(
      "DELETE FROM signal_events WHERE id NOT IN (SELECT id FROM signal_events ORDER BY id DESC LIMIT ?)",
      SIGNAL_GATEWAY_MAX_EVENTS,
    );
  }
}

async function openSignalWebSocket(
  signalServer: string,
  headers: Record<string, string>,
  timeoutMs = 10000,
): Promise<WebSocket> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(buildEngineIoWebSocketUrl(signalServer), {
      headers: {
        ...headers,
        Upgrade: "websocket",
      },
      signal: controller.signal,
    });
    const socket = response.webSocket;
    if (!socket) {
      throw new Error(`server did not accept websocket status=${response.status}`);
    }
    socket.binaryType = "arraybuffer";
    socket.accept();
    return socket;
  } finally {
    clearTimeout(timeout);
  }
}

function buildEngineIoWebSocketUrl(signalServer: string): string {
  const url = new URL(signalServer);
  if (url.protocol === "ws:") url.protocol = "http:";
  if (url.protocol === "wss:") url.protocol = "https:";
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/socket.io/";
  } else if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  url.searchParams.set("EIO", "4");
  url.searchParams.set("transport", "websocket");
  return url.toString();
}

function parseEngineOpenPacket(value: string): EngineOpenPacket {
  try {
    const parsed = JSON.parse(value);
    return asRecord(parsed) ? parsed as EngineOpenPacket : {};
  } catch {
    return {};
  }
}

function parseSocketIoPacket(value: string): SocketIoPacket {
  const type = Number.parseInt(value[0] ?? "", 10);
  if (!Number.isInteger(type)) throw new Error(`invalid socket.io packet type: ${value}`);

  let offset = 1;
  let attachments = 0;
  if (type === 5 || type === 6) {
    const start = offset;
    while (isDigit(value[offset])) offset += 1;
    attachments = Number.parseInt(value.slice(start, offset), 10);
    if (value[offset] === "-") offset += 1;
  }

  let namespace = SOCKET_IO_NAMESPACE;
  if (value[offset] === "/") {
    const start = offset;
    while (offset < value.length && value[offset] !== ",") offset += 1;
    namespace = value.slice(start, offset);
    if (value[offset] === ",") offset += 1;
  }

  const idStart = offset;
  while (isDigit(value[offset])) offset += 1;
  const idText = value.slice(idStart, offset);
  const id = idText ? Number.parseInt(idText, 10) : undefined;
  const jsonText = value.slice(offset);
  const data = jsonText ? JSON.parse(jsonText) : undefined;
  return { type, namespace, attachments, id, data };
}

function encodeSocketIoPacket(packet: SocketIoPacket): string {
  let encoded = String(packet.type);
  if (packet.type === 5 || packet.type === 6) {
    encoded += `${packet.attachments}-`;
  }
  if (packet.namespace && packet.namespace !== SOCKET_IO_NAMESPACE) {
    encoded += `${packet.namespace},`;
  }
  if (packet.id !== undefined) encoded += String(packet.id);
  if (packet.data !== undefined) encoded += JSON.stringify(packet.data);
  return encoded;
}

function deconstructBinary(value: unknown): { data: unknown; buffers: Uint8Array[] } {
  const buffers: Uint8Array[] = [];
  const data = deconstructBinaryValue(value, buffers);
  return { data, buffers };
}

function deconstructBinaryValue(value: unknown, buffers: Uint8Array[]): unknown {
  const bytes = valueToBytes(value);
  if (bytes) {
    const num = buffers.length;
    buffers.push(bytes);
    return { _placeholder: true, num };
  }
  if (Array.isArray(value)) return value.map((item) => deconstructBinaryValue(item, buffers));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord).map(([key, item]) => [key, deconstructBinaryValue(item, buffers)]),
    );
  }
  return value;
}

function reconstructBinaryPlaceholders(value: unknown, buffers: Uint8Array[]): unknown {
  const record = asRecord(value);
  if (record && record._placeholder === true && typeof record.num === "number") {
    return buffers[record.num] ?? value;
  }
  if (Array.isArray(value)) return value.map((item) => reconstructBinaryPlaceholders(item, buffers));
  if (record) {
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, reconstructBinaryPlaceholders(item, buffers)]),
    );
  }
  return value;
}

async function gzipText(value: string): Promise<Uint8Array> {
  return transformBytes(new TextEncoder().encode(value), "gzip", "compress");
}

async function gunzipText(value: unknown): Promise<string | null> {
  const bytes = toSignalBytes(value);
  if (!bytes) return null;
  try {
    const decompressed = await transformBytes(bytes, "gzip", "decompress");
    return new TextDecoder().decode(decompressed);
  } catch {
    return null;
  }
}

async function transformBytes(
  bytes: Uint8Array,
  format: CompressionFormat,
  mode: "compress" | "decompress",
): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream();
  const transformed = mode === "compress"
    ? stream.pipeThrough(new CompressionStream(format))
    : stream.pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(transformed).arrayBuffer());
}

const workerSignalGatewayBinary: AsyncSignalGatewayBinaryCodec<Uint8Array> = {
  decodeBase64: decodeBase64Bytes,
  toBinary: toSignalBytes,
  byteLength: (value) => value.byteLength,
  encodeBase64: bytesToBase64,
  gzipText,
  gunzipText,
};

function ensureEngineIoBinaryFramePrefix(value: Uint8Array): Uint8Array {
  if (value[0] === ENGINE_IO_BINARY_FRAME_PREFIX) return value;
  const prefixed = new Uint8Array(value.byteLength + 1);
  prefixed[0] = ENGINE_IO_BINARY_FRAME_PREFIX;
  prefixed.set(value, 1);
  return prefixed;
}

function stripEngineIoBinaryFramePrefix(value: Uint8Array): Uint8Array {
  return value[0] === ENGINE_IO_BINARY_FRAME_PREFIX ? value.slice(1) : value;
}

function decodeBase64Bytes(value: string): Uint8Array {
  if (!value) return new Uint8Array();
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function toSignalBytes(value: unknown): Uint8Array | null {
  const bytes = valueToBytes(value);
  if (bytes) return bytes;
  const record = asRecord(value);
  if (record?.kind === "binary" && typeof record.base64 === "string") {
    return decodeBase64Bytes(record.base64);
  }
  return null;
}

function valueToBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

async function toBytes(value: unknown): Promise<Uint8Array> {
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  const bytes = valueToBytes(value);
  if (bytes) return bytes;
  throw new Error(`unsupported binary websocket frame: ${typeof value}`);
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDigit(value: string | undefined): boolean {
  return value !== undefined && value >= "0" && value <= "9";
}

export const __signalSessionTest = {
  buildEngineIoWebSocketUrl,
  decodeBase64Bytes,
  deconstructBinary,
  encodeSocketIoPacket,
  ensureEngineIoBinaryFramePrefix,
  parseSocketIoPacket,
  stripEngineIoBinaryFramePrefix,
};
