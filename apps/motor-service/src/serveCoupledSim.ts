/**
 * Run **motor.v1** + **sensor.v1** on one port with a shared MuJoCo plant (`physics-sim` must be running).
 *
 * Usage (from repo root):
 *   `npx tsx apps/motor-service/src/serveCoupledSim.ts`
 *
 * Point **both** URLs at the printed address, e.g.:
 *   `MOTOR_GRPC_URL=http://127.0.0.1:58870` and `SENSOR_GRPC_URL=http://127.0.0.1:58870`
 *
 * Sim parameters: edit **`config/coupled-sim.parameters.json`** (loaded at startup).
 */
import { config } from "@real-pendulum/app-config";
import { resolveCoupledSimParametersPath } from "@real-pendulum/app-config/coupled-sim-parameters";
import { cliPort } from "@real-pendulum/app-config/cli";
import {
  createCoupledSimGrpcModel,
  startCoupledSimGrpcServer,
} from "./test-support/coupledSimGrpcServer.js";

/** Default avoids low **50xxx** ports often blocked on Windows (Hyper-V / excluded ranges → **EACCES**). */
const port = cliPort("--port", config.sim.coupledGrpcPort);
const model = await createCoupledSimGrpcModel();

const { url, close } = await startCoupledSimGrpcServer(model, { port });
console.log(`[serveCoupledSim] MotorService + SensorService (shared plant) at ${url}`);
console.log(`[serveCoupledSim] Set MOTOR_GRPC_URL and SENSOR_GRPC_URL to this URL (same host for both).`);
console.log(`[serveCoupledSim] Parameters file: ${resolveCoupledSimParametersPath()}`);

function shutdown(): void {
  void close().finally(() => process.exit(0));
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, shutdown);
}
