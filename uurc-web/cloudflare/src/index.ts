import { RemoteSignalSession } from "./signalSession";
import type { RemoteSignalSession as RemoteSignalSessionClass } from "./signalSession";
import { createRuntimeProfile } from "@uurc/shared/runtimeProfile";
import {
  assertAllowedUuApiPath,
  parseMaybeJsonBody,
  sanitizeUuProxyHeaders,
} from "@uurc/shared/uuProxy";

const API_BASE = "https://api.nrd.nie.163.com";
const UU_PROXY_TIMEOUT_MS = 30_000;

type JsonRecord = Record<string, unknown>;

interface Env {
  ASSETS: Fetcher;
  REMOTE_SIGNAL_SESSION: DurableObjectNamespace<RemoteSignalSessionClass>;
}

export { RemoteSignalSession };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return json({ ok: true, runtime: "cloudflare-worker" });
    }
    if (url.pathname === "/api/runtime") {
      return json(createRuntimeProfile("cloudflare-worker"));
    }
    if (url.pathname === "/api/proxy/uu" && request.method === "POST") {
      return handleUuProxy(request);
    }
    if (url.pathname.startsWith("/api/remote/")) {
      return handleRemoteApi(request, env);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleUuProxy(request: Request): Promise<Response> {
  try {
    const body = await readJson(request);
    const method = typeof body.method === "string" ? body.method : "";
    const path = typeof body.path === "string" ? body.path : "";
    if (!method || !path) {
      return json({ error: "method and path are required" }, { status: 400 });
    }
    assertAllowedUuApiPath(path);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UU_PROXY_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: sanitizeUuProxyHeaders(body.headers),
        body: body.body === undefined ? undefined : JSON.stringify(body.body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const responseText = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    return json({
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: parseMaybeJsonBody(responseText, contentType),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

async function handleRemoteApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const session = env.REMOTE_SIGNAL_SESSION.getByName("main");

  if (url.pathname === "/api/remote/bootstrap") {
    return json({ error: "Cloudflare Worker stores room bootstrap in the browser session. Use the frontend flow to join a room first." }, { status: 404 });
  }
  if (url.pathname === "/api/remote/signal/start" && request.method === "POST") {
    return json(await session.start(await readJson(request)));
  }
  if (url.pathname === "/api/remote/signal/status" && request.method === "GET") {
    return json(await session.getStatus());
  }
  if (url.pathname === "/api/remote/signal/events" && request.method === "GET") {
    return json(await session.getEvents());
  }
  if (url.pathname === "/api/remote/signal/diagnostics" && request.method === "GET") {
    return json(await session.getDiagnostics());
  }
  if (url.pathname === "/api/remote/signal" && request.method === "DELETE") {
    return json(await session.stop());
  }
  if (url.pathname === "/api/remote/signal/control" && request.method === "POST") {
    const result = await session.sendControl(await readJson(request));
    if (!result) return json({ error: "Start the signal gateway before sending control" }, { status: 409 });
    return json(result);
  }
  if (url.pathname === "/api/remote/signal/soac" && request.method === "POST") {
    const result = await session.sendSoac(await readJson(request));
    if (!result) return json({ error: "Start the signal gateway before sending SOAC" }, { status: 409 });
    return json(result);
  }
  return json({ error: "Not found" }, { status: 404 });
}

async function readJson(request: Request): Promise<JsonRecord> {
  const body = await request.json().catch(() => ({}));
  return isRecord(body) ? body : {};
}

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
