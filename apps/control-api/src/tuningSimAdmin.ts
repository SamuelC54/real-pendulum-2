import type { CoupledSimParametersPatch } from "@real-pendulum/app-config/coupled-sim-parameters";
import { resolveSimMotorGrpcUrl } from "./grpcSimDefaults.js";

export type CoupledSimConfigSnapshot = {
  /** Read-only: derived from `config.rail.displayCountsPerCm` (same as hardware). */
  metersPerDisplayCount?: number;
  mpsPerRpm: number;
  limitLeftXM: number;
  limitRightXM: number;
  plant: {
    gravity: number;
    pendulumLengthM: number;
    cartVelocityTrackingPerSec: number;
    angularDampingPerSec: number;
    encoderTicksPerRadian: number;
  };
};

/** Map flat `coupled-sim.parameters.json` fields to coupled-sim admin PATCH shape. */
export function coupledSimParametersToRuntimePatch(
  patch: CoupledSimParametersPatch,
): Partial<CoupledSimConfigSnapshot> & { plant?: Partial<CoupledSimConfigSnapshot["plant"]> } {
  const out: Partial<CoupledSimConfigSnapshot> & {
    plant?: Partial<CoupledSimConfigSnapshot["plant"]>;
  } = {};
  if (patch.mpsPerRpm != null) out.mpsPerRpm = patch.mpsPerRpm;
  const plant: Partial<CoupledSimConfigSnapshot["plant"]> = {};
  if (patch.pendulumLengthM != null) plant.pendulumLengthM = patch.pendulumLengthM;
  if (patch.cartVelocityTrackingPerSec != null) {
    plant.cartVelocityTrackingPerSec = patch.cartVelocityTrackingPerSec;
  }
  if (patch.angularDampingPerSec != null) plant.angularDampingPerSec = patch.angularDampingPerSec;
  if (Object.keys(plant).length > 0) out.plant = plant;
  return out;
}

function adminConfigUrl(): string {
  const base = resolveSimMotorGrpcUrl().replace(/\/$/, "");
  return `${base}/admin/config`;
}

/** Push parameters to the running coupled sim process (in-memory). */
export async function applyCoupledSimRuntimePatch(
  patch: Partial<CoupledSimConfigSnapshot> & { plant?: Partial<CoupledSimConfigSnapshot["plant"]> },
): Promise<{ ok: boolean; config?: CoupledSimConfigSnapshot; error?: string }> {
  try {
    const res = await fetch(adminConfigUrl(), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Coupled sim admin PATCH ${res.status}${text ? `: ${text}` : ""}`,
      };
    }
    const config = (await res.json()) as CoupledSimConfigSnapshot;
    return { ok: true, config };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
