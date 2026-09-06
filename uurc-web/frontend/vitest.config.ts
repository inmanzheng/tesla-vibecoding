import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

function sharedSource(file: string): string {
  return fileURLToPath(new URL(`../shared/src/${file}`, import.meta.url));
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@uurc/shared/streamerProtocol": sharedSource("streamerProtocol.ts"),
      "@uurc/shared/authState": sharedSource("authState.ts"),
      "@uurc/shared/constants": sharedSource("constants.ts"),
      "@uurc/shared/loginFlow": sharedSource("loginFlow.ts"),
      "@uurc/shared/remoteBootstrap": sharedSource("remoteBootstrap.ts"),
      "@uurc/shared/roomConfig": sharedSource("roomConfig.ts"),
      "@uurc/shared/types": sharedSource("types.ts"),
      "@uurc/shared": sharedSource("index.ts"),
    },
  },
});
