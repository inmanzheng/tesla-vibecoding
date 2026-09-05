import { describe, expect, it } from "vitest";
import {
  buildCommonHeaders,
  buildSignatureBase,
  buildSignedHeaders,
  hmacSha256Hex,
} from "../src/index.js";

const loginState = {
  token: "header.payload.signature",
  userId: "user-123",
  clientId: "client-456",
  deviceId: "device-789",
  oaid: "oaid-abc",
  uuid: "uuid-def",
  channel: "official",
};

describe("UU request signing", () => {
  it("orders lowercase X-Param headers before hashing the request", () => {
    const headers = {
      "X-Param-user-id": "user-123",
      "X-Param-TS": "1710000000",
      "Content-Type": "application/json",
      "X-Param-device-id": "device-789",
    };

    expect(
      buildSignatureBase({
        method: "post",
        pathWithQuery: "/api/v1/example?b=2&a=1",
        headers,
        body: "{\"ok\":true}",
      }),
    ).toBe(
      "POST/api/v1/example?b=2&a=1x-param-device-id=device-789&x-param-ts=1710000000&x-param-user-id=user-123{\"ok\":true}",
    );
  });

  it("builds common Android headers with deterministic overrides", () => {
    expect(
      buildCommonHeaders(loginState, {
        timestamp: 1710000000,
        abi: "arm64-v8a",
        country: "CN",
        language: "zh-CN",
      }),
    ).toMatchObject({
      "X-Param-CHN": "official",
      "X-Param-PKGN": "com.netease.uuremote",
      "X-Param-VC": "423000",
      "X-Param-VN": "4.23.0",
      "X-Param-client-id": "client-456",
      "X-Param-device-id": "device-789",
      "X-Param-user-id": "user-123",
      "X-Param-OAID": "oaid-abc",
      "X-Param-TS": "1710000000",
    });
  });

  it("adds Authorization and a reproducible HMAC signature", () => {
    const headers = buildSignedHeaders({
      state: loginState,
      method: "GET",
      pathWithQuery: "/api/v1/device/groups/of/my",
      overrides: { timestamp: 1710000000 },
    });

    const unsigned = { ...headers };
    delete unsigned["X-Param-SIGN"];
    delete unsigned.Authorization;

    expect(headers.Authorization).toBe("Bearer header.payload.signature");
    expect(headers["X-Param-SIGN"]).toBe(
      hmacSha256Hex(
        buildSignatureBase({
          method: "GET",
          pathWithQuery: "/api/v1/device/groups/of/my",
          headers: unsigned,
          body: "",
        }),
      ),
    );
  });
});
