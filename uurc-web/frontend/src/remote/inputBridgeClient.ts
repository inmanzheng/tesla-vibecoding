import type { InputBridgeEvent } from "./inputBridgeEvents.js";

export const ACTIVE_BRIDGE_ID = "active";

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

export interface InputBridgeSession {
  id: string;
  expiresAt: number;
  path: string;
  apps?: CuaAppInfo[];
  frontmost?: string;
  agentOnline?: boolean;
  cuaResults?: CuaTaskResult[];
}

export interface InputBridgePeek {
  id: string;
  expiresAt: number;
  apps: CuaAppInfo[];
  frontmost: string;
  agentOnline: boolean;
  cuaResults: CuaTaskResult[];
}

export interface InputBridgeNextResult {
  events: InputBridgeEvent[];
  text: string | null;
  timedOut: boolean;
}

async function parseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await parseJson(response);
  if (!response.ok) {
    const record = body && typeof body === "object" ? (body as { error?: unknown }) : null;
    const message = typeof record?.error === "string" ? record.error : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return body as T;
}

function normalizePeek(body: Partial<InputBridgePeek> & { id?: string; expiresAt?: number }): InputBridgePeek {
  return {
    id: body.id || ACTIVE_BRIDGE_ID,
    expiresAt: Number(body.expiresAt) || 0,
    apps: Array.isArray(body.apps) ? body.apps : [],
    frontmost: typeof body.frontmost === "string" ? body.frontmost : "",
    agentOnline: Boolean(body.agentOnline),
    cuaResults: Array.isArray(body.cuaResults) ? body.cuaResults : [],
  };
}

export async function createInputBridge(): Promise<InputBridgeSession> {
  return requestJson<InputBridgeSession>("/api/input-bridge", { method: "POST" });
}

export async function ensureInputBridge(): Promise<InputBridgeSession> {
  return requestJson<InputBridgeSession>("/api/input-bridge/ensure", { method: "POST" });
}

export async function peekInputBridge(id: string = ACTIVE_BRIDGE_ID): Promise<InputBridgePeek> {
  return normalizePeek(await requestJson(`/api/input-bridge/${encodeURIComponent(id || ACTIVE_BRIDGE_ID)}`));
}

export async function pushInputBridgeText(id: string, text: string): Promise<void> {
  await pushInputBridgeEvents(id, [{ type: "text", text }]);
}

export async function pushInputBridgeEvents(id: string, events: InputBridgeEvent[]): Promise<void> {
  await requestJson(`/api/input-bridge/${encodeURIComponent(id || ACTIVE_BRIDGE_ID)}`, {
    method: "POST",
    body: JSON.stringify({ events }),
  });
}

export async function pullInputBridgeNext(id: string, waitMs = 20000, signal?: AbortSignal): Promise<InputBridgeNextResult> {
  const query = new URLSearchParams({ waitMs: String(waitMs) });
  const result = await requestJson<Partial<InputBridgeNextResult>>(
    `/api/input-bridge/${encodeURIComponent(id || ACTIVE_BRIDGE_ID)}/next?${query}`,
    { signal },
  );
  const events = Array.isArray(result.events) ? result.events : result.text ? [{ type: "text" as const, text: result.text }] : [];
  return {
    events,
    text: result.text ?? events.find((event) => event.type === "text")?.text ?? null,
    timedOut: Boolean(result.timedOut),
  };
}

export async function deleteInputBridge(id: string): Promise<void> {
  await fetch(`/api/input-bridge/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function buildPairUrl(id: string, origin = globalThis.location?.origin ?? ""): string {
  return `${origin.replace(/\/$/, "")}/pair/${id}`;
}

export function buildPairLandingUrl(origin = globalThis.location?.origin ?? ""): string {
  return `${origin.replace(/\/$/, "")}/pair`;
}
