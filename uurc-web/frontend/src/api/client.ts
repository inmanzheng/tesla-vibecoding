import type {
  AuthStatus,
  LoginState,
  RemoteControlBootstrap,
  RemoteSignalControlRequest,
  RemoteSignalControlResult,
  RemoteSignalGatewayEvent,
  RemoteSignalGatewayStartRequest,
  RemoteSignalGatewayStatus,
  RemoteSignalReadinessDiagnostics,
  RemoteSignalSoacRequest,
  RemoteSignalSoacResult,
  RoomAppFlagUpdateInput,
  RoomAppFlagUpdateResult,
  RoomJoinUpstreamSummary,
  RoomJoinResult,
  RuntimeProfile,
  RemoteAssistanceControlModeResult,
  RemoteAssistanceJoinInput,
  RemoteAssistanceJoinResult,
  UuDeviceGroups,
  UuResponse,
} from "@uurc/shared/types";
import {
  cancelRemoteAssistance as cancelRemoteAssistanceViaFrontend,
  clearRoomByDevice as clearRoomByDeviceViaFrontend,
  clearAuthState as clearAuthStateFromFrontend,
  createMobileDevice as createMobileDeviceViaFrontend,
  exportAuthState as exportAuthStateFromFrontend,
  getAuthStatus as getAuthStatusFromFrontend,
  getDeviceGroups as getDeviceGroupsViaFrontend,
  getRemoteAssistanceControlMode as getRemoteAssistanceControlModeViaFrontend,
  getRemoteBootstrap as getRemoteBootstrapFromFrontend,
  getRemoteSignalStartContext,
  importAuthState as importAuthStateToFrontend,
  joinRemoteAssistanceByCode as joinRemoteAssistanceByCodeViaFrontend,
  joinRemoteAssistanceByConfirmation as joinRemoteAssistanceByConfirmationViaFrontend,
  joinRoomByDevice as joinRoomByDeviceViaFrontend,
  loginByMobile as loginByMobileViaFrontend,
  sendMobileCode as sendMobileCodeViaFrontend,
  updateRoomAppFlag as updateRoomAppFlagViaFrontend,
} from "../uu/uuClient.js";

export async function getAuthStatus(): Promise<AuthStatus> {
  return getAuthStatusFromFrontend();
}

export async function getRuntimeProfile(): Promise<RuntimeProfile> {
  return apiRequest<RuntimeProfile>("/api/runtime");
}

export async function clearAuthState(): Promise<AuthStatus> {
  return clearAuthStateFromFrontend();
}

export async function importAuthState(rawJson: string): Promise<AuthStatus> {
  return importAuthStateToFrontend(rawJson);
}

export async function exportAuthState(): Promise<LoginState> {
  return exportAuthStateFromFrontend();
}

export async function createMobileDevice(): Promise<{ status: AuthStatus; deviceId: string; upstream: UuResponse }> {
  return createMobileDeviceViaFrontend();
}

export async function sendMobileCode(input: { regionCode: string; mobile: string }): Promise<{ status: AuthStatus; deviceId: string; upstream: UuResponse }> {
  return sendMobileCodeViaFrontend(input);
}

export async function loginByMobile(input: {
  regionCode: string;
  mobile: string;
  code: string;
}): Promise<{ status: AuthStatus; login: { userId: string; nickName: string }; upstream: UuResponse }> {
  return loginByMobileViaFrontend(input);
}

export async function getDeviceGroups(): Promise<UuDeviceGroups> {
  return getDeviceGroupsViaFrontend();
}

export async function joinRoomByDevice(deviceId: string, forceJoin: boolean): Promise<RoomJoinResult> {
  return joinRoomByDeviceViaFrontend(deviceId, forceJoin);
}

export async function clearRoomByDevice(deviceId: string): Promise<RoomJoinUpstreamSummary> {
  return clearRoomByDeviceViaFrontend(deviceId);
}

export async function getRemoteAssistanceControlMode(connectId: string): Promise<RemoteAssistanceControlModeResult> {
  return getRemoteAssistanceControlModeViaFrontend(connectId);
}

export async function joinRemoteAssistanceByCode(input: RemoteAssistanceJoinInput): Promise<RemoteAssistanceJoinResult> {
  return joinRemoteAssistanceByCodeViaFrontend(input);
}

export async function joinRemoteAssistanceByConfirmation(input: RemoteAssistanceJoinInput): Promise<RemoteAssistanceJoinResult> {
  return joinRemoteAssistanceByConfirmationViaFrontend(input);
}

export async function cancelRemoteAssistance(connectId: string): Promise<RoomJoinUpstreamSummary> {
  return cancelRemoteAssistanceViaFrontend(connectId);
}

export async function updateRoomAppFlag(input: RoomAppFlagUpdateInput): Promise<RoomAppFlagUpdateResult> {
  return updateRoomAppFlagViaFrontend(input);
}

export async function getRemoteBootstrap(): Promise<RemoteControlBootstrap> {
  return getRemoteBootstrapFromFrontend();
}

export async function startRemoteSignalGateway(input: RemoteSignalGatewayStartRequest = {}): Promise<RemoteSignalGatewayStatus> {
  return apiRequest<RemoteSignalGatewayStatus>("/api/remote/signal/start", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      ...getRemoteSignalStartContext(),
    }),
  });
}

export async function getRemoteSignalGatewayStatus(): Promise<RemoteSignalGatewayStatus> {
  return apiRequest<RemoteSignalGatewayStatus>("/api/remote/signal/status");
}

export async function stopRemoteSignalGateway(): Promise<RemoteSignalGatewayStatus> {
  return apiRequest<RemoteSignalGatewayStatus>("/api/remote/signal", {
    method: "DELETE",
  });
}

export async function getRemoteSignalEvents(): Promise<RemoteSignalGatewayEvent[]> {
  return apiRequest<RemoteSignalGatewayEvent[]>("/api/remote/signal/events");
}

export async function getRemoteSignalDiagnostics(): Promise<RemoteSignalReadinessDiagnostics> {
  return apiRequest<RemoteSignalReadinessDiagnostics>("/api/remote/signal/diagnostics");
}

export async function sendRemoteSignalControl(input: RemoteSignalControlRequest): Promise<RemoteSignalControlResult> {
  return apiRequest<RemoteSignalControlResult>("/api/remote/signal/control", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function sendRemoteSignalSoac(input: RemoteSignalSoacRequest): Promise<RemoteSignalSoacResult> {
  return apiRequest<RemoteSignalSoacResult>("/api/remote/signal/soac", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return body as T;
}
