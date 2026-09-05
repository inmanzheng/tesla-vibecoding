import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { DeviceListPage } from "./components/DeviceListPage.js";
import { LoginPage } from "./components/LoginPage.js";
import { RemoteControlPage } from "./components/RemoteControlPage.js";
import { Toast } from "./components/Toast.js";
import { useRemoteControlController } from "./controllers/useRemoteControlController.js";
import "./styles/index.css";

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

function AppRoutes() {
  const controller = useRemoteControlController();
  const loginPage = <LoginPage {...controller.loginPageProps} />;

  let content: ReactNode;
  if (controller.authLoading) {
    content = (
      <main className="product-shell auth-product-shell" aria-label="正在恢复账号凭证">
        <p className="empty-text">正在恢复账号凭证...</p>
      </main>
    );
  } else if (!controller.loggedIn) {
    content = (
      <Routes>
        <Route path="/login" element={loginPage} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  } else {
    const deviceListPage = <DeviceListPage {...controller.deviceListPageProps} />;
    const controlPage = <RemoteControlPage {...controller.controlPageProps} />;
    content = (
      <Routes>
        <Route path="/" element={<Navigate to="/devices" replace />} />
        <Route path="/login" element={<Navigate to="/devices" replace />} />
        <Route path="/devices" element={deviceListPage} />
        <Route path="/devices/:deviceId/control" element={controlPage} />
        <Route path="*" element={<Navigate to="/devices" replace />} />
      </Routes>
    );
  }

  return (
    <>
      {content}
      <Toast toast={controller.toast} onDismiss={controller.onDismissToast} />
    </>
  );
}
