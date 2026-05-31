import type { ControlMode } from "../helpers/backendContext.js";

type TwinLeg = Exclude<ControlMode, "twin">;

export async function runOnTwinLegs<T>(
  mode: ControlMode,
  run: (leg: TwinLeg) => Promise<T>,
): Promise<T | { real: T; sim: T }> {
  if (mode === "twin") {
    const [real, sim] = await Promise.all([run("physical"), run("simulation")]);
    return { real, sim };
  }
  return run(mode);
}
