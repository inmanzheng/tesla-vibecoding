import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/wisp": {
        target: "ws://127.0.0.1:8787",
        ws: true,
      },
    },
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
