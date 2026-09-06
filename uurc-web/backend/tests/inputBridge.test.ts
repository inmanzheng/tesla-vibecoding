import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { errorHandler } from "../src/middleware/errorHandler.js";
import { createInputBridgeRouter } from "../src/routes/inputBridge.js";
import {
  INPUT_BRIDGE_MAX_TEXT_CHARS,
  createInputBridgeId,
  createInputBridgeStore,
} from "../src/services/inputBridge.js";

function createBridgeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", createInputBridgeRouter());
  app.use(errorHandler);
  return app;
}

describe("input bridge store", () => {
  it("creates the active slot and delivers one push to a waiting next()", async () => {
    const store = createInputBridgeStore(() => 1_000);
    const session = store.create();
    expect(session.id).toBe("active");

    const pending = store.next(session.id, 1000);
    store.push(session.id, [{ type: "text", text: "你好世界" }]);
    await expect(pending).resolves.toEqual({
      events: [{ type: "text", text: "你好世界" }],
      text: "你好世界",
      timedOut: false,
    });
    await expect(store.next(session.id, 5)).resolves.toEqual({ events: [], text: null, timedOut: true });
  });

  it("queues text when the car is not waiting", async () => {
    const store = createInputBridgeStore(() => 2_000);
    const { id } = store.create();
    store.push(id, [{ type: "text", text: "first" }]);
    await expect(store.next(id, 5)).resolves.toEqual({
      events: [{ type: "text", text: "first" }],
      text: "first",
      timedOut: false,
    });
  });

  it("merges queued move and scroll events", async () => {
    const store = createInputBridgeStore(() => 3_000);
    const { id } = store.create();
    store.push(id, [{ type: "move", dx: 4, dy: 1 }]);
    store.push(id, [{ type: "move", dx: 6, dy: 3 }]);
    store.push(id, [{ type: "scroll", deltaX: 0, deltaY: 8 }]);
    store.push(id, [{ type: "scroll", deltaX: 2, deltaY: 4 }]);
    await expect(store.next(id, 5)).resolves.toEqual({
      events: [
        { type: "move", dx: 10, dy: 4 },
        { type: "scroll", deltaX: 2, deltaY: 12 },
      ],
      text: null,
      timedOut: false,
    });
  });

  it("builds ids from the ambiguous-free alphabet", () => {
    expect(createInputBridgeId(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]))).toHaveLength(8);
  });

  it("keeps car input and Cua tasks on separate queues", async () => {
    const store = createInputBridgeStore(() => 4_000);
    const { id } = store.create();
    store.push(id, [
      { type: "text", text: "给画面" },
      { type: "launch", name: "微信", bundleId: "com.tencent.xinWeChat" },
    ]);
    await expect(store.next(id, 5)).resolves.toEqual({
      events: [{ type: "text", text: "给画面" }],
      text: "给画面",
      timedOut: false,
    });
    await expect(store.agentNext(id, 5)).resolves.toEqual({
      events: [{ type: "launch", name: "微信", bundleId: "com.tencent.xinWeChat" }],
      timedOut: false,
    });
  });

  it("does not wipe queued events when ensure() is called again", async () => {
    const store = createInputBridgeStore(() => 5_000);
    store.create();
    store.push("active", [{ type: "text", text: "keep" }]);
    const again = store.ensure();
    expect(again.id).toBe("active");
    await expect(store.next("active", 5)).resolves.toMatchObject({
      events: [{ type: "text", text: "keep" }],
    });
  });
});

describe("input bridge routes", () => {
  it("creates, accepts phone text, and lets the car pull it once", async () => {
    const app = createBridgeApp();
    const created = await request(app).post("/api/input-bridge").expect(201);
    const id = created.body.id as string;
    expect(created.body.id).toBe("active");
    expect(created.body.path).toBe("/pair");

    await request(app).get(`/api/input-bridge/${id}`).expect(200);
    await request(app).post(`/api/input-bridge/${id}`).send({ text: "从手机发来" }).expect(200);

    const pulled = await request(app).get(`/api/input-bridge/${id}/next?waitMs=10`).expect(200);
    expect(pulled.body).toEqual({
      events: [{ type: "text", text: "从手机发来" }],
      text: "从手机发来",
      timedOut: false,
    });

    const empty = await request(app).get(`/api/input-bridge/${id}/next?waitMs=10`).expect(200);
    expect(empty.body.events).toEqual([]);
    expect(empty.body.text).toBeNull();
  });

  it("accepts trackpad event batches", async () => {
    const app = createBridgeApp();
    const created = await request(app).post("/api/input-bridge").expect(201);
    const id = created.body.id as string;
    await request(app)
      .post(`/api/input-bridge/${id}`)
      .send({ events: [{ type: "move", dx: 12, dy: -4 }, { type: "click", button: "primary" }] })
      .expect(200);
    const pulled = await request(app).get(`/api/input-bridge/${id}/next?waitMs=10`).expect(200);
    expect(pulled.body.events).toEqual([
      { type: "move", dx: 12, dy: -4 },
      { type: "click", button: "primary" },
    ]);
  });

  it("rejects missing, oversized, and expired pair codes", async () => {
    const app = createBridgeApp();
    await request(app).get("/api/input-bridge/nope").expect(404);
    const created = await request(app).post("/api/input-bridge").expect(201);
    const id = created.body.id as string;
    await request(app).post(`/api/input-bridge/${id}`).send({ text: "" }).expect(400);
    await request(app)
      .post(`/api/input-bridge/${id}`)
      .send({ text: "x".repeat(INPUT_BRIDGE_MAX_TEXT_CHARS + 1) })
      .expect(413);
  });

  it("lets the Mac agent report apps and pull Cua tasks", async () => {
    const app = createBridgeApp();
    const created = await request(app).post("/api/input-bridge/ensure").expect(200);
    const id = created.body.id as string;
    await request(app)
      .post(`/api/input-bridge/${id}`)
      .send({ events: [{ type: "cua", text: "打开微信", intent: { kind: "launch", name: "微信" } }] })
      .expect(200);
    await request(app)
      .put(`/api/input-bridge/${id}/agent`)
      .send({
        frontmost: "微信",
        apps: [{ name: "微信", bundleId: "com.tencent.xinWeChat", running: true, active: true }],
      })
      .expect(200);
    const peek = await request(app).get(`/api/input-bridge/${id}`).expect(200);
    expect(peek.body.frontmost).toBe("微信");
    expect(peek.body.apps[0]).toMatchObject({ name: "微信", active: true });
    expect(peek.body.agentOnline).toBe(true);
    const pulled = await request(app).get(`/api/input-bridge/${id}/agent-next?waitMs=10`).expect(200);
    expect(pulled.body.events).toEqual([
      { type: "cua", text: "打开微信", intent: { kind: "launch", name: "微信" } },
    ]);
    const car = await request(app).get(`/api/input-bridge/${id}/next?waitMs=10`).expect(200);
    expect(car.body.events).toEqual([]);
  });
});
