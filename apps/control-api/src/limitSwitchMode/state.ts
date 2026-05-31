import type { TravelLimitSwitchState } from "../railLimitGuards.js";
import { displayCountsToCm } from "../railPositionCm.js";
import type { TravelLimitLeg } from "../railTravelLimits.js";
import { getTravelLimitDisplays } from "../railTravelLimits.js";

export type LimitSide = "left" | "right";
export type LimitReason = "switch" | "position";

export type LimitSwitchModeStatus = {
  latched: boolean;
  side: LimitSide | null;
  reason: LimitReason | null;
  homingActive: boolean;
  /** UI jog label allowed toward center while latched (left limit → jog right, etc.). */
  towardCenterJog: "left" | "right" | null;
};

const POSITION_TOLERANCE_CM = 0.05;

let latched = false;
let latchSide: LimitSide | null = null;
let latchReason: LimitReason | null = null;
let homingDepth = 0;
let recoveryDepth = 0;
let prevLeft = false;
let prevRight = false;
let stopInProgress = false;

type EngageHandler = () => Promise<void>;
let onEngage: EngageHandler | null = null;

export function registerOnEngage(handler: EngageHandler): void {
  onEngage = handler;
}

function towardCenterJog(): "left" | "right" | null {
  if (!latched || !latchSide) return null;
  return latchSide === "left" ? "right" : "left";
}

export function getLimitSwitchModeStatus(): LimitSwitchModeStatus {
  return {
    latched,
    side: latchSide,
    reason: latchReason,
    homingActive: homingDepth > 0,
    towardCenterJog: towardCenterJog(),
  };
}

export function isLatched(): boolean {
  return latched;
}

/** True when automated motion must stop (controllers, normal jog/move). Recovery bypass clears this. */
export function isMotionBlocked(): boolean {
  return latched && homingDepth === 0 && recoveryDepth === 0;
}

function monitoringSuppressed(): boolean {
  return homingDepth > 0 || recoveryDepth > 0;
}

export function limitSwitchModeErrorMessage(): string {
  const toward = towardCenterJog();
  const recover =
    toward === "left"
      ? "Use recovery Jog left on the limit banner"
      : toward === "right"
        ? "Use recovery Jog right on the limit banner"
        : "Use recovery controls on the limit banner";
  const label = latchSide === "left" ? "Left" : latchSide === "right" ? "Right" : "Travel";
  if (latchReason === "position") {
    return `${label} travel limit exceeded — motion locked. ${recover}, Move to home, or Release stop.`;
  }
  return `${label} limit switch active — motion locked. ${recover}, Move to home, or Release stop.`;
}

export function clearLimitSwitchMode(): void {
  latched = false;
  latchSide = null;
  latchReason = null;
}

export function tryClearIfSafe(
  positionCm: number | undefined,
  limits: TravelLimitSwitchState,
  leg: TravelLimitLeg = "physical",
): void {
  if (!latched || !limits.connected) return;
  if (limits.limitLeftPressed || limits.limitRightPressed) return;
  if (positionCm === undefined || !Number.isFinite(positionCm)) return;

  const bounds = travelLimitBoundsCm(leg);
  if (bounds) {
    const tol = POSITION_TOLERANCE_CM;
    if (positionCm < bounds.min - tol || positionCm > bounds.max + tol) return;
  }

  clearLimitSwitchMode();
}

export async function runWithHomingBypass<T>(fn: () => Promise<T>): Promise<T> {
  homingDepth += 1;
  try {
    return await fn();
  } finally {
    homingDepth -= 1;
  }
}

export async function runWithRecoveryBypass<T>(fn: () => Promise<T>): Promise<T> {
  recoveryDepth += 1;
  try {
    return await fn();
  } finally {
    recoveryDepth -= 1;
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

function travelLimitBoundsCm(leg: TravelLimitLeg): { min: number; max: number } | null {
  const limits = getTravelLimitDisplays(leg);
  if (limits.left == null || limits.right == null) return null;
  if (!Number.isFinite(limits.left) || !Number.isFinite(limits.right)) return null;
  const leftCm = displayCountsToCm(limits.left);
  const rightCm = displayCountsToCm(limits.right);
  return { min: Math.min(leftCm, rightCm), max: Math.max(leftCm, rightCm) };
}

export function updateMotorPosition(
  positionCm: number | undefined,
  leg: TravelLimitLeg = "physical",
): void {
  if (monitoringSuppressed() || latched) return;
  if (positionCm === undefined || !Number.isFinite(positionCm)) return;

  const bounds = travelLimitBoundsCm(leg);
  if (!bounds) return;

  const tol = POSITION_TOLERANCE_CM;
  if (positionCm < bounds.min - tol) {
    engage("left", "position");
  } else if (positionCm > bounds.max + tol) {
    engage("right", "position");
  }
}

function engage(side: LimitSide, reason: LimitReason = "switch"): void {
  if (monitoringSuppressed() || latched) return;
  latched = true;
  latchSide = side;
  latchReason = reason;
  const handler = onEngage;
  if (handler && !stopInProgress) {
    stopInProgress = true;
    void handler().finally(() => {
      stopInProgress = false;
    });
  }
}

export function updateLimitSwitchState(limits: TravelLimitSwitchState): void {
  if (!limits.connected) {
    prevLeft = false;
    prevRight = false;
    return;
  }

  if (monitoringSuppressed()) {
    prevLeft = limits.limitLeftPressed;
    prevRight = limits.limitRightPressed;
    return;
  }

  const leftTrip = limits.limitLeftPressed && (!prevLeft || !latched);
  const rightTrip = limits.limitRightPressed && (!prevRight || !latched);

  if (leftTrip) engage("left", "switch");
  else if (rightTrip) engage("right", "switch");

  prevLeft = limits.limitLeftPressed;
  prevRight = limits.limitRightPressed;
}
