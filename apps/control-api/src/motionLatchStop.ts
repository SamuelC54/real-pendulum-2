import { registerMotionLatchHandler } from "./motionLatch.js";
import { createTwinControlBackend } from "./control/createControlClient.js";

async function stopMotorSafe(run: () => Promise<{ ok: boolean; error: string }>): Promise<void> {
  try {
    await run();
  } catch {
    /* disconnected backend */
  }
}

export async function stopAllMotionOnLatch(): Promise<void> {
  const twin = createTwinControlBackend();
  await Promise.allSettled([
    stopMotorSafe(() => twin.physical.stop()),
    stopMotorSafe(() => twin.simulation.stop()),
  ]);
}

registerMotionLatchHandler(stopAllMotionOnLatch);
