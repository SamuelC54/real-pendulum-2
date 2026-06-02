import { getControlBackend } from "../control/getControlBackend.js";
import { withControlBackend } from "../helpers/backendContext.js";

async function stopMotorSafe(run: () => Promise<{ ok: boolean; error: string }>): Promise<void> {
  try {
    await run();
  } catch {
    /* disconnected backend */
  }
}

export async function stopAllMotionOnEngage(): Promise<void> {
  await Promise.allSettled([
    withControlBackend("physical", () => stopMotorSafe(() => getControlBackend("physical").stop())),
    withControlBackend("simulation", () =>
      stopMotorSafe(() => getControlBackend("simulation").stop()),
    ),
  ]);
}
