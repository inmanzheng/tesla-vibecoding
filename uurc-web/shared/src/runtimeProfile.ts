import type { RuntimeProfile, UurcRuntime } from "./types.js";

export function createRuntimeProfile(runtime: UurcRuntime): RuntimeProfile {
  return {
    ok: true,
    runtime,
    uuProxyPath: "/api/proxy/uu",
    signalGateway: runtime === "node" ? "node-socket-io" : "cloudflare-durable-object",
    remoteApiBase: "/api/remote",
    wispProxy: runtime === "node",
  };
}
