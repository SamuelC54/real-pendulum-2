import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { resolveRepoRoot } from "./node.js";

export const coupledSimPlantSchema = z.object({
  pendulumLengthM: z.number().finite().positive(),
  cartVelocityTrackingPerSec: z.number().finite().positive(),
  angularDampingPerSec: z.number().finite().nonnegative(),
  maxInternalStepSec: z.number().finite().positive().optional(),
});

export const coupledSimParametersSchema = z.object({
  mpsPerRpm: z.number().finite(),
  plant: coupledSimPlantSchema,
});

export const coupledSimParametersPatchSchema = coupledSimParametersSchema
  .partial()
  .extend({
    plant: coupledSimPlantSchema.partial().optional(),
  });

export type CoupledSimParameters = z.infer<typeof coupledSimParametersSchema>;
export type CoupledSimParametersPatch = z.infer<typeof coupledSimParametersPatchSchema>;

const RELATIVE_PATH = path.join("config", "coupled-sim.parameters.json");

const REPO_ROOT = resolveRepoRoot(import.meta.url);

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const pathLabel = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${pathLabel}: ${issue.message}`;
    })
    .join("; ");
}

/** Validate a coupled-sim parameters document exactly as stored in JSON (no defaults). */
export function assertCoupledSimParameters(raw: unknown): CoupledSimParameters {
  const result = coupledSimParametersSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid coupled sim parameters: ${formatZodError(result.error)}`);
  }
  return result.data;
}

/** Absolute path to `config/coupled-sim.parameters.json` under the repo root. */
export function resolveCoupledSimParametersPath(repoRoot: string = REPO_ROOT): string {
  return path.join(repoRoot, RELATIVE_PATH);
}

export function readCoupledSimParametersFile(repoRoot?: string): CoupledSimParameters {
  const filePath = resolveCoupledSimParametersPath(repoRoot ?? REPO_ROOT);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Coupled sim parameters file not found: ${filePath}`);
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
  return assertCoupledSimParameters(parsed);
}

export function writeCoupledSimParametersFile(
  config: CoupledSimParameters,
  repoRoot?: string,
): string {
  const filePath = resolveCoupledSimParametersPath(repoRoot ?? REPO_ROOT);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const normalized = assertCoupledSimParameters(config);
  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return filePath;
}

export function mergeCoupledSimParametersPatch(
  current: CoupledSimParameters,
  patch: CoupledSimParametersPatch,
): CoupledSimParameters {
  const validatedPatch = coupledSimParametersPatchSchema.parse(patch);
  return assertCoupledSimParameters({
    ...current,
    ...validatedPatch,
    plant: validatedPatch.plant ? { ...current.plant, ...validatedPatch.plant } : current.plant,
  });
}

/** Used when starting `serve:coupled-sim` — loads `config/coupled-sim.parameters.json` only. */
export function loadCoupledSimParametersForStartup(repoRoot?: string): CoupledSimParameters {
  return readCoupledSimParametersFile(repoRoot);
}
