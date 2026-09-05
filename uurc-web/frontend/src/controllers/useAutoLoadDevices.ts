import { useEffect } from "react";

export function useAutoLoadDevices({
  loggedIn,
  devicesLoaded,
  busy,
  loadDevices,
}: {
  loggedIn: boolean;
  devicesLoaded: boolean;
  busy: unknown;
  loadDevices: () => void;
}) {
  useEffect(() => {
    if (!loggedIn || devicesLoaded || busy !== null) return;
    loadDevices();
  }, [loggedIn, devicesLoaded, busy, loadDevices]);
}
