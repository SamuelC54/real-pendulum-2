import { config } from "@real-pendulum/app-config";
import { cliPort } from "@real-pendulum/app-config/cli";
import {
  createFakeMotorGrpcModel,
  startFakeMotorGrpcServer,
} from "@real-pendulum/motor-service/test-support/fake-motor-server";

const port = cliPort("--port", config.motor.grpcPort);
const model = createFakeMotorGrpcModel();

const { url, close } = await startFakeMotorGrpcServer(model, { port });
console.log(`[serve-fake-motor-grpc] MotorService (fake Connect) listening on ${url}`);

function shutdown(): void {
  void close().finally(() => process.exit(0));
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, shutdown);
}
