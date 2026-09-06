#!/usr/bin/env node
/**
 * 被控 Mac 小代理：轮询 VPS input-bridge，只把 activate/launch/cua 交给本机 cua-driver。
 * 不监听 0.0.0.0，不注入键鼠。画面声音仍走 UU。
 *
 *   UURC_BRIDGE_URL=https://43.161.198.131 node index.mjs
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BRIDGE_URL = (process.env.UURC_BRIDGE_URL || "https://43.161.198.131").replace(/\/$/, "");
const BRIDGE_ID = process.env.UURC_BRIDGE_ID || "active";
const CUA_BIN = process.env.CUA_DRIVER_BIN || "cua-driver";
const WAIT_MS = Number(process.env.UURC_AGENT_WAIT_MS || 20000);
const TLS_INSECURE = process.env.UURC_TLS_INSECURE === "1";

if (TLS_INSECURE) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

async function requestJson(path, init = {}) {
  const response = await fetch(`${BRIDGE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && typeof body.error === "string" ? body.error : `${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function reportAgent(payload) {
  return requestJson(`/api/input-bridge/${encodeURIComponent(BRIDGE_ID)}/agent`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

async function pullAgentEvents() {
  return requestJson(`/api/input-bridge/${encodeURIComponent(BRIDGE_ID)}/agent-next?waitMs=${WAIT_MS}`);
}

async function cuaCall(tool, args = {}) {
  const payload = JSON.stringify(args);
  const attempts = [
    [CUA_BIN, ["call", tool, payload]],
    [CUA_BIN, ["call", tool, `--args=${payload}`]],
    [CUA_BIN, ["call", tool]],
  ];
  let lastError = new Error("cua-driver 调用失败");
  for (const [bin, argv] of attempts) {
    try {
      const { stdout } = await execFileAsync(bin, argv, { timeout: 15_000, maxBuffer: 2_000_000 });
      return parseCuaOutput(stdout);
    } catch (caught) {
      lastError = caught instanceof Error ? caught : new Error(String(caught));
      if (caught && typeof caught === "object" && "code" in caught && caught.code === "ENOENT") {
        throw new Error("本机没有 cua-driver。装好后再开这个助手。");
      }
    }
  }
  throw lastError;
}

function parseCuaOutput(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("[") >= 0 ? text.indexOf("[") : text.indexOf("{");
    if (start >= 0) {
      try {
        return JSON.parse(text.slice(start));
      } catch {
        return text;
      }
    }
    return text;
  }
}

function normalizeApps(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.apps) ? raw.apps : [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name ?? item.app_name ?? item.title ?? "").trim();
      if (!name) return null;
      return {
        name,
        bundleId: item.bundleId ?? item.bundle_id ?? item.bundleID,
        pid: Number.isInteger(item.pid) ? item.pid : undefined,
        running: item.running !== false,
        active: Boolean(item.active ?? item.is_active ?? item.frontmost),
      };
    })
    .filter(Boolean)
    .slice(0, 80);
}

async function listApps() {
  const raw = await cuaCall("list_apps");
  return normalizeApps(raw);
}

async function launchOrActivate(target) {
  const args = {
    ...(target.bundleId ? { bundle_id: target.bundleId, bundleId: target.bundleId } : {}),
    ...(target.name ? { name: target.name, app_name: target.name } : {}),
    ...(target.pid !== undefined ? { pid: target.pid } : {}),
  };
  await cuaCall("launch_app", args);
}

async function snapshotApps() {
  try {
    const apps = await listApps();
    const frontmost = apps.find((app) => app.active)?.name ?? "";
    await reportAgent({ apps, frontmost });
    return { apps, frontmost, ok: true };
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : "无法列出应用";
    await reportAgent({ apps: [], frontmost: "" }).catch(() => undefined);
    return { apps: [], frontmost: "", ok: false, detail };
  }
}

async function handleEvent(event) {
  if (event.type === "launch" || event.type === "activate") {
    await launchOrActivate(event);
    return { text: event.name || event.bundleId || "app", ok: true, detail: event.type === "activate" ? "已切换应用" : "已打开应用" };
  }
  if (event.type !== "cua") {
    return { text: "unknown", ok: false, detail: "不支持的助手事件" };
  }
  const intent = event.intent ?? { kind: "unknown" };
  if (intent.kind === "launch" || intent.kind === "activate") {
    await launchOrActivate(intent);
    return { text: event.text, ok: true, detail: `已${intent.kind === "activate" ? "切换" : "打开"} ${intent.name ?? ""}`.trim() };
  }
  if (intent.kind === "shortcut" || intent.kind === "type") {
    return { text: event.text, ok: false, detail: "这句由车机画面执行，助手不用再点一次" };
  }
  return { text: event.text, ok: false, detail: "还不认识这句" };
}

async function loop() {
  console.log(`[uurc-mac-agent] bridge=${BRIDGE_URL} id=${BRIDGE_ID}`);
  console.log("[uurc-mac-agent] 等待车机进入控制后再上报应用");

  while (true) {
    try {
      const pulled = await pullAgentEvents();
      const events = Array.isArray(pulled?.events) ? pulled.events : [];
      const results = [];
      for (const event of events) {
        try {
          const result = await handleEvent(event);
          results.push({ ...result, at: Date.now() });
          console.log(`[uurc-mac-agent] ${result.ok ? "ok" : "skip"} ${result.detail}`);
        } catch (caught) {
          const detail = caught instanceof Error ? caught.message : "执行失败";
          results.push({ text: event.text || event.name || event.type, ok: false, detail, at: Date.now() });
          console.warn(`[uurc-mac-agent] fail ${detail}`);
        }
      }
      if (results.length > 0) {
        await reportAgent({ results });
      }
      await snapshotApps();
    } catch (caught) {
      const status = caught && typeof caught === "object" && "status" in caught ? caught.status : 0;
      const detail = caught instanceof Error ? caught.message : "轮询失败";
      console.warn(`[uurc-mac-agent] ${status} ${detail}`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

void loop();
