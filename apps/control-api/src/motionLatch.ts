import type { TravelLimitSwitchState } from "./railLimitGuards.js";
import { displayCountsToCm } from "./railPositionCm.js";
import { getTravelLimitDisplays } from "./railTravelLimits.js";

export type MotionLatchSide = "left" | "right";
export type MotionLatchReason = "switch" | "position";

export type MotionLatchStatus = {
  latched: boolean;
  side: MotionLatchSide | null;
  reason: MotionLatchReason | null;
  homingActive: boolean;
  /** UI jog label allowed toward center while latched (left limit → jog right, etc.). */
  towardCenterJog: "left" | "right" | null;
};

/** Tolerance for float noise when comparing cm to homed travel limits. */
const POSITION_OUT_OF_RANGE_TOLERANCE_CM = 0.05;

let latched = false;
let latchSide: MotionLatchSide | null = null;
let latchReason: MotionLatchReason | null = null;
let homingDepth = 0;
let recoveryMoveDepth = 0;
let prevLeft = false;
let prevRight = false;
let stopInProgress = false;

type LatchHandler = () => Promise<void>;
let onLatchHandler: LatchHandler | null = null;

export function registerMotionLatchHandler(handler: LatchHandler): void {
  onLatchHandler = handler;
}

function towardCenterJogDirection(): "left" | "right" | null {
  if (!latched || !latchSide) return null;
  return latchSide === "left" ? "right" : "left";
}

export function getMotionLatchStatus(): MotionLatchStatus {
  return {
    latched,
    side: latchSide,
    reason: latchReason,
    homingActive: homingDepth > 0,
    towardCenterJog: towardCenterJogDirection(),
  };
}

export function isMotionLatched(): boolean {
  return latched;
}

/** True when all automated motion must stop (e.g. RL inference). Manual jog toward center stays allowed. */
export function isMotionBlockedByLatch(): boolean {
  return latched && homingDepth === 0 && recoveryMoveDepth === 0;
}

function latchBlocksMotion(): boolean {
  return latched && homingDepth === 0 && recoveryMoveDepth === 0;
}

/**
 * Jog convention: left = +RPM, right = -RPM. While latched, block further into the limit side only.
 */
export function clampJogRpmForMotionLatch(rpm: number): number {
  if (!latchBlocksMotion() || rpm === 0) return rpm;
  if (latchSide === "left" && rpm > 0) return 0;
  if (latchSide === "right" && rpm < 0) return 0;
  return rpm;
}

export function isJogBlockedByMotionLatch(rpm: number): boolean {
  return rpm !== 0 && clampJogRpmForMotionLatch(rpm) === 0;
}

export function motionLatchDirectionErrorMessage(): string {
  const hint =
    latchSide === "left"
      ? "Jog right or move toward center (0 cm)"
      : latchSide === "right"
        ? "Jog left or move toward center (0 cm)"
        : "Move toward center (0 cm)";
  return `Motion locked into limit — ${hint} to recover, or release stop when clear.`;
}

/** Blocks absolute moves further into the latched side; allows toward center. */
export function guardMoveWhenLatched(
  targetCm: number,
  currentCm: number | undefined,
): string | null {
  if (!latchBlocksMotion()) return null;
  if (currentCm === undefined || !Number.isFinite(currentCm) || !Number.isFinite(targetCm)) {
    return null;
  }
  if (latchSide === "left" && targetCm < currentCm) {
    return motionLatchDirectionErrorMessage();
  }
  if (latchSide === "right" && targetCm > currentCm) {
    return motionLatchDirectionErrorMessage();
  }
  return null;
}

function latchMonitoringSuppressed(): boolean {
  return homingDepth > 0 || recoveryMoveDepth > 0;
}

export function motionLatchErrorMessage(): string {
  const toward = towardCenterJogDirection();
  const recover =
    toward === "left"
      ? "Use recovery Jog left on the limit banner"
      : toward === "right"
        ? "Use recovery Jog right on the limit banner"
        : "Use recovery controls on the limit banner";
  const label =
    latchSide === "left" ? "Left" : latchSide === "right" ? "Right" : "Travel";
  if (latchReason === "position") {
    return `${label} travel limit exceeded — motion locked. ${recover}, Move to home, or Release stop.`;
  }
  return `${label} limit switch active — motion locked. ${recover}, Move to home, or Release stop.`;
}

