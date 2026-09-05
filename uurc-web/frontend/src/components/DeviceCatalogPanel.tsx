import { LoaderCircle, Monitor, RefreshCw } from "lucide-react";

import type { AuthStatus, UuDeviceGroups } from "@uurc/shared/types";

import { DeviceSection } from "./DeviceControls.js";
import { Panel } from "./Panel.js";
import { RemoteAssistanceCard } from "./RemoteAssistanceCard.js";

export function DeviceCatalogPanel({
  authStatus,
  busy,
  devices,
  devicesLoaded,
  selectedDeviceId,
  assistanceConnectId,
  assistanceConnectCode,
  assistanceNotice,
  assistanceTargetPlatform,
  onLoadDevices,
  onOpenDevice,
  onSelectDevice,
  onAssistanceConnectIdChange,
  onAssistanceConnectCodeChange,
  onAssistanceTargetPlatformChange,
  onStartRemoteAssistance,
}: {
  authStatus: AuthStatus | null;
  busy: string | null;
  devices: UuDeviceGroups;
  devicesLoaded: boolean;
  selectedDeviceId: string;
  assistanceConnectId: string;
  assistanceConnectCode: string;
  assistanceNotice: string;
  assistanceTargetPlatform: number;
  onLoadDevices: () => void;
  onOpenDevice: (deviceId: string) => void;
  onSelectDevice: (deviceId: string) => void;
  onAssistanceConnectIdChange: (value: string) => void;
  onAssistanceConnectCodeChange: (value: string) => void;
  onAssistanceTargetPlatformChange: (value: number) => void;
  onStartRemoteAssistance: () => void;
}) {
  const devicesLoading = busy === "devices" || !devicesLoaded;
  return (
    <Panel
      className="devices-panel device-list-panel"
      title="设备"
      icon={<Monitor size={18} />}
      action={
        <button className="toolbar-button" onClick={onLoadDevices} disabled={busy !== null}>
          {busy === "devices" ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
          刷新设备
        </button>
      }
    >
      <DeviceSection title="桌面端" devices={devices.desktopDevices} loading={devicesLoading} selected={selectedDeviceId} currentDeviceId={authStatus?.deviceId} onSelect={onSelectDevice} onConnect={onOpenDevice} />
      <DeviceSection title="移动端" devices={devices.mobileDevices} loading={devicesLoading} selected={selectedDeviceId} currentDeviceId={authStatus?.deviceId} onSelect={onSelectDevice} onConnect={onOpenDevice} />
      <DeviceSection title="TV" devices={devices.tvDevices} loading={devicesLoading} selected={selectedDeviceId} currentDeviceId={authStatus?.deviceId} onSelect={onSelectDevice} onConnect={onOpenDevice} />
      <RemoteAssistanceCard
        busy={busy}
        connectCode={assistanceConnectCode}
        connectId={assistanceConnectId}
        notice={assistanceNotice}
        platform={assistanceTargetPlatform}
        onConnectCodeChange={onAssistanceConnectCodeChange}
        onConnectIdChange={onAssistanceConnectIdChange}
        onPlatformChange={onAssistanceTargetPlatformChange}
        onStart={onStartRemoteAssistance}
      />
    </Panel>
  );
}
