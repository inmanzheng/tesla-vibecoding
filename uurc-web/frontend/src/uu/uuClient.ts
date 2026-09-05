import { assertLoginState, decodeJwtPayload } from "@uurc/shared/authState";
import { DEVICE_GROUPS_PATH } from "@uurc/shared/constants";
import {
  buildAndroidDeviceInitRequest,
  buildMobileCodeRequest,
  buildMobileLoginRequest,
  normalizeDeviceInitResult,
  normalizeMobileLoginResult,
} from "@uurc/shared/loginFlow";
import { createRemoteControlBootstrap } from "@uurc/shared/remoteBootstrap";
import type {
  AndroidDeviceInitProfile,
  AuthStatus,
  LoginState,
  MobileLoginResult,
  RemoteAssistanceControlMode,
  RemoteAssistanceControlModeResult,
  RemoteAssistanceJoinInput,
  RemoteAssistanceJoinResult,
  RemoteControlBootstrap,
  RoomAppFlagUpdateInput,
  RoomAppFlagUpdateResult,
  RoomJoinResult,
  RoomJoinUpstreamSummary,
  UuResponse,
  UuTransport,
} from "@uurc/shared/types";

import { flattenDeviceGroups } from "../devices/deviceSummary.js";
import { LocalProxyTransport } from "../transport/localProxyTransport.js";
import {
  clearStoredLoginState,
  exportStoredLoginState,
  getStoredAuthStatus,
  getStoredLoginState,
  importStoredLoginState,
  patchStoredLoginState,
} from "./loginStateStore.js";
import { createSyntheticAndroidProfile } from "./profile.js";
import { clearRoomSession, getRoomSession, saveRemoteAssistanceRoomJoinResult, saveRoomJoinResult, summarizeUpstreamForClient } from "./roomSessionStore.js";
import { buildSignedHeaders, assertAllowedUuApiPath } from "./signing.js";

const REMOTE_ASSISTANCE_CONFIRMATION_REQUIRED_CODE = 0x470;
const REMOTE_ASSISTANCE_CONTROL_MODES = new Set<RemoteAssistanceControlMode>([
  "by_password",
  "by_confirmation",
  "password_confirmation",
]);

export class BrowserUuClient {
  constructor(private readonly transport: UuTransport = new LocalProxyTransport()) {}

  async signedRequest<TBody = unknown>({
    method,
    path,
    body,
    state = getStoredLoginState() ?? {},
    requireAuth = true,
  }: {
    method: string;
    path: string;
    body?: unknown;
    state?: Partial<LoginState>;
    requireAuth?: boolean;
  }): Promise<UuResponse<TBody>> {
    assertAllowedUuApiPath(path);
    if (requireAuth) {
      assertLoginState(state);
    }

    const bodyText = body === undefined ? "" : JSON.stringify(body);
    const headers = await buildSignedHeaders({
      state,
      method,
      pathWithQuery: path,
      body: bodyText,
    });
    if (bodyText) {
      headers["Content-Type"] = "application/json; charset=utf-8";
    }

    const response = await this.transport.request<TBody>({
      method,
      path,
      body,
      headers,
    });

    return {
      status: response.status,
      statusText: response.status === 200 ? "OK" : undefined,
      headers: response.headers,
      body: response.body,
    };
  }
}

const uuApi = new BrowserUuClient();

export function getAuthStatus(): AuthStatus {
  return getStoredAuthStatus();
}

export function clearAuthState(): AuthStatus {
  clearRoomSession();
  return clearStoredLoginState();
}

export function importAuthState(rawJson: string): AuthStatus {
  return importStoredLoginState(JSON.parse(rawJson));
}

export function exportAuthState(): LoginState {
  return exportStoredLoginState();
}

export async function createMobileDevice(profileOverrides: Partial<AndroidDeviceInitProfile> = {}): Promise<{ status: AuthStatus; deviceId: string; upstream: UuResponse }> {
  const currentState = getStoredLoginState() ?? {};
  if (currentState.deviceId) {
    return {
      status: getStoredAuthStatus(),
      deviceId: currentState.deviceId,
      upstream: {
        status: 200,
        statusText: "Already Initialized",
        headers: {},
        body: { code: 0, data: { device_id: currentState.deviceId }, local: true },
      },
    };
  }

  const { state, profile } = createSyntheticAndroidProfile(currentState, profileOverrides);
  const request = buildAndroidDeviceInitRequest(profile);
  const upstream = await uuApi.signedRequest({
    state,
    method: request.method,
    path: request.path,
    body: request.body,
    requireAuth: false,
  });
  assertUpstreamOk(upstream.body);

  const deviceId = normalizeDeviceInitResult(upstream.body);
  const status = patchStoredLoginState({
    ...state,
    deviceId,
  });

  return { status, deviceId, upstream };
}

