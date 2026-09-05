import type { RemoteControlPageProps } from "../app/remoteControlPageProps.js";
import { DebugEventList } from "./DebugEventList.js";
import { formatAppFlagControlMode, getDeviceConnectionLabel } from "../devices/deviceLabels.js";
import { StatusRow } from "./Panel.js";
import { ReadinessStrip } from "./ReadinessStrip.js";

export function RemoteControlDiagnosticsDrawer({
  autoSwitchThresholdLabel,
  browserIceServers,
  browserRemoteState,
  browserRtcDescription,
  browserStageLabel,
  candidatePairSummary,
  connectionPathLabel,
  controlChannelLabel,
  debugEvents,
  effectiveConnectionRouteLabel,
  iceControlStatusLabel,
  inboundVideoStatsLabel,
  inputControlActive,
  joinModeLabel,
  networkSwitchSummary,
  remoteBootstrap,
  roomDebugPayload,
  roomJoinModeDebugLabel,
  roomReleaseDetail,
  roomReleaseLabel,
  runtimeProfile,
  selectedDevice,
  selectedDeviceId,
  serviceRoutePolicyLabel,
  signalEvents,
  signalGatewayDisplay,
  signalHeaderSummary,
  signalReadiness,
  sdpTransportLabel,
  textChannelLabel,
  unexpectedSignalEventSummary,
  videoElementLabel,
  videoFlowLabel,
}: Pick<
  RemoteControlPageProps,
  | "autoSwitchThresholdLabel"
  | "browserIceServers"
  | "browserRemoteState"
  | "browserRtcDescription"
  | "browserStageLabel"
  | "candidatePairSummary"
  | "connectionPathLabel"
  | "controlChannelLabel"
  | "debugEvents"
  | "effectiveConnectionRouteLabel"
  | "iceControlStatusLabel"
  | "inboundVideoStatsLabel"
  | "inputControlActive"
  | "joinModeLabel"
  | "networkSwitchSummary"
  | "remoteBootstrap"
  | "roomDebugPayload"
  | "roomJoinModeDebugLabel"
  | "roomReleaseDetail"
  | "roomReleaseLabel"
  | "runtimeProfile"
  | "selectedDevice"
  | "selectedDeviceId"
  | "serviceRoutePolicyLabel"
  | "signalEvents"
  | "signalGatewayDisplay"
  | "signalHeaderSummary"
  | "signalReadiness"
  | "sdpTransportLabel"
  | "textChannelLabel"
  | "unexpectedSignalEventSummary"
  | "videoElementLabel"
  | "videoFlowLabel"
>) {
  return (
    <details className="control-drawer">
      <summary>调试信息</summary>
      <div className="status-list compact">
        <StatusRow label="目标设备" value={selectedDevice?.alias ?? "-"} />
        <StatusRow label="目标 ID" value={selectedDeviceId || "-"} />
        <StatusRow label="在线状态" value={selectedDevice ? getDeviceConnectionLabel(selectedDevice) : "-"} />
        <StatusRow label="控制模式" value={selectedDevice ? formatAppFlagControlMode(selectedDevice.appFlag) : "-"} />
        <StatusRow label="加入模式" value={joinModeLabel} />
        <StatusRow label="入会方式" value={roomJoinModeDebugLabel} />
        <StatusRow label="连接服务" value={signalGatewayDisplay} />
        <StatusRow label="信令状态" value={signalGatewayDisplay} />
        <StatusRow label="浏览器控制" value={browserRtcDescription} />
        <StatusRow label="实际路径" value={connectionPathLabel} />
        <StatusRow label="候选链路" value={candidatePairSummary} />
        <StatusRow label="链路策略" value={effectiveConnectionRouteLabel} />
        <StatusRow label="服务链路" value={serviceRoutePolicyLabel} />
        <StatusRow label="部署运行时" value={runtimeProfile ? `${runtimeProfile.runtime} · ${runtimeProfile.signalGateway}` : "-"} />
        <StatusRow label="ICE" value={iceControlStatusLabel} />
        <StatusRow label="自动切换" value={autoSwitchThresholdLabel} />
        <StatusRow label="网络事件" value={networkSwitchSummary} />
        <StatusRow label="视频状态" value={videoFlowLabel} />
        <StatusRow label="视频接收" value={inboundVideoStatsLabel} />
        <StatusRow label="视频采样" value={videoElementLabel} />
        <StatusRow label="控制通道" value={controlChannelLabel} />
        <StatusRow label="文本通道" value={textChannelLabel} />
        <StatusRow label="输入控制" value={inputControlActive ? "控制中" : "仅查看"} />
        <StatusRow label="房间释放" value={roomReleaseLabel} />
        <StatusRow label="释放详情" value={roomReleaseDetail} />
      </div>
      <ReadinessStrip diagnostics={signalReadiness} />
      <details className="protocol-details">
        <summary>协议细节</summary>
        <div className="status-list compact transport-details">
          <StatusRow label="Headers" value={signalHeaderSummary} />
          <StatusRow label="事件" value={remoteBootstrap ? remoteBootstrap.signalEvents.join(", ") : "-"} />
          <StatusRow label="事件日志" value={String(signalEvents.length)} />
          <StatusRow label="未知事件" value={unexpectedSignalEventSummary} />
          <StatusRow label="浏览器 WebRTC" value={`${browserStageLabel} / ICE ${browserIceServers}`} />
          <StatusRow label="SDP" value={sdpTransportLabel} />
          <StatusRow label="链路策略" value={effectiveConnectionRouteLabel} />
          <StatusRow label="Control ID" value={browserRemoteState.appControlId || "-"} />
        </div>
      </details>
      <details className="debug-details">
        <summary>脱敏调试摘要</summary>
        <pre className="response-box">{roomDebugPayload ? JSON.stringify(roomDebugPayload, null, 2) : "No room response yet."}</pre>
      </details>
      <details className="debug-events-details">
        <summary>远控调试日志</summary>
        <DebugEventList events={debugEvents} />
      </details>
    </details>
  );
}
