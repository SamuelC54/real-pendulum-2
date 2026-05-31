import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { resolveRepoRoot } from "./node.js";

export const simulationParametersSchema = z.object({
  mpsPerRpm: z.number().finite(),
  pendulumLengthM: z.number().finite().positive(),
  cartVelocityTrackingPerSec: z.number().finite().positive(),
  angularDampingPerSec: z.number().finite().nonnegative(),
});

export const simulationParametersPatchSchema = simulationParametersSchema.partial();

export type SimulationParameters = z.infer<typeof simulationParametersSchema>;
export type SimulationParametersPatch = z.infer<typeof simulationParametersPatchSchema>;

const RELATIVE_PATH = path.join("config", "simulation.parameters.json");

const REPO_ROOT = resolveRepoRoot(import.meta.url);

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const pathLabel = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${pathLabel}: ${issue.message}`;
    })
    .join("; ");
}

/** Validate a simulation parameters document exactly as stored in JSON (no defaults). */
export function assertSimulationParameters(raw: unknown): SimulationParameters {
  const result = simulationParametersSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid simulation parameters: ${formatZodError(result.error)}`);
  }
  return result.data;
}

/** Absolute path to `config/simulation.parameters.json` under the repo root. */
export function resolveSimulationParametersPath(repoRoot: string = REPO_ROOT): string {
  return path.join(repoRoot, RELATIVE_PATH);
}

export function readSimulationParametersFile(repoRoot?: string): SimulationParameters {
  const filePath = resolveSimulationParametersPath(repoRoot ?? REPO_ROOT);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Simulation parameters file not found: ${filePath}`);
  }
  const text = fs.readFileSync(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (e) {
    throw new Error(
      `Invalid JSON in ${filePath}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return assertSimulationParameters(parsed);
}

export function writeSimulationParametersFile(
  config: SimulationParameters,
  repoRoot?: string,
): string {
  const filePath = resolveSimulationParametersPath(repoRoot ?? REPO_ROOT);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const normalized = assertSimulationParameters(config);
  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return filePath;
}

export function mergeSimulationParametersPatch(
  current: SimulationParameters,
  patch: SimulationParametersPatch,
): SimulationParameters {
  const validatedPatch = simulationParametersPatchSchema.parse(patch);
  return assertSimulationParameters({ ...current, ...validatedPatch });
}

/** Used when starting `serve:simulation` — loads `config/simulation.parameters.json` only. */
export function loadSimulationParametersForStartup(repoRoot?: string): SimulationParameters {
  return readSimulationParametersFile(repoRoot);
}