export function clearMotionLatch(): void {
  latched = false;
  latchSide = null;
  latchReason = null;
}

/**
 * Clears latch after a successful recovery move when switches are open and position is in range.
 */
export function tryClearMotionLatchIfSafe(
  positionCm: number | undefined,
  limits: TravelLimitSwitchState,
): void {
  if (!latched) return;
  if (!limits.connected) return;
  if (limits.limitLeftPressed || limits.limitRightPressed) return;
  if (positionCm === undefined || !Number.isFinite(positionCm)) return;

  const bounds = travelLimitBoundsCm();
  if (bounds) {
    const tol = POSITION_OUT_OF_RANGE_TOLERANCE_CM;
    if (positionCm < bounds.min - tol || positionCm > bounds.max + tol) return;
  }

  clearMotionLatch();
}

export async function runWithHomingBypass<T>(fn: () => Promise<T>): Promise<T> {
  homingDepth += 1;
  try {
    return await fn();
  } finally {
    homingDepth -= 1;
  }
}

/** Allow profile move to home while latched (no new latch trips during the move). */
export async function runWithRecoveryMoveBypass<T>(fn: () => Promise<T>): Promise<T> {
  recoveryMoveDepth += 1;
  try {
    return await fn();
  } finally {
    recoveryMoveDepth -= 1;
  }
}

export function combineLimitSwitchStates(
  ...states: TravelLimitSwitchState[]
): TravelLimitSwitchState {
  let connected = false;
  let limitLeftPressed = false;
  let limitRightPressed = false;
  for (const s of states) {
    if (s.connected) connected = true;
    if (s.limitLeftPressed) limitLeftPressed = true;
    if (s.limitRightPressed) limitRightPressed = true;
  }
  return { connected, limitLeftPressed, limitRightPressed };
}

function travelLimitBoundsCm(): { min: number; max: number } | null {
  const limits = getTravelLimitDisplays();
  if (limits.left == null || limits.right == null) return null;
  if (!Number.isFinite(limits.left) || !Number.isFinite(limits.right)) return null;
  const leftCm = displayCountsToCm(limits.left);
  const rightCm = displayCountsToCm(limits.right);
  return { min: Math.min(leftCm, rightCm), max: Math.max(leftCm, rightCm) };
}

/**
 * Latch when motor position is outside homed/recorded travel limits (even if switches are open).
 * Requires both left and right travel stops to be stored for the active backend.
 */
export function updateMotorPositionForLatch(positionCm: number | undefined): void {
  if (latchMonitoringSuppressed() || latched) return;
  if (positionCm === undefined || !Number.isFinite(positionCm)) return;

  const bounds = travelLimitBoundsCm();
  if (!bounds) return;

  const tol = POSITION_OUT_OF_RANGE_TOLERANCE_CM;
  if (positionCm < bounds.min - tol) {
    engageLatch("left", "position");
  } else if (positionCm > bounds.max + tol) {
    engageLatch("right", "position");
  }
}

function engageLatch(side: MotionLatchSide, reason: MotionLatchReason = "switch"): void {
  if (latchMonitoringSuppressed() || latched) return;
  latched = true;
  latchSide = side;
  latchReason = reason;
  const handler = onLatchHandler;
  if (handler && !stopInProgress) {
    stopInProgress = true;
    void handler().finally(() => {
      stopInProgress = false;
    });
  }
}

/**
 * Call on every sensor poll (hardware Arduino + sim virtual limits).
 * Latches full motion stop on rising edge or while pressed (except during homing).
 */
export function updateLimitSwitchState(limits: TravelLimitSwitchState): void {
  if (!limits.connected) {
    prevLeft = false;
    prevRight = false;
    return;
  }

  if (latchMonitoringSuppressed()) {
    prevLeft = limits.limitLeftPressed;
    prevRight = limits.limitRightPressed;
    return;
  }

  if (limits.limitLeftPressed && !prevLeft) {
    engageLatch("left", "switch");
  } else if (limits.limitRightPressed && !prevRight) {
    engageLatch("right", "switch");
  } else if (!latched) {
    if (limits.limitLeftPressed) engageLatch("left", "switch");
    else if (limits.limitRightPressed) engageLatch("right", "switch");
  }

  prevLeft = limits.limitLeftPressed;
  prevRight = limits.limitRightPressed;
}
