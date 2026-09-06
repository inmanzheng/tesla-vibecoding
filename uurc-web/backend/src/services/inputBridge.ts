import { randomBytes } from "node:crypto";

export const INPUT_BRIDGE_TTL_MS = 15 * 60 * 1000;
export const INPUT_BRIDGE_MAX_TEXT_CHARS = 4000;
export const INPUT_BRIDGE_MIN_TEXT_INTERVAL_MS = 200;
export const INPUT_BRIDGE_MAX_PENDING = 120;
export const INPUT_BRIDGE_MAX_APPS = 80;
export const INPUT_BRIDGE_MAX_CUA_RESULTS = 20;
export const INPUT_BRIDGE_AGENT_ONLINE_MS = 35_000;
export const ACTIVE_BRIDGE_ID = "active";
const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export const INPUT_BRIDGE_SHORTCUTS = [
  "enter",
  "escape",
  "mac-prev-desktop",
  "mac-next-desktop",
  "mac-mission-control",
  "mac-show-desktop",
  "mac-spotlight",
  "mac-cmd-tab",
  "mac-minimize",
  "mac-fullscreen-toggle",
  "mac-lock-screen",
  "mac-launchpad",
  "mac-cmd-c",
  "mac-cmd-v",
  "mac-cmd-z",
  "mac-cmd-w",
  "mac-hide-app",
] as const;

export type InputBridgeShortcutId = (typeof INPUT_BRIDGE_SHORTCUTS)[number];

export type CuaIntentKind = "launch" | "activate" | "shortcut" | "type" | "unknown";

export interface CuaIntent {
  kind: CuaIntentKind;
  name?: string;
  bundleId?: string;
  id?: InputBridgeShortcutId;
  text?: string;
}

export interface CuaAppInfo {
  name: string;
  bundleId?: string;
  pid?: number;
  running: boolean;
  active: boolean;
}

export interface CuaTaskResult {
  id: string;
  text: string;
  ok: boolean;
  detail: string;
  at: number;
}

export type InputBridgeCarEvent =
  | { type: "text"; text: string }
  | { type: "move"; dx: number; dy: number }
  | { type: "click"; button: "primary" | "secondary" }
  | { type: "scroll"; deltaX: number; deltaY: number }
  | { type: "shortcut"; id: InputBridgeShortcutId };

export type InputBridgeAgentEvent =
  | { type: "activate"; name?: string; bundleId?: string; pid?: number }
  | { type: "launch"; name?: string; bundleId?: string }
  | { type: "cua"; text: string; intent: CuaIntent };

export type InputBridgeEvent = InputBridgeCarEvent | InputBridgeAgentEvent;

export interface InputBridgeSessionInfo {
  id: string;
  expiresAt: number;
  apps: CuaAppInfo[];
  frontmost: string;
  agentOnline: boolean;
  cuaResults: CuaTaskResult[];
}

export interface InputBridgePushResult {
  ok: true;
}

export interface InputBridgeNextResult {
  events: InputBridgeCarEvent[];
  text: string | null;
  timedOut: boolean;
}

export interface InputBridgeAgentNextResult {
  events: InputBridgeAgentEvent[];
  timedOut: boolean;
}

export interface InputBridgeAgentReport {
  apps?: CuaAppInfo[];
  frontmost?: string;
  results?: CuaTaskResult[];
}

export class InputBridgeError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface BridgeSession {
  expiresAt: number;
  pending: InputBridgeCarEvent[];
  agentPending: InputBridgeAgentEvent[];
  lastTextAt: number;
  waiters: Array<(events: InputBridgeCarEvent[] | null) => void>;
  agentWaiters: Array<(events: InputBridgeAgentEvent[] | null) => void>;
  apps: CuaAppInfo[];
  frontmost: string;
  agentSeenAt: number;
  cuaResults: CuaTaskResult[];
}

export function createInputBridgeId(bytes = randomBytes(8)): string {
  let id = "";
  for (const byte of bytes) {
    id += ID_ALPHABET[byte % ID_ALPHABET.length];
  }
  return id;
}

export function isAgentBridgeEvent(event: InputBridgeEvent): event is InputBridgeAgentEvent {
  return event.type === "activate" || event.type === "launch" || event.type === "cua";
}

export function parseInputBridgeEvents(body: unknown): InputBridgeEvent[] {
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!record) throw new InputBridgeError(400, "请求格式不正确");
  if (Array.isArray(record.events)) {
    const events = record.events.map((item) => normalizeEvent(item));
    if (events.length === 0) throw new InputBridgeError(400, "没有可发送的内容");
    return events;
  }
  if (typeof record.text === "string") return [normalizeEvent({ type: "text", text: record.text })];
  return [normalizeEvent(record)];
}

