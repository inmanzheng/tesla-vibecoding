import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@uurc/shared/streamerProtocol": new URL("../shared/src/streamerProtocol.ts", import.meta.url).pathname,
      "@uurc/shared/authState": new URL("../shared/src/authState.ts", import.meta.url).pathname,
      "@uurc/shared/constants": new URL("../shared/src/constants.ts", import.meta.url).pathname,
      "@uurc/shared/loginFlow": new URL("../shared/src/loginFlow.ts", import.meta.url).pathname,
      "@uurc/shared/remoteBootstrap": new URL("../shared/src/remoteBootstrap.ts", import.meta.url).pathname,
      "@uurc/shared/roomConfig": new URL("../shared/src/roomConfig.ts", import.meta.url).pathname,
      "@uurc/shared/types": new URL("../shared/src/types.ts", import.meta.url).pathname,
      "@uurc/shared": new URL("../shared/src/index.ts", import.meta.url).pathname,
    },
  },
});
