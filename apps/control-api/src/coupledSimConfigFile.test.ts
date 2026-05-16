import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoupledSimParameters } from "@real-pendulum/app-config/coupled-sim-parameters";
import {
  resolveCoupledSimParametersPath,
  writeCoupledSimParametersFile,
} from "@real-pendulum/app-config/coupled-sim-parameters";

vi.mock("./tuningSimAdmin.js", () => ({
  applyCoupledSimRuntimePatch: vi.fn(async () => ({ ok: true })),
}));

import { applyCoupledSimRuntimePatch } from "./tuningSimAdmin.js";
import {
  getCoupledSimConfigFromFile,
  patchCoupledSimConfigFile,
  putCoupledSimConfigFile,
} from "./coupledSimConfigFile.js";

const sampleConfig: CoupledSimParameters = {
  mpsPerRpm: 5e-5,
  limitLeftXM: -0.4,
  limitRightXM: 0.4,
  plant: {
    pendulumLengthM: 0.35,
    cartVelocityTrackingPerSec: 12,
    angularDampingPerSec: 0.04,
    maxInternalStepSec: 1 / 240,
  },
};

describe("coupledSimConfigFile", () => {
  let tmpDir: string;
  let parametersPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rp-coupled-sim-"));
    parametersPath = resolveCoupledSimParametersPath(tmpDir);
    vi.mocked(applyCoupledSimRuntimePatch).mockClear();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("get reads JSON from disk", () => {
    const seed = { ...sampleConfig, mpsPerRpm: 0.123 };
    writeCoupledSimParametersFile(seed, tmpDir);
    const r = getCoupledSimConfigFromFile(tmpDir);
    expect(r.ok).toBe(true);
    expect(r.config?.mpsPerRpm).toBe(0.123);
    expect(r.path).toBe(parametersPath);
  });

  it("get fails when the file is missing", () => {
    const r = getCoupledSimConfigFromFile(tmpDir);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/i);
  });

  it("patch merges into JSON and calls runtime apply", async () => {
    writeCoupledSimParametersFile(sampleConfig, tmpDir);
    const r = await patchCoupledSimConfigFile({ plant: { pendulumLengthM: 0.5 } }, tmpDir);
    expect(r.ok).toBe(true);
    expect(r.config?.plant.pendulumLengthM).toBe(0.5);
    expect(r.runtimeApplied).toBe(true);
    expect(applyCoupledSimRuntimePatch).toHaveBeenCalledWith({ plant: { pendulumLengthM: 0.5 } });
    const onDisk = JSON.parse(fs.readFileSync(parametersPath, "utf8")) as {
      plant: { pendulumLengthM: number };
    };
    expect(onDisk.plant.pendulumLengthM).toBe(0.5);
  });

  it("rejects invalid JSON values", () => {
    fs.mkdirSync(path.dirname(parametersPath), { recursive: true });
    fs.writeFileSync(parametersPath, JSON.stringify({ mpsPerRpm: "not-a-number", plant: {} }));
    const r = getCoupledSimConfigFromFile(tmpDir);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/mpsPerRpm/i);
  });

  it("put replaces the full JSON document", async () => {
    writeCoupledSimParametersFile(sampleConfig, tmpDir);
    const next = { ...sampleConfig, limitRightXM: 0.55 };
    const r = await putCoupledSimConfigFile(next, tmpDir);
    expect(r.ok).toBe(true);
    expect(r.config?.limitRightXM).toBe(0.55);
    const onDisk = JSON.parse(fs.readFileSync(parametersPath, "utf8")) as {
      limitRightXM: number;
    };
    expect(onDisk.limitRightXM).toBe(0.55);
  });
});
