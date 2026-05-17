import path from "node:path";
import { config } from "@real-pendulum/app-config";
import { resolveRepoRoot } from "@real-pendulum/app-config/node";
import {
  mergeCoupledSimParametersPatch,
  readCoupledSimParametersFile,
  resolveCoupledSimParametersPath,
  writeCoupledSimParametersFile,
  type CoupledSimParameters,
  type CoupledSimParametersPatch,
} from "@real-pendulum/app-config/coupled-sim-parameters";
import {
  applyCoupledSimRuntimePatch,
  coupledSimParametersToRuntimePatch,
} from "./tuningSimAdmin.js";

export type CoupledSimConfigFileResult = {
  ok: boolean;
  config?: CoupledSimParameters;
  /** Absolute path to `config/coupled-sim.parameters.json`. */
  path?: string;
  /** True when the running coupled sim accepted the same values. */
  runtimeApplied?: boolean;
  /** Set when JSON was saved but live sim PATCH failed (sim may be stopped). */
  runtimeWarning?: string;
  error?: string;
};

function resolveCoupledSimRepoRoot(override?: string): string {
  if (override) return path.resolve(override);
  const configured = config.repoRoot?.trim();
  if (configured) return path.resolve(configured);
  return resolveRepoRoot(import.meta.url);
}

function fileResult(
  config: CoupledSimParameters,
  filePath: string,
  runtime: { ok: boolean; error?: string },
): CoupledSimConfigFileResult {
  return {
    ok: true,
    config,
    path: filePath,
    runtimeApplied: runtime.ok,
    runtimeWarning: runtime.ok ? undefined : runtime.error,
  };
}

export function getCoupledSimConfigFromFile(repoRoot?: string): CoupledSimConfigFileResult {
  try {
    const root = resolveCoupledSimRepoRoot(repoRoot);
    const filePath = resolveCoupledSimParametersPath(root);
    const parameters = readCoupledSimParametersFile(root);
    return { ok: true, config: parameters, path: filePath };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function patchCoupledSimConfigFile(
  patch: CoupledSimParametersPatch,
  repoRoot?: string,
): Promise<CoupledSimConfigFileResult> {
  try {
    const root = resolveCoupledSimRepoRoot(repoRoot);
    const filePath = resolveCoupledSimParametersPath(root);
    const current = readCoupledSimParametersFile(root);
    const next = mergeCoupledSimParametersPatch(current, patch);
    writeCoupledSimParametersFile(next, root);
    const runtime = await applyCoupledSimRuntimePatch(coupledSimParametersToRuntimePatch(patch));
    return fileResult(next, filePath, runtime);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function putCoupledSimConfigFile(
  parameters: CoupledSimParameters,
  repoRoot?: string,
): Promise<CoupledSimConfigFileResult> {
  try {
    const root = resolveCoupledSimRepoRoot(repoRoot);
    const filePath = writeCoupledSimParametersFile(parameters, root);
    const runtime = await applyCoupledSimRuntimePatch(coupledSimParametersToRuntimePatch(parameters));
    return fileResult(parameters, filePath, runtime);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
