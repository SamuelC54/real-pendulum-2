import { config } from "@real-pendulum/app-config";
import { cliPort, cliString } from "@real-pendulum/app-config/cli";
import http from "node:http";
import cors from "cors";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router.js";
import type { GrpcBackendMode } from "./grpcRequestContext.js";

const motorGrpcUrl = cliString("--motor-grpc-url");
if (motorGrpcUrl) {
  config.motor.grpcUrl = motorGrpcUrl;
}

const port = cliPort("--port", config.controlApi.port);

function parseGrpcBackendMode(header: string | string[] | undefined): GrpcBackendMode {
  const v = Array.isArray(header) ? header[0] : header;
  if (typeof v !== "string") return "hardware";
  const t = v.trim().toLowerCase();
  if (t === "sim" || t === "simulator") return "sim";
  if (t === "twin" || t === "digital-twin") return "twin";
  return "hardware";
}

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
      `[control-api] Port ${port} is already in use. Stop the other process or change config.controlApi.port / pass --port.`,
    );
  } else {
    console.error("[control-api]", err);
  }
  process.exit(1);
});

server.listen(port, () => {
  console.log(`control-api tRPC listening on http://localhost:${port}`);
});
