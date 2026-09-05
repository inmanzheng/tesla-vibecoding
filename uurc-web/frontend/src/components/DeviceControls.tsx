import { ChevronRight } from "lucide-react";

import type { UuDevice } from "@uurc/shared/types";

import { getDeviceConnectionLabel, getDeviceControlLabel, isDeviceOnline } from "../devices/deviceLabels.js";

export function DeviceSection({
  title,
  devices,
  loading,
  selected,
  currentDeviceId,
  onSelect,
  onConnect,
}: {
  title: string;
  devices: UuDevice[];
  loading?: boolean;
  selected: string;
  currentDeviceId?: string;
  onSelect: (deviceId: string) => void;
  onConnect?: (deviceId: string) => void;
}) {
  const onlineDevices = devices.filter((device) => isDeviceOnline(device));
  const offlineDevices = devices.filter((device) => !isDeviceOnline(device));

  const renderItem = (device: UuDevice) => {
    const online = isDeviceOnline(device);
    const canConnect = Boolean(onConnect && device.controllable && device.deviceId !== currentDeviceId);
    const className = [
      "device-item",
      canConnect ? "device-item-action" : "device-item-static",
      device.deviceId === selected ? "selected" : "",
      online ? "device-item-online" : "device-item-offline",
    ]
      .filter(Boolean)
      .join(" ");
    const controlLabel = getDeviceControlLabel(device);
    const content = (
      <>
        <span className="device-name">{device.alias}</span>
        <span className="device-item-meta">
          <small className={online ? "status-online" : "status-offline"}>{getDeviceConnectionLabel(device)}</small>
          {controlLabel ? <small>{controlLabel}</small> : null}
          {device.deviceId === currentDeviceId ? <small>本次登录设备</small> : null}
        </span>
        {canConnect ? (
          <span className="device-connect-link">
            连接
            <ChevronRight size={14} />
          </span>
        ) : null}
      </>
    );

    return canConnect ? (
      <button
        className={className}
        key={`${title}-${device.deviceId}`}
        aria-label={`连接 ${device.alias}`}
        onClick={() => {
          onSelect(device.deviceId);
          onConnect?.(device.deviceId);
        }}
      >
        {content}
      </button>
    ) : (
      <div className={className} key={`${title}-${device.deviceId}`}>
        {content}
      </div>
    );
  };

  return (
    <section className="device-section">
      <h3>{title}</h3>
      {devices.length ? (
        <>
          {onlineDevices.length ? (
            <div className="device-list">{onlineDevices.map(renderItem)}</div>
          ) : (
            <p className="empty-text">该类别暂无在线设备</p>
          )}
          {offlineDevices.length ? (
            <details className="device-offline-group">
              <summary>
                <span className="device-offline-summary-text">离线设备</span>
                <span className="device-offline-count">{offlineDevices.length}</span>
              </summary>
              <div className="device-list device-list-offline">{offlineDevices.map(renderItem)}</div>
            </details>
          ) : null}
        </>
      ) : (
        <p className="empty-text">{loading ? "正在加载设备…" : "该类别暂无设备"}</p>
      )}
    </section>
  );
}
