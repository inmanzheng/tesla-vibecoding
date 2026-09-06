import { Router } from "express";

import {
  createInputBridgeStore,
  parseAgentReport,
  parseInputBridgeEvents,
  type InputBridgeStore,
} from "../services/inputBridge.js";

export function createInputBridgeRouter(store: InputBridgeStore = createInputBridgeStore()): Router {
  const router = Router();

  router.post("/input-bridge", (_req, res) => {
    const session = store.create();
    res.status(201).json({
      id: session.id,
      expiresAt: session.expiresAt,
      path: "/pair",
    });
  });

  router.post("/input-bridge/ensure", (_req, res) => {
    const session = store.ensure();
    res.status(200).json({
      id: session.id,
      expiresAt: session.expiresAt,
      path: "/pair",
      apps: session.apps,
      frontmost: session.frontmost,
      agentOnline: session.agentOnline,
      cuaResults: session.cuaResults,
    });
  });

  router.get("/input-bridge/:id", (req, res, next) => {
    try {
      const session = store.peek(String(req.params.id));
      res.json(session);
    } catch (error) {
      next(error);
    }
  });

  router.put("/input-bridge/:id/agent", (req, res, next) => {
    try {
      res.json(store.reportAgent(String(req.params.id), parseAgentReport(req.body)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/input-bridge/:id/agent-next", async (req, res, next) => {
    try {
      const waitMs = Number(req.query.waitMs ?? 20000);
      const result = await store.agentNext(String(req.params.id), Number.isFinite(waitMs) ? waitMs : 20000);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/input-bridge/:id", (req, res, next) => {
    try {
      res.json(store.push(String(req.params.id), parseInputBridgeEvents(req.body)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/input-bridge/:id/next", async (req, res, next) => {
    try {
      const waitMs = Number(req.query.waitMs ?? 20000);
      const result = await store.next(String(req.params.id), Number.isFinite(waitMs) ? waitMs : 20000);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/input-bridge/:id", (req, res) => {
    store.remove(String(req.params.id));
    res.status(204).end();
  });

  return router;
}
