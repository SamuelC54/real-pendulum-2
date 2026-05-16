import { resolveSimMotorGrpcUrl } from "./grpcSimDefaults.js";

export type CoupledSimConfigSnapshot = {
  metersPerDisplayCount: number;
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

function adminConfigUrl(): string {
  const base = resolveSimMotorGrpcUrl().replace(/\/$/, "");
  return `${base}/admin/config`;
}

export async function fetchCoupledSimConfig(): Promise<{
  ok: boolean;
  config?: CoupledSimConfigSnapshot;
  error?: string;
}> {
  try {
    const res = await fetch(adminConfigUrl(), { method: "GET" });
    if (!res.ok) {
      return {
        ok: false,
        error: `Coupled sim admin GET ${res.status} — is serve:coupled-sim running at ${adminConfigUrl()}?`,
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

export async function patchCoupledSimConfig(
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
