import { summarizeAuthState } from "@uurc/shared/authState";
import type { AuthStatus, LoginState } from "@uurc/shared/types";

const LOGIN_STATE_KEY = "uurc.loginState";

// 车机浏览器（尤其经视频站白名单全屏跳转后）可能把页面放进沙箱 iframe，
// 此时 window.localStorage 访问会抛 SecurityError。这里做一层容错：
// 写时同时落 localStorage 与 cookie，读时 localStorage 优先、失败回退 cookie，
// 行为永不抛错，保证登录态尽量跨会话保留、且不因存储不可用而让页面崩溃。
function persist(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage 不可用（隐私模式 / 沙箱）时忽略，交给 cookie。
  }
  try {
    writeCookie(key, value);
  } catch {
    // cookie 也不可用时忽略，本次会话内仍由内存态维持。
  }
}

function read(key: string): string | null {
  try {
    const fromStorage = window.localStorage.getItem(key);
    if (fromStorage != null) return fromStorage;
  } catch {
    // localStorage 不可用，继续尝试 cookie。
  }
  try {
    return readCookie(key);
  } catch {
    return null;
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 忽略
  }
  try {
    eraseCookie(key);
  } catch {
    // 忽略
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 180; // 180 天
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function eraseCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0`;
}

export function getStoredLoginState(): Partial<LoginState> | null {
  const raw = read(LOGIN_STATE_KEY);
  if (!raw) return null;

  try {
    return normalizeLoginState(JSON.parse(raw));
  } catch {
    remove(LOGIN_STATE_KEY);
    return null;
  }
}

export function getStoredAuthStatus(): AuthStatus {
  return summarizeAuthState(getStoredLoginState());
}

export function clearStoredLoginState(): AuthStatus {
  remove(LOGIN_STATE_KEY);
  return summarizeAuthState(null);
}

export function importStoredLoginState(input: unknown): AuthStatus {
  const state = normalizeLoginState(input);
  persist(LOGIN_STATE_KEY, JSON.stringify(state));
  return summarizeAuthState(state);
}

export function patchStoredLoginState(input: Partial<LoginState>): AuthStatus {
  const next = normalizeLoginState({
    ...(getStoredLoginState() ?? {}),
    ...input,
  });
  persist(LOGIN_STATE_KEY, JSON.stringify(next));
  return summarizeAuthState(next);
}

export function exportStoredLoginState(): LoginState {
  const state = getStoredLoginState();
  if (!state) throw new Error("No login state available");
  return state as LoginState;
}

function normalizeLoginState(input: unknown): Partial<LoginState> {
  const record = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  return {
    token: stringValue(record.token),
    userId: stringValue(record.userId ?? record.user_id),
    clientId: stringValue(record.clientId ?? record.client_id),
    deviceId: stringValue(record.deviceId ?? record.device_id),
    oaid: stringValue(record.oaid),
    uuid: stringValue(record.uuid),
    channel: stringValue(record.channel),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
