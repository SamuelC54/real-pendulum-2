import * as motor from "@real-pendulum/motor-service/sdk";
import { registerMotionLatchHandler } from "./motionLatch.js";
import { withHardwareGrpc, withSimGrpc } from "./twinGrpc.js";

async function stopMotorSafe(run: () => Promise<{ ok: boolean; error: string }>): Promise<void> {
  try {
    await run();
  } catch {
    /* disconnected backend */
  }
}

/** Stop hardware + sim motors when a limit latches. */
export async function stopAllMotionOnLatch(): Promise<void> {
  await Promise.allSettled([
    withHardwareGrpc(() => stopMotorSafe(() => motor.stopMotor())),
    withSimGrpc(() => stopMotorSafe(() => motor.stopMotor())),
  ]);
}

registerMotionLatchHandler(stopAllMotionOnLatch);
