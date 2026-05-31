/**
 * Run **motor.v1** + **sensor.v1** on one port with a shared MuJoCo plant (`simulation` must be running).
 *
 * Usage (from repo root):
 *   `npx tsx apps/physical-motor-service/src/serveSimulation.ts`
 *
 * Point **both** URLs at the printed address, e.g.:
 *   `MOTOR_GRPC_URL=http://127.0.0.1:58870` and `SENSOR_GRPC_URL=http://127.0.0.1:58870`
 *
 * Sim parameters: edit **`packages/app-config/src/config.ts`** (`config.sim.plant`).
 */
import { config } from "@real-pendulum/app-config";
import { cliPort } from "@real-pendulum/app-config/cli";
import {
  createSimulationGrpcModel,
  startSimulationGrpcServer,
} from "./test-support/simulationGrpcServer.js";

/** Default avoids low **50xxx** ports often blocked on Windows (Hyper-V / excluded ranges → **EACCES**). */
const port = cliPort("--port", config.sim.simulationGrpcPort);
const model = await createSimulationGrpcModel();

const { url, close } = await startSimulationGrpcServer(model, { port });
console.log(`[serveSimulation] MotorService + SensorService (shared plant) at ${url}`);
console.log(`[serveSimulation] Set MOTOR_GRPC_URL and SENSOR_GRPC_URL to this URL (same host for both).`);
console.log(`[serveSimulation] Plant parameters: packages/app-config/src/config.ts (config.sim.plant)`);

function shutdown(): void {
  void close().finally(() => process.exit(0));
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, shutdown);
}
