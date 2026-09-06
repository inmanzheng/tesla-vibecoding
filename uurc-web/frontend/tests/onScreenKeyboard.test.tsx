import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OnScreenKeyboard } from "../src/components/OnScreenKeyboard.js";

describe("OnScreenKeyboard", () => {
  afterEach(() => {
    cleanup();
  });

  it("sends a press and release for a letter key", () => {
    const sendKeyboardInput = vi.fn();
    render(<OnScreenKeyboard sender={{ sendKeyboardInput }} onClose={() => undefined} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "a" }));
    expect(sendKeyboardInput.mock.calls.map((call) => call[0])).toEqual([
      { action: "keyboardPress", value: 29 },
      { action: "keyboardRelease", value: 29 },
    ]);
  });

  it("keeps Meta held until the second tap", () => {
    const sendKeyboardInput = vi.fn();
    render(<OnScreenKeyboard sender={{ sendKeyboardInput }} onClose={() => undefined} />);
    const meta = document.querySelector<HTMLButtonElement>("[data-code=MetaLeft]");
    expect(meta).toBeTruthy();
    fireEvent.pointerDown(meta!);
    fireEvent.pointerDown(meta!);
    expect(sendKeyboardInput.mock.calls.map((call) => call[0])).toEqual([
      { action: "keyboardPress", value: 117 },
      { action: "keyboardRelease", value: 117 },
    ]);
  });
});
