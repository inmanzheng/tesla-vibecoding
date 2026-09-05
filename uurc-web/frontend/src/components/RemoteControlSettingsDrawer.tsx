import { CircleStop, LoaderCircle, Monitor, PlugZap } from "lucide-react";

import type { RemoteControlPageProps } from "../app/remoteControlPageProps.js";
import { ParticipantList } from "./ParticipantList.js";

export function RemoteControlSettingsDrawer({
  autoConnect,
  browserRtcReady,
  busy,
  connectionRouteMode,
  forceJoin,
  onAutoConnectChange,
  onConnectionRouteModeChange,
  onForceJoinChange,
  onSignalServerIndexChange,
  onSdpTransportModeChange,
  onStartBrowserRemote,
  onStartSignalGateway,
  onStopSignalGateway,
  sdpTransportMode,
  selectedDevice,
  selectedParticipants,
  signalServerIndex,
  signalServerOptions,
}: Pick<
  RemoteControlPageProps,
  | "autoConnect"
  | "browserRtcReady"
  | "busy"
  | "connectionRouteMode"
  | "forceJoin"
  | "onAutoConnectChange"
  | "onConnectionRouteModeChange"
  | "onForceJoinChange"
  | "onSignalServerIndexChange"
  | "onSdpTransportModeChange"
  | "onStartBrowserRemote"
  | "onStartSignalGateway"
  | "onStopSignalGateway"
  | "sdpTransportMode"
  | "selectedDevice"
  | "selectedParticipants"
  | "signalServerIndex"
  | "signalServerOptions"
>) {
  return (
    <details className="control-drawer">
      <summary>控制设置</summary>
      <label className="control-field auto-connect-field">
        <span className="control-field-label">进入设备自动连接</span>
        <input type="checkbox" checked={autoConnect} onChange={(event) => onAutoConnectChange(event.target.checked)} />
      </label>
      {selectedDevice ? (
        <div className="control-field">
          <span className="control-field-label">正在占用该设备的控制端</span>
          <ParticipantList participants={selectedParticipants} />
        </div>
      ) : null}
      {selectedDevice ? (
        <div className="control-field">
          <span className="control-field-label">加入模式</span>
          <fieldset className="join-mode-control" aria-label="加入模式">
            <label>
              <input type="radio" name="joinMode" checked={!forceJoin} onChange={() => onForceJoinChange(false)} />
              <span>普通加入</span>
            </label>
            <label>
              <input type="radio" name="joinMode" checked={forceJoin} onChange={() => onForceJoinChange(true)} />
              <span>接管控制</span>
            </label>
          </fieldset>
        </div>
      ) : null}

      <details className="control-subdrawer">
        <summary>高级设置（调试用）</summary>
        <div className="transport-actions">
          <button onClick={onStartSignalGateway} disabled={busy !== null}>
            {busy === "signal-start" ? <LoaderCircle className="spin" size={17} /> : <PlugZap size={17} />}
            手动启动连接服务
          </button>
          <button onClick={onStopSignalGateway} disabled={busy !== null}>
            {busy === "signal-stop" ? <LoaderCircle className="spin" size={17} /> : <CircleStop size={17} />}
            手动断开连接
          </button>
          <button onClick={onStartBrowserRemote} disabled={!browserRtcReady}>
            {busy === "browser-remote-start" ? <LoaderCircle className="spin" size={17} /> : <Monitor size={17} />}
            手动启动画面
          </button>
        </div>
        {signalServerOptions.length > 0 ? (
          <label className="control-field select-field" htmlFor="signal-server-index">
            <span className="control-field-label">信令入口</span>
            <select
              id="signal-server-index"
              aria-label="信令入口"
              value={signalServerIndex}
              onChange={(event) => onSignalServerIndexChange(Number(event.target.value))}
            >
              {signalServerOptions.map((server, index) => (
                <option key={`${server}-${index}`} value={index}>
                  {server}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="control-field">
          <span className="control-field-label">画面兼容性</span>
          <fieldset className="segmented-control" aria-label="画面协商">
            <label>
              <input type="radio" name="sdpTransportMode" checked={sdpTransportMode === "gzip"} onChange={() => onSdpTransportModeChange("gzip")} />
              <span>标准模式</span>
            </label>
            <label>
              <input type="radio" name="sdpTransportMode" checked={sdpTransportMode === "plain"} onChange={() => onSdpTransportModeChange("plain")} />
              <span>兼容模式</span>
            </label>
          </fieldset>
        </div>
        <div className="control-field">
          <span className="control-field-label">网络路径</span>
          <fieldset className="segmented-control" aria-label="网络路径">
            <label>
              <input type="radio" name="connectionRouteMode" checked={connectionRouteMode === "auto"} onChange={() => onConnectionRouteModeChange("auto")} />
              <span>自动路径</span>
            </label>
            <label>
              <input type="radio" name="connectionRouteMode" checked={connectionRouteMode === "relay"} onChange={() => onConnectionRouteModeChange("relay")} />
              <span>强制 UU 中转</span>
            </label>
          </fieldset>
        </div>
      </details>
    </details>
  );
}