export function parseAgentReport(body: unknown): InputBridgeAgentReport {
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!record) throw new InputBridgeError(400, "上报格式不正确");
  const report: InputBridgeAgentReport = {};
  if (record.apps !== undefined) {
    if (!Array.isArray(record.apps)) throw new InputBridgeError(400, "应用列表格式不正确");
    report.apps = record.apps.slice(0, INPUT_BRIDGE_MAX_APPS).map(normalizeApp);
  }
  if (record.frontmost !== undefined) {
    report.frontmost = typeof record.frontmost === "string" ? record.frontmost.slice(0, 120) : "";
  }
  if (record.results !== undefined) {
    if (!Array.isArray(record.results)) throw new InputBridgeError(400, "结果列表格式不正确");
    report.results = record.results.slice(0, INPUT_BRIDGE_MAX_CUA_RESULTS).map(normalizeResult);
  }
  return report;
}

export function createInputBridgeStore(now: () => number = Date.now) {
  const sessions = new Map<string, BridgeSession>();

  function gc(): void {
    const current = now();
    for (const [id, session] of sessions) {
      if (session.expiresAt <= current) {
        finishWaiters(session.waiters, null);
        finishWaiters(session.agentWaiters, null);
        sessions.delete(id);
      }
    }
  }

  function requireSession(id: string): BridgeSession {
    gc();
    const session = sessions.get(id);
    if (!session) {
      throw new InputBridgeError(404, "配对已过期或码不正确");
    }
    return session;
  }

  function toInfo(id: string, session: BridgeSession): InputBridgeSessionInfo {
    return {
      id,
      expiresAt: session.expiresAt,
      apps: session.apps,
      frontmost: session.frontmost,
      agentOnline: session.agentSeenAt > 0 && now() - session.agentSeenAt < INPUT_BRIDGE_AGENT_ONLINE_MS,
      cuaResults: session.cuaResults,
    };
  }

  function touch(session: BridgeSession): void {
    session.expiresAt = now() + INPUT_BRIDGE_TTL_MS;
  }

  function createSession(): BridgeSession {
    return {
      expiresAt: now() + INPUT_BRIDGE_TTL_MS,
      pending: [],
      agentPending: [],
      lastTextAt: 0,
      waiters: [],
      agentWaiters: [],
      apps: [],
      frontmost: "",
      agentSeenAt: 0,
      cuaResults: [],
    };
  }

  return {
    create(): InputBridgeSessionInfo {
      gc();
      const existing = sessions.get(ACTIVE_BRIDGE_ID);
      if (existing) {
        finishWaiters(existing.waiters, null);
        finishWaiters(existing.agentWaiters, null);
      }
      const session = createSession();
      sessions.set(ACTIVE_BRIDGE_ID, session);
      return toInfo(ACTIVE_BRIDGE_ID, session);
    },

    ensure(): InputBridgeSessionInfo {
      gc();
      const existing = sessions.get(ACTIVE_BRIDGE_ID);
      if (existing) {
        touch(existing);
        return toInfo(ACTIVE_BRIDGE_ID, existing);
      }
      const session = createSession();
      sessions.set(ACTIVE_BRIDGE_ID, session);
      return toInfo(ACTIVE_BRIDGE_ID, session);
    },

    peek(id: string): InputBridgeSessionInfo {
      const session = requireSession(id);
      touch(session);
      return toInfo(id, session);
    },

    push(id: string, incoming: InputBridgeEvent[]): InputBridgePushResult {
      const session = requireSession(id);
      if (incoming.length === 0) throw new InputBridgeError(400, "没有可发送的内容");
      const current = now();
      const hasText = incoming.some((event) => event.type === "text" || event.type === "cua");
      if (hasText && current - session.lastTextAt < INPUT_BRIDGE_MIN_TEXT_INTERVAL_MS) {
        throw new InputBridgeError(429, "发送太快，请稍后再试");
      }
      if (hasText) session.lastTextAt = current;
      touch(session);

      const carEvents = incoming.filter((event): event is InputBridgeCarEvent => !isAgentBridgeEvent(event));
      const agentEvents = incoming.filter(isAgentBridgeEvent);

      if (carEvents.length > 0) {
        const waiter = session.waiters.shift();
        if (waiter) waiter(carEvents);
        else {
          for (const event of carEvents) enqueueCarEvent(session.pending, event);
          if (session.pending.length > INPUT_BRIDGE_MAX_PENDING) {
            session.pending.splice(0, session.pending.length - INPUT_BRIDGE_MAX_PENDING);
          }
        }
      }

      if (agentEvents.length > 0) {
        const waiter = session.agentWaiters.shift();
        if (waiter) waiter(agentEvents);
        else {
          session.agentPending.push(...agentEvents);
          if (session.agentPending.length > INPUT_BRIDGE_MAX_PENDING) {
            session.agentPending.splice(0, session.agentPending.length - INPUT_BRIDGE_MAX_PENDING);
          }
        }
      }

      return { ok: true };
    },

    next(id: string, waitMs: number): Promise<InputBridgeNextResult> {
      const session = requireSession(id);
      touch(session);
      if (session.pending.length > 0) {
        const events = session.pending.splice(0);
        return Promise.resolve(toNextResult(events, false));
      }
      const timeoutMs = Math.min(Math.max(waitMs, 0), 25_000);
      return new Promise((resolve) => {
        let settled = false;
        const finish = (events: InputBridgeCarEvent[] | null, timedOut: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          session.waiters = session.waiters.filter((waiter) => waiter !== onEvents);
          resolve(toNextResult(events ?? [], timedOut));
        };
        const onEvents = (events: InputBridgeCarEvent[] | null) => finish(events, false);
        const timer = setTimeout(() => finish(null, true), timeoutMs);
        session.waiters.push(onEvents);
      });
    },

    agentNext(id: string, waitMs: number): Promise<InputBridgeAgentNextResult> {
      const session = requireSession(id);
      session.agentSeenAt = now();
      touch(session);
      if (session.agentPending.length > 0) {
        const events = session.agentPending.splice(0);
        return Promise.resolve({ events, timedOut: false });
      }
      const timeoutMs = Math.min(Math.max(waitMs, 0), 25_000);
      return new Promise((resolve) => {
        let settled = false;
        const finish = (events: InputBridgeAgentEvent[] | null, timedOut: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          session.agentWaiters = session.agentWaiters.filter((waiter) => waiter !== onEvents);
          resolve({ events: events ?? [], timedOut });
        };
        const onEvents = (events: InputBridgeAgentEvent[] | null) => finish(events, false);
        const timer = setTimeout(() => finish(null, true), timeoutMs);
        session.agentWaiters.push(onEvents);
      });
    },

    reportAgent(id: string, report: InputBridgeAgentReport): InputBridgeSessionInfo {
      const session = requireSession(id);
      session.agentSeenAt = now();
      touch(session);
      if (report.apps) session.apps = report.apps;
      if (report.frontmost !== undefined) session.frontmost = report.frontmost;
      if (report.results) {
        session.cuaResults = [...report.results, ...session.cuaResults].slice(0, INPUT_BRIDGE_MAX_CUA_RESULTS);
      }
      return toInfo(id, session);
    },

    remove(id: string): void {
      const session = sessions.get(id);
      if (!session) return;
      finishWaiters(session.waiters, null);
      finishWaiters(session.agentWaiters, null);
      sessions.delete(id);
    },
  };
}

