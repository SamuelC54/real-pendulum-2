import { registerOnEngage } from "./state.js";
import { createControlClient } from "../control/createControlClient.js";
import { withControlBackend } from "../helpers/backendContext.js";

async function stopMotorSafe(run: () => Promise<{ ok: boolean; error: string }>): Promise<void> {
  try {
    await run();
  } catch {
    /* disconnected backend */
  }
}

async function stopAllMotionOnEngage(): Promise<void> {
  await Promise.allSettled([
    withControlBackend("physical", () => stopMotorSafe(() => createControlClient("physical").stop())),
    withControlBackend("simulation", () =>
      stopMotorSafe(() => createControlClient("simulation").stop()),
    ),
  ]);
}

registerOnEngage(stopAllMotionOnEngage);
