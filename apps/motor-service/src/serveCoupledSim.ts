/**
 * Run **motor.v1** + **sensor.v1** on one port with a shared **`CartPendulumPlant`**.
 *
 * Usage (from repo root):
 *   `npx tsx apps/motor-service/src/serveCoupledSim.ts`
 *
 * Point **both** URLs at the printed address, e.g.:
 *   `MOTOR_GRPC_URL=http://127.0.0.1:58870` and `SENSOR_GRPC_URL=http://127.0.0.1:58870`
 *
 * Optional env: **`SIM_COUPLED_GRPC_PORT`**, **`SIM_METERS_PER_DISPLAY_COUNT`**, **`SIM_MPS_PER_RPM`**,
 * **`SIM_LIMIT_LEFT_X_M`**, **`SIM_LIMIT_RIGHT_X_M`**.
 */
import {
  createCoupledSimGrpcModel,
  startCoupledSimGrpcServer,
} from "./test-support/coupledSimGrpcServer.js";

/** Default avoids low **50xxx** ports often blocked on Windows (Hyper-V / excluded ranges → **EACCES**). */
const port = Number(process.env.SIM_COUPLED_GRPC_PORT ?? "58870");
const model = createCoupledSimGrpcModel();

const { url, close } = await startCoupledSimGrpcServer(model, { port });
console.log(`[serveCoupledSim] MotorService + SensorService (shared plant) at ${url}`);
console.log(`[serveCoupledSim] Set MOTOR_GRPC_URL and SENSOR_GRPC_URL to this URL (same host for both).`);

function shutdown(): void {
  void close().finally(() => process.exit(0));
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, shutdown);
}
