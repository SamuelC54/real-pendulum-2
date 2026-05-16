import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const devPort = Number(env.VITE_DEV_PORT ?? 5173);
  const controlApiPort = Number(env.CONTROL_API_PORT ?? 4000);
  const controlApiTarget = `http://127.0.0.1:${controlApiPort}`;

  return {
  envDir: repoRoot,
  plugins: [
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: devPort,
    strictPort: true,
    proxy: {
      "/trpc": {
        target: controlApiTarget,
        changeOrigin: true,
        configure(proxy) {
          proxy.on("error", (err, _req, res) => {
            console.error(
              `[vite] /trpc proxy → ${controlApiTarget} failed (${err.message}). ` +
                `Start control-api (npm run dev from repo root, or dev -w @real-pendulum/control-api).`,
            );
            if (res && !res.headersSent && "writeHead" in res) {
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error: `control-api not reachable at ${controlApiTarget}`,
                }),
              );
            }
          });
        },
      },
    },
  },
};
});
