import {
  createCoupledSimGrpcModel,
  startCoupledSimGrpcServer,
} from "@real-pendulum/motor-service/test-support/coupled-sim-server";

const port = Number(process.env.SIM_COUPLED_GRPC_PORT ?? "58870");
const model = createCoupledSimGrpcModel();

const { url, close } = await startCoupledSimGrpcServer(model, { port });
console.log(`[serve-coupled-sim-grpc] MotorService + SensorService (shared plant) at ${url}`);
console.log(
  `[serve-coupled-sim-grpc] Set MOTOR_GRPC_URL and SENSOR_GRPC_URL to this URL (same value for both).`,
);

function shutdown(): void {
  void close().finally(() => process.exit(0));
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, shutdown);
}
