import { z } from "zod";
import { getSimPlantParameters, type SimPlantParameters } from "./simPlant.js";

export const simulationParametersSchema = z.object({
  mpsPerRpm: z.number().finite(),
  pendulumLengthM: z.number().finite().positive(),
  cartVelocityTrackingPerSec: z.number().finite().positive(),
  angularDampingPerSec: z.number().finite().nonnegative(),
});

export const simulationParametersPatchSchema = simulationParametersSchema.partial();

export type SimulationParameters = SimPlantParameters;
export type SimulationParametersPatch = z.infer<typeof simulationParametersPatchSchema>;

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const pathLabel = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${pathLabel}: ${issue.message}`;
    })
    .join("; ");
}

/** Validate simulation plant parameters (e.g. admin PATCH payloads). */
export function assertSimulationParameters(raw: unknown): SimulationParameters {
  const result = simulationParametersSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid simulation parameters: ${formatZodError(result.error)}`);
  }
  return result.data;
}

/** Live plant parameters from `packages/app-config/src/config.ts` (`config.sim.plant`). */
export function getSimulationParameters(): SimulationParameters {
  return getSimPlantParameters();
}

/** @deprecated Use `getSimulationParameters`. */
export const readSimulationParametersFile = getSimulationParameters;

/** @deprecated Use `getSimulationParameters`. */
export const loadSimulationParametersForStartup = getSimulationParameters;

export function mergeSimulationParametersPatch(
  current: SimulationParameters,
  patch: SimulationParametersPatch,
): SimulationParameters {
  const validatedPatch = simulationParametersPatchSchema.parse(patch);
  return assertSimulationParameters({ ...current, ...validatedPatch });
}
