import {
  physicsSimRlInferenceStop,
  physicsSimRlStatus,
} from "@real-pendulum/physics-sim/client";
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

/** Stop hardware + sim motors and any active RL inference when a limit latches. */
export async function stopAllMotionOnLatch(): Promise<void> {
  await Promise.allSettled([
    withHardwareGrpc(() => stopMotorSafe(() => motor.stopMotor())),
    withSimGrpc(() => stopMotorSafe(() => motor.stopMotor())),
  ]);

  try {
    const { isHardwareInferenceLoopRunning, stopHardwareInference } = await import(
      "./rlHardwareInference.js"
    );
    if (isHardwareInferenceLoopRunning()) {
      await stopHardwareInference();
    }
  } catch {
    /* RL extras optional */
  }

  try {
    const st = await physicsSimRlStatus();
    if (st.inference.active) {
      await physicsSimRlInferenceStop();
    }
  } catch {
    /* physics-sim offline */
  }
}

registerMotionLatchHandler(stopAllMotionOnLatch);
