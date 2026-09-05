import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DeviceSection } from "../src/components/DeviceControls.js";

describe("DeviceSection", () => {
  it("only exposes a connect action for controllable non-local devices", async () => {
    const onSelect = vi.fn();
    const onConnect = vi.fn();
    const user = userEvent.setup();

    render(
      <DeviceSection
        title="移动端"
        devices={[
          { deviceId: "mac-1", alias: "Office Mac", controllable: true, raw: {} },
          { deviceId: "phone-1", alias: "iPhone 17", controllable: false, raw: {} },
          { deviceId: "web-device-1", alias: "本机控制端", controllable: true, raw: {} },
        ]}
        selected=""
        currentDeviceId="web-device-1"
        onSelect={onSelect}
        onConnect={onConnect}
      />,
    );

    expect(screen.getByRole("button", { name: /连接 Office Mac/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /连接 iPhone 17/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /连接 本机控制端/ })).not.toBeInTheDocument();

    await user.click(screen.getByText("iPhone 17"));
    await user.click(screen.getByText("本机控制端"));
    expect(onConnect).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /连接 Office Mac/ }));
    expect(onSelect).toHaveBeenCalledWith("mac-1");
    expect(onConnect).toHaveBeenCalledWith("mac-1");
  });
});
