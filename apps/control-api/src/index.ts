import http from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import cors from "cors";
import { appRouter } from "./router.js";

const port = Number(process.env.CONTROL_API_PORT ?? 4000);

const handler = createHTTPHandler({
  router: appRouter,
  createContext: () => ({}),
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