export async function sendMobileCode(input: { regionCode: string; mobile: string }): Promise<{ status: AuthStatus; deviceId: string; upstream: UuResponse }> {
  const device = await createMobileDevice();
  const request = buildMobileCodeRequest(normalizeMobileInput(input));
  const upstream = await uuApi.signedRequest({
    state: getStoredLoginState() ?? {},
    method: request.method,
    path: request.path,
    body: request.body,
    requireAuth: false,
  });
  assertUpstreamOk(upstream.body);

  return {
    status: getStoredAuthStatus(),
    deviceId: device.deviceId,
    upstream,
  };
}

export async function loginByMobile(input: { regionCode: string; mobile: string; code: string }): Promise<{ status: AuthStatus; login: Omit<MobileLoginResult, "token">; upstream: UuResponse }> {
  await createMobileDevice();
  const request = buildMobileLoginRequest(normalizeMobileLoginInput(input));
  const upstream = await uuApi.signedRequest({
    state: getStoredLoginState() ?? {},
    method: request.method,
    path: request.path,
    body: request.body,
    requireAuth: false,
  });
  assertUpstreamOk(upstream.body);

  const login = normalizeMobileLoginResult(upstream.body);
  const payload = decodeJwtPayload(login.token);
  const tokenClientId = typeof payload.client_id === "string" ? payload.client_id : "";
  const status = patchStoredLoginState({
    token: login.token,
    userId: login.userId,
    clientId: getStoredLoginState()?.clientId || tokenClientId,
  });

  return {
    status,
    login: {
      userId: login.userId,
      nickName: login.nickName,
    },
    upstream,
  };
}

export async function getDeviceGroups() {
  const response = await uuApi.signedRequest({ method: "GET", path: DEVICE_GROUPS_PATH });
  return flattenDeviceGroups(response);
}

export async function joinRoomByDevice(deviceId: string, forceJoin: boolean): Promise<RoomJoinResult> {
  const upstream = await uuApi.signedRequest({
    method: "POST",
    path: `/api/v1/room/join/by_device/${encodeURIComponent(deviceId)}`,
    body: { force_join: forceJoin },
  });
  return saveRoomJoinResult({ deviceId, forceJoin, upstream });
}

export async function clearRoomByDevice(deviceId: string): Promise<RoomJoinUpstreamSummary> {
  const upstream = await uuApi.signedRequest({
    method: "POST",
    path: `/api/v1/room/clear/by_device/${encodeURIComponent(deviceId)}`,
  });
  return summarizeUpstreamForClient(upstream);
}

export async function getRemoteAssistanceControlMode(connectId: string): Promise<RemoteAssistanceControlModeResult> {
  const normalizedConnectId = normalizeRemoteAssistanceConnectId(connectId);
  const upstream = await uuApi.signedRequest({
    method: "POST",
    path: "/api/v2/room/share/control_mode",
    body: { connect_id: normalizedConnectId },
  });
  const body = asRecord(upstream.body);
  const data = asRecord(body?.data) ?? body;

  return {
    upstream: summarizeUpstreamForClient(upstream),
    connectId: normalizedConnectId,
    canRemoteControl: data?.can_remote_control === true,
    controlMode: remoteAssistanceControlModeValue(data?.control_mode),
  };
}

export async function joinRemoteAssistanceByCode(input: RemoteAssistanceJoinInput): Promise<RemoteAssistanceJoinResult> {
  const connectId = normalizeRemoteAssistanceConnectId(input.connectId);
  const connectCode = normalizeRemoteAssistanceConnectCode(input.connectCode);
  const upstream = await uuApi.signedRequest({
    method: "POST",
    path: "/api/v2/room/join/share/by_code",
    body: {
      connect_id: connectId,
      connect_code: connectCode,
    },
  });
  return buildRemoteAssistanceJoinResult({
    connectId,
    connectCodeProvided: true,
    controlId: input.controlId,
    controlMode: input.controlMode,
    targetPlatform: input.targetPlatform,
    upstream,
    usedConfirmation: false,
  });
}

export async function joinRemoteAssistanceByConfirmation(input: RemoteAssistanceJoinInput): Promise<RemoteAssistanceJoinResult> {
  const connectId = normalizeRemoteAssistanceConnectId(input.connectId);
  const controlId = normalizeOptionalString(input.controlId);
  const upstream = await uuApi.signedRequest({
    method: "POST",
    path: "/api/v2/room/join/share/by_confirmation",
    body: {
      connect_id: connectId,
      ...(controlId ? { control_id: controlId } : {}),
    },
  });
  return buildRemoteAssistanceJoinResult({
    connectId,
    connectCodeProvided: Boolean(input.connectCode?.trim()),
    controlId,
    controlMode: input.controlMode,
    targetPlatform: input.targetPlatform,
    upstream,
    usedConfirmation: true,
  });
}

export async function cancelRemoteAssistance(connectId: string): Promise<RoomJoinUpstreamSummary> {
  const upstream = await uuApi.signedRequest({
    method: "POST",
    path: "/api/v2/room/share/cancel_remote_assist",
    body: { connect_id: normalizeRemoteAssistanceConnectId(connectId) },
  });
  return summarizeUpstreamForClient(upstream);
}

