import { config } from "@real-pendulum/app-config";
import { cliPort } from "@real-pendulum/app-config/cli";
import {
  createSimulationGrpcModel,
  startSimulationGrpcServer,
} from "@real-pendulum/motor-service/test-support/simulation-server";

const port = cliPort("--port", config.sim.simulationGrpcPort);
const model = await createSimulationGrpcModel();

const { url, close } = await startSimulationGrpcServer(model, { port });
console.log(`[serve-simulation-grpc] MotorService + SensorService (shared plant) at ${url}`);
console.log(
  `[serve-simulation-grpc] Set MOTOR_GRPC_URL and SENSOR_GRPC_URL to this URL (same value for both).`,
);

function shutdown(): void {
  void close().finally(() => process.exit(0));
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, shutdown);
}
