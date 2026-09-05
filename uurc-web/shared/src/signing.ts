import { createHmac } from "node:crypto";

import {
  APP_PACKAGE,
  APP_SIGNING_KEY,
  VERSION_CODE,
  VERSION_NAME,
} from "./constants.js";
import type { LoginState } from "./types.js";

export interface HeaderOverrides {
  channel?: string;
  operator?: string;
  abi?: string;
  clientId?: string;
  timestamp?: number;
  country?: string;
  language?: string;
}

export function buildCommonHeaders(
  state: Partial<LoginState>,
  overrides: HeaderOverrides = {},
): Record<string, string> {
  return {
    "X-Param-CHN": overrides.channel ?? state.channel ?? "nochannel",
    "X-Param-OPR": overrides.operator ?? "",
    "X-Param-PKGN": APP_PACKAGE,
    "X-Param-PLAT": "2",
    "X-Param-REL": "prod",
    "X-Param-VC": VERSION_CODE,
    "X-Param-VN": VERSION_NAME,
    "X-Param-ABI": overrides.abi ?? "arm64-v8a",
    "X-Param-client-id": overrides.clientId ?? state.clientId ?? "",
    "X-Param-device-id": state.deviceId ?? "",
    "X-Param-user-id": state.userId ?? "",
    "X-Param-OAID": state.oaid ?? "",
    "X-Param-TS": String(overrides.timestamp ?? Math.floor(Date.now() / 1000)),
    "X-Param-CNT": overrides.country ?? "CN",
    "X-Param-LANG": overrides.language ?? "zh-CN",
  };
}

export function buildSignatureBase({
  method,
  pathWithQuery,
  headers,
  body = "",
}: {
  method: string;
  pathWithQuery: string;
  headers: Record<string, string | number | undefined | null>;
  body?: string;
}): string {
  const xParam = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value] as const)
    .filter(([name]) => name.startsWith("x-param-"))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${value ?? ""}`)
    .join("&");

  return `${method.toUpperCase()}${pathWithQuery}${xParam}${body}`;
}

export function hmacSha256Hex(input: string): string {
  return createHmac("sha256", APP_SIGNING_KEY).update(input).digest("hex");
}

export function buildSignedHeaders({
  state,
  method,
  pathWithQuery,
  body = "",
  overrides = {},
}: {
  state: Partial<LoginState>;
  method: string;
  pathWithQuery: string;
  body?: string;
  overrides?: HeaderOverrides;
}): Record<string, string> {
  const headers = buildCommonHeaders(state, overrides);
  headers["X-Param-SIGN"] = hmacSha256Hex(buildSignatureBase({ method, pathWithQuery, headers, body }));

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  return headers;
}
