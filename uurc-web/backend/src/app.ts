import fs from "node:fs";
import path from "node:path";

import express from "express";
import { createRuntimeProfile } from "@uurc/shared";

import { createConfig, type BackendConfigOverrides } from "./config.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { createDiagnosticsRouter } from "./routes/diagnostics.js";
import { createProxyRouter } from "./routes/proxy.js";
import { createRemoteRouter } from "./routes/remote.js";
import { RemoteControlService, type SignalGatewayConnector } from "./services/remoteControlService.js";

export interface AppOverrides extends BackendConfigOverrides {
  signalGatewayConnector?: SignalGatewayConnector;
}

export function createApp(overrides: AppOverrides = {}) {
  const { signalGatewayConnector, ...configOverrides } = overrides;
  const config = createConfig(configOverrides);
  const remoteControl = new RemoteControlService(undefined, signalGatewayConnector);
  const app = express();

  app.use(express.json({ limit: "10mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, runtime: "node" });
  });
  app.get("/api/runtime", (_req, res) => {
    res.json(createRuntimeProfile("node"));
  });

  app.use("/api", createRemoteRouter(remoteControl));
  app.use("/api", createProxyRouter());

  if (config.enableDiagnostics) {
    app.use("/api", createDiagnosticsRouter(config));
  }

  const frontendDist = resolveFrontendDist();
  if (frontendDist) {
    app.use(express.static(frontendDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/wisp")) {
        next();
        return;
      }
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  }

  app.use(errorHandler);

  return {
    app,
    config,
    services: {
      remoteControl,
    },
  };
}

function resolveFrontendDist(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "../frontend/dist"),
    path.resolve(process.cwd(), "frontend/dist"),
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html"))) ?? null;
}