export type InputBridgeStore = ReturnType<typeof createInputBridgeStore>;

function normalizeEvent(value: unknown): InputBridgeEvent {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!record) throw new InputBridgeError(400, "事件格式不正确");
  const type = record.type;
  if (type === "text" || (typeof record.text === "string" && type === undefined)) {
    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (!text) throw new InputBridgeError(400, "请输入要发送的文字");
    if (text.length > INPUT_BRIDGE_MAX_TEXT_CHARS) {
      throw new InputBridgeError(413, `文字不能超过 ${INPUT_BRIDGE_MAX_TEXT_CHARS} 字`);
    }
    return { type: "text", text };
  }
  if (type === "move") {
    return { type: "move", dx: finiteNumber(record.dx), dy: finiteNumber(record.dy) };
  }
  if (type === "click") {
    const button = record.button === "secondary" ? "secondary" : "primary";
    return { type: "click", button };
  }
  if (type === "scroll") {
    return { type: "scroll", deltaX: finiteNumber(record.deltaX), deltaY: finiteNumber(record.deltaY) };
  }
  if (type === "shortcut") {
    const id = String(record.id ?? "");
    if (!INPUT_BRIDGE_SHORTCUTS.includes(id as InputBridgeShortcutId)) {
      throw new InputBridgeError(400, "不支持的快捷键");
    }
    return { type: "shortcut", id: id as InputBridgeShortcutId };
  }
  if (type === "activate" || type === "launch") {
    const target = normalizeAppTarget(record);
    return type === "activate" ? { type: "activate", ...target } : { type: "launch", name: target.name, bundleId: target.bundleId };
  }
  if (type === "cua") {
    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (!text) throw new InputBridgeError(400, "请输入要交给 Cua 的指令");
    if (text.length > INPUT_BRIDGE_MAX_TEXT_CHARS) {
      throw new InputBridgeError(413, `文字不能超过 ${INPUT_BRIDGE_MAX_TEXT_CHARS} 字`);
    }
    return { type: "cua", text, intent: normalizeIntent(record.intent) };
  }
  throw new InputBridgeError(400, "不支持的事件类型");
}

