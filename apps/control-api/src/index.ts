import { initNodeTracing } from "@real-pendulum/tracing";
import { wrapHttpHandler } from "@real-pendulum/tracing/http";

initNodeTracing("control-api");

import { config } from "@real-pendulum/app-config";
import { cliPort, cliString } from "@real-pendulum/app-config/cli";
import http from "node:http";
import cors from "cors";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import "./limitSwitchMode/index.js";
import { appRouter } from "./router.js";
import {
  parseControlBackendFromUrl,
  parseControlBackendHeader,
} from "./helpers/controlBackendHeader.js";

const motorGrpcUrl = cliString("--motor-grpc-url");
if (motorGrpcUrl) {
  config.motor.grpcUrl = motorGrpcUrl;
}

const sensorGrpcUrl = cliString("--sensor-grpc-url");
if (sensorGrpcUrl) {
  config.sensor.grpcUrl = sensorGrpcUrl;
}

const port = cliPort("--port", config.controlApi.port);

const handler = createHTTPHandler({
  router: appRouter,
  createContext({ req }) {
    const fromParams = parseControlBackendFromUrl(req.url?.split("?")[1]);
    const header = req.headers["x-control-backend"] ?? req.headers["x-pendulum-backend"];
    return {
      controlBackend: fromParams ?? parseControlBackendHeader(header) ?? undefined,
    };
  },
  basePath: "/trpc/",
});

const server = http.createServer(
  wrapHttpHandler((req, res) => {
    const origin = req.headers.origin;
    cors({
      origin: origin ?? true,
      credentials: true,
      exposedHeaders: ["x-trace-id"],
    })(req, res, () => {
      void handler(req, res);
    });
  }, "control-api"),
);

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
