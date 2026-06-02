import { describe, expect, it, beforeEach } from "vitest";
import { displayCountsPerCm } from "../railPositionCm.js";
import {
  physicalBackend,
  resetTravelLimitsStateForTests,
  simulationBackend,
} from "./backends/instances.js";
import { TravelLimitsStore } from "./travelLimitsStore.js";

describe("TravelLimitsStore", () => {
  let store: TravelLimitsStore;

  beforeEach(() => {
    store = new TravelLimitsStore();
  });

  it("clears when motor disconnect sync runs", () => {
    store.recordFromTeknicMeasured(100, "left");
    expect(store.getDisplayLimits().left).toBe(-100);
    store.syncFromMotorConnection(false);
    expect(store.getDisplayLimits()).toEqual({ left: null, right: null });
  });

  it("does not clear while connected", () => {
    store.recordFromTeknicMeasured(100, "left");
    store.syncFromMotorConnection(true);
    expect(store.getDisplayLimits().left).toBe(-100);
  });

  it("after homing with zero at mid, limits are symmetric in display counts", () => {
    const posAtLeft = 7542;
    const posAtRight = -7531;
    store.setFromHoming(posAtLeft, posAtRight, true);
    const { left, right } = store.getDisplayLimits();
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(left! + right!).toBe(0);
    expect(Math.abs(left!)).toBeCloseTo(Math.abs(right!), 9);
  });

  it("without zero at mid uses raw display at each trip", () => {
    store.setFromHoming(100, -50, false);
    expect(store.getDisplayLimits()).toEqual({ left: -100, right: 50 });
  });

  it("setSymmetricAboutCm stores left/right in display counts", () => {
    const r = store.setSymmetricAboutCm(5, 20);
    expect(r).toEqual({ centerCm: 5, halfSpanCm: 20, leftCm: -15, rightCm: 25 });
    const { left, right } = store.getDisplayLimits();
    const cpc = displayCountsPerCm();
    expect(left).toBeCloseTo(-15 * cpc, 3);
    expect(right).toBeCloseTo(25 * cpc, 3);
  });
});

describe("backend travel limits", () => {
  beforeEach(() => {
    resetTravelLimitsStateForTests();
  });

  it("isolates travel limits between hardware and sim backends", () => {
    physicalBackend.travelLimits.recordFromTeknicMeasured(10, "left");
    expect(physicalBackend.travelLimits.getDisplayLimits().left).toBe(-10);
    simulationBackend.travelLimits.recordFromTeknicMeasured(20, "left");
    expect(simulationBackend.travelLimits.getDisplayLimits().left).toBe(-20);
    expect(physicalBackend.travelLimits.getDisplayLimits().left).toBe(-10);
  });
});
