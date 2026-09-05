import { Github, TerminalSquare } from "lucide-react";

import type { AuthStatus, UuDeviceGroups } from "@uurc/shared/types";

import { DeviceAccountPanel } from "./DeviceAccountPanel.js";
import { DeviceCatalogPanel } from "./DeviceCatalogPanel.js";
import { FullscreenLauncher } from "./FullscreenLauncher.js";

export function DeviceListPage({
  authStatus,
  authJson,
  devices,
  devicesLoaded,
  selectedDeviceId,
  assistanceConnectId,
  assistanceConnectCode,
  assistanceNotice,
  assistanceTargetPlatform,
  identitySourceLabel,
  identityDeviceLabel,
  error,
  busy,
  onLoadDevices,
  onSelectDevice,
  onOpenDevice,
  onAssistanceConnectIdChange,
  onAssistanceConnectCodeChange,
  onAssistanceTargetPlatformChange,
  onStartRemoteAssistance,
  onExport,
  onCopyAuthJson,
  onLogout,
}: {
  authStatus: AuthStatus | null;
  authJson: string;
  devices: UuDeviceGroups;
  devicesLoaded: boolean;
  selectedDeviceId: string;
  assistanceConnectId: string;
  assistanceConnectCode: string;
  assistanceNotice: string;
  assistanceTargetPlatform: number;
  identitySourceLabel: string;
  identityDeviceLabel: string;
  error: string;
  busy: string | null;
  onLoadDevices: () => void;
  onSelectDevice: (deviceId: string) => void;
  onOpenDevice: (deviceId: string) => void;
  onAssistanceConnectIdChange: (value: string) => void;
  onAssistanceConnectCodeChange: (value: string) => void;
  onAssistanceTargetPlatformChange: (value: number) => void;
  onStartRemoteAssistance: () => void;
  onExport: () => void;
  onCopyAuthJson: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="product-shell">
      <header className="product-topbar">
        <div className="brand-block">
          <span className="wordmark">UU Remote<span className="wordmark-sub">Web</span></span>
          <h1>我的设备</h1>
        </div>
        <a
          className="repo-link"
          href="https://github.com/iola1999/uurc-web"
          target="_blank"
          rel="noreferrer"
          aria-label="在 GitHub 查看源码"
        >
          <Github size={16} />
          GitHub
        </a>
      </header>

      {error ? (
        <section className="error-strip" role="alert" aria-live="assertive">
          <TerminalSquare size={18} />
          <span>{error}</span>
        </section>
      ) : null}

      <section className="device-home">
        <DeviceCatalogPanel
          authStatus={authStatus}
          devices={devices}
          devicesLoaded={devicesLoaded}
          busy={busy}
          selectedDeviceId={selectedDeviceId}
          assistanceConnectId={assistanceConnectId}
          assistanceConnectCode={assistanceConnectCode}
          assistanceNotice={assistanceNotice}
          assistanceTargetPlatform={assistanceTargetPlatform}
          onSelectDevice={onSelectDevice}
          onOpenDevice={onOpenDevice}
          onLoadDevices={onLoadDevices}
          onAssistanceConnectIdChange={onAssistanceConnectIdChange}
          onAssistanceConnectCodeChange={onAssistanceConnectCodeChange}
          onAssistanceTargetPlatformChange={onAssistanceTargetPlatformChange}
          onStartRemoteAssistance={onStartRemoteAssistance}
        />

        <aside className="account-drawer" aria-label="账号管理">
          <DeviceAccountPanel
            authJson={authJson}
            authStatus={authStatus}
            busy={busy}
            identityDeviceLabel={identityDeviceLabel}
            identitySourceLabel={identitySourceLabel}
            onExport={onExport}
            onCopyAuthJson={onCopyAuthJson}
            onLogout={onLogout}
          />
          <FullscreenLauncher />
        </aside>
      </section>
    </main>
  );
}
