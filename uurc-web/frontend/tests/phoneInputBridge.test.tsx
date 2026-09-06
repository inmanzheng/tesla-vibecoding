import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PhoneInputBridgePage, PhonePairLandingPage } from "../src/components/PhoneInputBridgePage.js";

describe("PhonePairLandingPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens the auto pair surface without asking for a code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "missing" }), { status: 404 })),
    );
    render(
      <MemoryRouter>
        <PhonePairLandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "发给远端 Mac" })).toBeInTheDocument();
    expect(screen.getByText("已自动配对")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "快捷" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "应用" })).toBeInTheDocument();
  });
});

describe("PhoneInputBridgePage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const path = String(input);
        if (path === "/api/input-bridge/active" && (init?.method ?? "GET") === "GET") {
          return new Response(JSON.stringify({ id: "active", expiresAt: Date.now() + 1000 }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (path === "/api/input-bridge/active" && init?.method === "POST") {
          return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ error: "missing" }), { status: 404 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("sends typed text to the active bridge", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/pair"]}>
        <Routes>
          <Route path="/pair" element={<PhoneInputBridgePage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText(/已自动配对。可以打字/);
    await user.type(screen.getByPlaceholderText(/点这里弹出系统键盘/), "你好 Mac");
    await user.click(screen.getByRole("button", { name: "发送到远端" }));
    await waitFor(() => {
      expect(screen.getByText(/已发送到车机/)).toBeInTheDocument();
    });
    expect(vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes("/api/input-bridge/active") && call[1]?.method === "POST")).toBe(
      true,
    );
  });

  it("sends a desktop shortcut without a pair code", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/pair"]}>
        <Routes>
          <Route path="/pair" element={<PhoneInputBridgePage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText(/已自动配对。可以打字/);
    await user.click(screen.getByRole("button", { name: "快捷" }));
    await user.click(screen.getByRole("button", { name: "下一桌面" }));
    await waitFor(() => {
      expect(
        vi.mocked(fetch).mock.calls.some((call) => {
          if (call[1]?.method !== "POST") return false;
          const body = String(call[1].body ?? "");
          return body.includes("mac-next-desktop");
        }),
      ).toBe(true);
    });
  });

  it("shows a waiting state on the app panel before Cua is online", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/pair"]}>
        <Routes>
          <Route path="/pair" element={<PhoneInputBridgePage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText(/已自动配对。可以打字/);
    await user.click(screen.getByRole("button", { name: "应用" }));
    expect(screen.getByText(/等待 Mac 助手（Cua）上线/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "微信" })).toBeInTheDocument();
  });
});
