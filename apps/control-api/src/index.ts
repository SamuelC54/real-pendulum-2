import { config as loadRootEnv } from "dotenv";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
loadRootEnv({ path: path.join(REPO_ROOT, ".env") });
loadRootEnv({ path: path.join(REPO_ROOT, ".env.local"), override: true });
import cors from "cors";
import { appRouter } from "./router.js";
import type { GrpcBackendMode } from "./grpcRequestContext.js";

function parseGrpcBackendMode(header: string | string[] | undefined): GrpcBackendMode {
  const v = Array.isArray(header) ? header[0] : header;
  if (typeof v !== "string") return "hardware";
  const t = v.trim().toLowerCase();
  if (t === "sim" || t === "simulator") return "sim";
  if (t === "twin" || t === "digital-twin") return "twin";
  return "hardware";
}

const port = Number(process.env.CONTROL_API_PORT ?? 4000);

const handler = createHTTPHandler({
  router: appRouter,
  createContext({ req }) {
    return {
      grpcBackendMode: parseGrpcBackendMode(req.headers["x-pendulum-backend"]),
    };
  },
  basePath: "/trpc/",
});

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  cors({
    origin: origin ?? true,
    credentials: true,
  })(req, res, () => {
    void handler(req, res);
  });
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[control-api] Port ${port} is already in use (another control-api or leftover "npm run dev"). Stop that process or set CONTROL_API_PORT.`,
    );
  } else {
    console.error("[control-api]", err);
  }
  process.exit(1);
});

server.listen(port, () => {
  console.log(`control-api tRPC listening on http://localhost:${port}`);
});
