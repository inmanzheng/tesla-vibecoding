import { CircleStop, LoaderCircle } from "lucide-react";

import type { RemoteControlPageProps } from "../app/remoteControlPageProps.js";
import { StatusPill } from "./StatusPill.js";

export function RemoteControlTopbar({
  browserRemoteState,
  busy,
  canDisconnectRemote,
  onReturnToDevices,
  onStopSignalGateway,
  selectedDevice,
  selectedTargetLabel,
  signalGatewayDisplay,
}: Pick<
  RemoteControlPageProps,
  | "browserRemoteState"
  | "busy"
  | "canDisconnectRemote"
  | "onReturnToDevices"
  | "onStopSignalGateway"
  | "selectedDevice"
  | "selectedTargetLabel"
  | "signalGatewayDisplay"
>) {
  return (
    <header className="control-topbar">
      <button className="secondary-button" onClick={onReturnToDevices} disabled={busy !== null}>
        返回设备列表
      </button>
      <div>
        <h1>{selectedDevice?.alias ?? selectedTargetLabel}</h1>
      </div>
      <div className="topbar-actions">
        <StatusPill state={browserRemoteState.stage === "connected" ? "ready" : "idle"}>
          {browserRemoteState.stage === "connected" ? "已连接" : signalGatewayDisplay}
        </StatusPill>
        {canDisconnectRemote ? (
          <button
            className="danger-button"
            onClick={onStopSignalGateway}
            disabled={busy !== null}
            title="断开连接，释放设备占用"
          >
            {busy === "signal-stop" ? <LoaderCircle className="spin" size={17} /> : <CircleStop size={17} />}
            断开连接
          </button>
        ) : null}
      </div>
    </header>
  );
}