export async function updateRoomAppFlag(input: RoomAppFlagUpdateInput): Promise<RoomAppFlagUpdateResult> {
  const upstream = await uuApi.signedRequest({
    method: "POST",
    path: "/api/v1/room/app_flag",
    body: {
      publisher_device_id: input.publisherDeviceId,
      app_flag: {
        control_mode: input.controlMode,
      },
    },
  });

  return {
    upstream: summarizeUpstreamForClient(upstream),
    appFlag: {
      controlMode: input.controlMode,
    },
  };
}

export function getRemoteBootstrap(): RemoteControlBootstrap {
  const session = getRoomSession();
  if (!session) {
    throw new Error("Join a room before starting remote control");
  }
  const bootstrap = createRemoteControlBootstrap({
    roomConfig: session.roomConfig,
    joinContext: session.joinContext,
  });
  if (!bootstrap) {
    throw new Error("Room config is incomplete");
  }
  return bootstrap;
}

export function getRemoteSignalStartContext() {
  const session = getRoomSession();
  if (!session) {
    throw new Error("Join a room before starting remote control");
  }
  return {
    roomConfig: session.roomConfig,
    joinContext: session.joinContext,
  };
}

function normalizeMobileInput(input: { regionCode: string; mobile: string }) {
  const regionCode = input.regionCode.trim() || "86";
  const mobile = input.mobile.trim();
  if (!mobile) {
    throw new Error("mobile is required");
  }
  return { regionCode, mobile };
}

function normalizeMobileLoginInput(input: { regionCode: string; mobile: string; code: string }) {
  const normalized = normalizeMobileInput(input);
  const code = input.code.trim();
  if (!code) {
    throw new Error("code is required");
  }
  return { ...normalized, code };
}

function normalizeRemoteAssistanceConnectId(connectId: string): string {
  const normalized = connectId.trim();
  if (!normalized) {
    throw new Error("请输入伙伴的设备 ID");
  }
  if (!/^\d{6,12}$/.test(normalized)) {
    throw new Error("伙伴设备 ID 应为 6-12 位数字");
  }
  return normalized;
}

function normalizeRemoteAssistanceConnectCode(connectCode: string | undefined): string {
  const normalized = connectCode?.trim() ?? "";
  if (!normalized) {
    throw new Error("请输入伙伴的设备验证码");
  }
  return normalized;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function buildRemoteAssistanceJoinResult(input: {
  connectId: string;
  connectCodeProvided: boolean;
  controlId?: string;
  controlMode?: RemoteAssistanceControlMode | null;
  targetPlatform?: number;
  upstream: UuResponse;
  usedConfirmation: boolean;
}): RemoteAssistanceJoinResult {
  const deviceName = readNestedString(input.upstream.body, "device_name");
  const targetPlatform = input.targetPlatform
    ?? readNestedNumber(input.upstream.body, "platform")
    ?? readNestedNumber(input.upstream.body, "device_platform")
    ?? readNestedNumber(input.upstream.body, "publisher_platform");
  const controlId = input.controlId ?? readNestedString(input.upstream.body, "control_id");
  const result = saveRemoteAssistanceRoomJoinResult({
    connectId: input.connectId,
    connectCodeProvided: input.connectCodeProvided,
    controlId,
    controlMode: input.controlMode,
    deviceName,
    targetPlatform,
    upstream: input.upstream,
  });
  const responseCode = result.upstream.body.code;

  return {
    ...result,
    assistance: {
      connectId: input.connectId,
      connectCodeProvided: input.connectCodeProvided,
      confirmationRequired: responseCode === REMOTE_ASSISTANCE_CONFIRMATION_REQUIRED_CODE,
      usedConfirmation: input.usedConfirmation,
      controlId,
      controlMode: input.controlMode,
      deviceName,
      targetPlatform,
    },
  };
}

function remoteAssistanceControlModeValue(value: unknown): RemoteAssistanceControlMode | null {
  if (typeof value !== "string") return null;
  return REMOTE_ASSISTANCE_CONTROL_MODES.has(value as RemoteAssistanceControlMode) ? (value as RemoteAssistanceControlMode) : null;
}

function readNestedString(value: unknown, key: string): string | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const direct = record[key];
  if (typeof direct === "string" && direct.trim()) return direct;
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = readNestedString(item, key);
        if (found) return found;
      }
      continue;
    }
    const found = readNestedString(child, key);
    if (found) return found;
  }
  return undefined;
}

function readNestedNumber(value: unknown, key: string): number | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const direct = record[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  if (typeof direct === "string" && direct.trim()) {
    const parsed = Number(direct);
    if (Number.isFinite(parsed)) return parsed;
  }
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = readNestedNumber(item, key);
        if (found !== undefined) return found;
      }
      continue;
    }
    const found = readNestedNumber(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function assertUpstreamOk(body: unknown): void {
  if (!isRecord(body)) return;
  const code = body.code;
  if (typeof code === "number" && code !== 0) {
    const message = typeof body.msg === "string" ? body.msg : typeof body.message === "string" ? body.message : `UU upstream code ${code}`;
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
