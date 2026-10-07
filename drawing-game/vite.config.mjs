import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import buildHelpers from "./scripts/build-client.js";
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, root, ""), ...process.env };
  const serverUrl = buildHelpers.validateServerUrl(
    env.GAME_SERVER_URL,
    Boolean(env.VERCEL),
  );
  return {
    root: path.join(root, "client"),
    define: { __GAME_SERVER_URL__: JSON.stringify(serverUrl) },
    server: {
      host: "0.0.0.0",
      proxy: {
        "/socket.io": {
          target: `http://127.0.0.1:${env.PORT || 3000}`,
          ws: true,
        },
      },
    },
    build: {
      outDir: path.join(root, "dist"),
      emptyOutDir: true,
    },
  };
});
