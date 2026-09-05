import { createServer } from "node:http";
import { appendFileSync, mkdirSync, statSync, renameSync, existsSync } from "node:fs";
import { dirname } from "node:path";

import { createApp } from "./app.js";
import { setupWsProxy } from "./services/wispProxy.js";

const LOG_PATH = process.env.UURC_BACKEND_LOG_PATH ?? "/tmp/uurc-web-backend.log";
const LOG_MAX_BYTES = 5 * 1024 * 1024;
installFileTee(LOG_PATH);

const { app, config } = createApp();
const server = createServer(app);

setupWsProxy(server);

server.listen(config.port, config.host, () => {
  console.log(`UU RC backend listening at http://${config.host}:${config.port}`);
  console.log(`backend log file: ${LOG_PATH}`);
});

function installFileTee(target: string): void {
  if (!target) return;
  try {
    mkdirSync(dirname(target), { recursive: true });
  } catch {
    // fall through; appendFileSync will surface real errors per-write
  }

  const append = (kind: "stdout" | "stderr", chunk: string): void => {
    try {
      rotateIfNeeded(target);
      const ts = new Date().toISOString();
      appendFileSync(target, `${ts} ${kind} ${chunk.endsWith("\n") ? chunk : chunk + "\n"}`);
    } catch {
      // Never let logging itself crash the server.
    }
  };

  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((data: unknown, ...rest: unknown[]) => {
    if (typeof data === "string") append("stdout", data);
    return (origStdout as (data: unknown, ...rest: unknown[]) => boolean)(data, ...rest);
  }) as typeof process.stdout.write;
  process.stderr.write = ((data: unknown, ...rest: unknown[]) => {
    if (typeof data === "string") append("stderr", data);
    return (origStderr as (data: unknown, ...rest: unknown[]) => boolean)(data, ...rest);
  }) as typeof process.stderr.write;
}

function rotateIfNeeded(target: string): void {
  try {
    const info = statSync(target);
    if (info.size <= LOG_MAX_BYTES) return;
    const archive = `${target}.1`;
    if (existsSync(archive)) {
      try {
        // best-effort; rename will overwrite on POSIX
      } catch {
        // ignore
      }
    }
    renameSync(target, archive);
  } catch {
    // file does not exist yet — nothing to rotate
  }
}
