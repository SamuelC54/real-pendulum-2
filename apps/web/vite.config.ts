import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { config, e2eRealWebPort } from "../../packages/app-config/src/config.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const appConfigRoot = path.join(repoRoot, "packages/app-config/src");

export default defineConfig(({ mode }) => {
  const e2eFake = mode === "e2e";
  const e2eReal = mode === "e2e-real";
  const devPort = e2eFake
    ? config.e2e.fakeWebPort
    : e2eReal
      ? e2eRealWebPort()
      : config.web.devPort;
  const controlApiPort = e2eFake
    ? config.e2e.fakeControlApiPort
    : config.controlApi.port;
  const controlApiTarget = `http://127.0.0.1:${controlApiPort}`;

  return {
    define: {
      __PENDULUM_VITE_MODE__: JSON.stringify(mode),
    },
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
        "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src"),
        "@real-pendulum/app-config": path.join(appConfigRoot, "config.ts"),
        "@real-pendulum/app-config/cli": path.join(appConfigRoot, "cli.ts"),
        "@real-pendulum/app-config/node": path.join(appConfigRoot, "node.ts"),
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
                  `Start control-api (npm run dev from repo root).`,
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