function normalizeAppTarget(record: Record<string, unknown>): { name?: string; bundleId?: string; pid?: number } {
  const name = typeof record.name === "string" ? record.name.trim().slice(0, 120) : "";
  const bundleId = typeof record.bundleId === "string" ? record.bundleId.trim().slice(0, 200) : "";
  const pid = Number.isInteger(record.pid) ? Number(record.pid) : undefined;
  if (!name && !bundleId && pid === undefined) {
    throw new InputBridgeError(400, "请指定应用名、bundleId 或 pid");
  }
  return {
    ...(name ? { name } : {}),
    ...(bundleId ? { bundleId } : {}),
    ...(pid !== undefined ? { pid } : {}),
  };
}

function normalizeIntent(value: unknown): CuaIntent {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const kind = record && typeof record.kind === "string" ? record.kind : "unknown";
  if (kind === "launch" || kind === "activate") {
    return {
      kind,
      name: typeof record?.name === "string" ? record.name.slice(0, 120) : undefined,
      bundleId: typeof record?.bundleId === "string" ? record.bundleId.slice(0, 200) : undefined,
    };
  }
  if (kind === "shortcut") {
    const id = String(record?.id ?? "");
    if (!INPUT_BRIDGE_SHORTCUTS.includes(id as InputBridgeShortcutId)) {
      return { kind: "unknown" };
    }
    return { kind: "shortcut", id: id as InputBridgeShortcutId };
  }
  if (kind === "type") {
    const text = typeof record?.text === "string" ? record.text.trim().slice(0, INPUT_BRIDGE_MAX_TEXT_CHARS) : "";
    return text ? { kind: "type", text } : { kind: "unknown" };
  }
  return { kind: "unknown", text: typeof record?.text === "string" ? record.text.slice(0, 200) : undefined };
}

function normalizeApp(value: unknown): CuaAppInfo {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const name = typeof record?.name === "string" ? record.name.trim().slice(0, 120) : "";
  if (!name) throw new InputBridgeError(400, "应用名不能为空");
  const pidValue = record?.pid;
  const pid = Number.isInteger(pidValue) ? Number(pidValue) : undefined;
  return {
    name,
    bundleId: typeof record?.bundleId === "string" ? record.bundleId.trim().slice(0, 200) : undefined,
    ...(pid !== undefined ? { pid } : {}),
    running: record?.running !== false,
    active: Boolean(record?.active),
  };
}

function normalizeResult(value: unknown): CuaTaskResult {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const text = typeof record?.text === "string" ? record.text.trim().slice(0, 200) : "";
  return {
    id: typeof record?.id === "string" && record.id ? record.id.slice(0, 40) : createInputBridgeId(),
    text: text || "cua",
    ok: record?.ok !== false,
    detail: typeof record?.detail === "string" ? record.detail.slice(0, 300) : "",
    at: Number.isFinite(record?.at) ? Number(record?.at) : Date.now(),
  };
}

function finiteNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function enqueueCarEvent(pending: InputBridgeCarEvent[], event: InputBridgeCarEvent): void {
  const last = pending[pending.length - 1];
  if (event.type === "move" && last?.type === "move") {
    last.dx += event.dx;
    last.dy += event.dy;
    return;
  }
  if (event.type === "scroll" && last?.type === "scroll") {
    last.deltaX += event.deltaX;
    last.deltaY += event.deltaY;
    return;
  }
  pending.push(event);
}

function toNextResult(events: InputBridgeCarEvent[], timedOut: boolean): InputBridgeNextResult {
  return {
    events,
    text: events.find((event) => event.type === "text")?.text ?? null,
    timedOut,
  };
}

function finishWaiters<T>(waiters: Array<(events: T | null) => void>, events: T | null): void {
  const pending = waiters.splice(0);
  for (const waiter of pending) waiter(events);
}
