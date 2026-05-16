import { config } from "@real-pendulum/app-config";
import * as motor from "@real-pendulum/motor-service/sdk";
import * as sensor from "@real-pendulum/sensor-service/sdk";
import { setTravelLimitsFromHoming } from "./railTravelLimits.js";

/** Matches web jog convention: “left” on the rail = positive commanded rpm. */
function rpmTowardLeft(homingRpm: number): number {
  return homingRpm;
}

function rpmTowardRight(homingRpm: number): number {
  return -homingRpm;
}

export type RailHomingResult = {
  ok: boolean;
  error?: string;
  /** Teknic `Motion.PosnMeasured` when the left travel limit tripped. */
  motorPositionAtLeftLimit?: number;
  /** Teknic `Motion.PosnMeasured` when the right travel limit tripped. */
  motorPositionAtRightLimit?: number;
  /** Absolute span in motor counts between the two limits. */
  motorSpanCounts?: number;
  /** Target center position in motor counts (average of limits) before optional zero. */
  midMotorPosition?: number;
  /** Whether **`ZeroMeasuredPosition`** succeeded after reaching mid (defines 0 at rail center). */
  motorPositionZeroedAtMid?: boolean;
  /**
   * Integrated |commandedRpm|·dt/60 from the motor SDK while moving — approximate motor revolutions.
   */
  motorAbsRevolutions?: number;
  log: string[];
};

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function requireMotorMeasuredPosition(): Promise<number> {
  const st = await motor.getMotorStatus();
  const p = st.measuredPosition;
  if (!Number.isFinite(p)) {
    throw new Error(
      "Motor measured position unavailable — rebuild teknic_motor.dll with PosnMeasured and restart motor-service.",
    );
  }
  return p as number;
}

export async function runRailHoming(): Promise<RailHomingResult> {
  const log: string[] = [];
  const h = config.homing;
  const homingRpm = Math.min(120, Math.max(5, h.jogRpm));
  const pollMs = Math.min(200, Math.max(15, h.pollMs));
  const phaseTimeoutMs = Math.min(600_000, Math.max(5000, h.phaseTimeoutMs));
  const midTol = Math.max(0, h.midPositionTolerance);
  const approachThreshold = Math.max(midTol + 1, h.approachPosition);
  const approachRpm = Math.min(homingRpm, Math.max(8, h.approachRpm));
  const zeroMotorAtMid = h.zeroMotorPositionAtMid;
  /** Ignore limit switches until measured position has moved this far from the phase start (noise / stale reads). */
  const minTravelForLimit = Math.max(0, h.minTravelForLimitCounts);

  let motorAbsRevolutions = 0;
  let lastClock = Date.now();

  async function integrateMotorMotion(): Promise<void> {
    const now = Date.now();
    const dtSec = (now - lastClock) / 1000;
    lastClock = now;
    try {
      const st = await motor.getMotorStatus();
      const rpm = st.commandedRpm;
      motorAbsRevolutions += (Math.abs(rpm) * dtSec) / 60;
    } catch {
      /* ignore integration gaps */
    }
  }

  async function stopSafe(): Promise<void> {
    await motor.stopMotor().catch(() => {});
  }

  async function jogAssert(rpm: number): Promise<void> {
    const r = await motor.setJogVelocityRpm(rpm);
    if (!r.ok) {
      throw new Error(`Motor jog failed (${rpm} rpm): ${r.error}`);
    }
  }

  try {
    const motorSt = await motor.getMotorStatus();
    if (!motorSt.connected) {
      return { ok: false, error: "Motor is not connected.", log };
    }
    await requireMotorMeasuredPosition();
    const sens = await sensor.getSensorStatus();
    if (!sens.connected) {
      return { ok: false, error: "Sensor Board is not connected.", log };
    }

    log.push(
      `Homing uses Teknic measured position (counts). Limits only from Arduino. Start: homing rpm=${homingRpm}, poll=${pollMs}ms, phase timeout=${phaseTimeoutMs}ms, min travel for limit=${minTravelForLimit} counts.`,
    );

    /** Phase 0: move off any active limit. */
    const backoffDeadline = Date.now() + phaseTimeoutMs;
    while (Date.now() < backoffDeadline) {
      await integrateMotorMotion();
      const s = await sensor.getSensorStatus();
      if (!s.connected) {
        await stopSafe();
        return { ok: false, error: "Sensor Board disconnected during homing.", log };
      }
      if (!s.limitLeftPressed && !s.limitRightPressed) {
        log.push("Limits clear — starting seek.");
        await stopSafe();
        break;
      }
      if (s.limitLeftPressed && s.limitRightPressed) {
        await stopSafe();
        return {
          ok: false,
          error: "Both limit switches read active — check wiring or backoff manually.",
          log,
        };
      }
      if (s.limitLeftPressed) {
        await jogAssert(rpmTowardRight(homingRpm));
      } else {
        await jogAssert(rpmTowardLeft(homingRpm));
      }
      await sleep(pollMs);
    }
    const s0 = await sensor.getSensorStatus();
    if (s0.limitLeftPressed || s0.limitRightPressed) {
      await stopSafe();
      return { ok: false, error: "Timeout backing off a limit switch.", log };
    }
    await stopSafe();
    await sleep(pollMs);

    /** Seek left limit — record **motor** position at trip (Arduino limits only). */
    lastClock = Date.now();
    const leftDeadline = Date.now() + phaseTimeoutMs;
    let posAtLeft: number | undefined;
    const posAtLeftSeekStart = await requireMotorMeasuredPosition();
    while (Date.now() < leftDeadline) {
      await jogAssert(rpmTowardLeft(homingRpm));
      await integrateMotorMotion();
      const s = await sensor.getSensorStatus();
      if (!s.connected) {
        await stopSafe();
        return { ok: false, error: "Sensor Board disconnected during homing.", log };
      }
      if (s.limitRightPressed && !s.limitLeftPressed) {
        await stopSafe();
        return {
          ok: false,
          error:
            "Right limit tripped while seeking left — limits or jog direction may be reversed.",
          log,
        };
      }
      const pos = await requireMotorMeasuredPosition();
      const movedFromStart = Math.abs(pos - posAtLeftSeekStart);
      if (s.limitLeftPressed && movedFromStart >= minTravelForLimit) {
        await stopSafe();
        posAtLeft = pos;
        log.push(`Left limit at motor measured position=${posAtLeft}.`);
        break;
      }
      await sleep(pollMs);
    }
    await stopSafe();
    if (posAtLeft === undefined) {
      return { ok: false, error: "Timeout seeking left limit.", log };
    }
    await sleep(pollMs);

    /** Seek right limit. */
    lastClock = Date.now();
    const rightDeadline = Date.now() + phaseTimeoutMs;
    let posAtRight: number | undefined;
    let clearedLeftLimitWhileSeekingRight = false;
    const posAtRightSeekStart = await requireMotorMeasuredPosition();
    while (Date.now() < rightDeadline) {
      await jogAssert(rpmTowardRight(homingRpm));
      await integrateMotorMotion();
      const s = await sensor.getSensorStatus();
      if (!s.connected) {
        await stopSafe();
        return { ok: false, error: "Sensor Board disconnected during homing.", log };
      }
      if (!s.limitLeftPressed) {
        clearedLeftLimitWhileSeekingRight = true;
      }
      if (
        clearedLeftLimitWhileSeekingRight &&
        s.limitLeftPressed &&
        !s.limitRightPressed
      ) {
        await stopSafe();
        return {
          ok: false,
          error:
            "Left limit tripped again while seeking right — mechanical or electrical issue.",
          log,
        };
      }
      const pos = await requireMotorMeasuredPosition();
      const movedFromStart = Math.abs(pos - posAtRightSeekStart);
      if (s.limitRightPressed && movedFromStart >= minTravelForLimit) {
        await stopSafe();
        posAtRight = pos;
        log.push(`Right limit at motor measured position=${posAtRight}.`);
        break;
      }
      await sleep(pollMs);
    }
    await stopSafe();
    if (posAtRight === undefined) {
      return { ok: false, error: "Timeout seeking right limit.", log };
    }
    await sleep(pollMs);

    const span = Math.abs(posAtRight - posAtLeft);
    if (span < 1) {
      log.push("Warning: motor span between limits is very small.");
    }
    const mid = (posAtLeft + posAtRight) / 2;
    const incToRight = posAtRight > posAtLeft;
    log.push(
      `Motor span=${span} counts, target mid=${mid} (${incToRight ? "counts increase" : "counts decrease"} toward right jog).`,
    );
    log.push(
      `Midpoint seek: |err| ≤ ${approachThreshold} counts uses approach rpm=${approachRpm}.`,
    );

    function rpmTowardMotorMid(err: number): number {
      const mag =
        Math.abs(err) > approachThreshold ? homingRpm : approachRpm;
      if (err > 0) {
        return incToRight ? rpmTowardLeft(mag) : rpmTowardRight(mag);
      }
      return incToRight ? rpmTowardRight(mag) : rpmTowardLeft(mag);
    }

    /** Move to midpoint using motor measured position. */
    lastClock = Date.now();
    const midDeadline = Date.now() + phaseTimeoutMs;
    while (Date.now() < midDeadline) {
      await integrateMotorMotion();
      const sensMid = await sensor.getSensorStatus();
      if (!sensMid.connected) {
        await stopSafe();
        return { ok: false, error: "Sensor Board disconnected during homing.", log };
      }
      const pos = await requireMotorMeasuredPosition();
      const err = pos - mid;
      if (Math.abs(err) <= midTol) {
        await stopSafe();
        log.push(`Reached mid (motor position=${pos}, target=${mid}).`);

        let motorPositionZeroedAtMid: boolean | undefined;
        if (zeroMotorAtMid) {
          const rz = await motor.zeroMeasuredPosition();
          motorPositionZeroedAtMid = rz.ok;
          if (rz.ok) {
            log.push("Teknic measured position zeroed at rail center (AddToPosition).");
          } else {
            log.push(`Warning: motor zero at mid failed: ${rz.error}`);
          }
        }

        setTravelLimitsFromHoming(
          posAtLeft,
          posAtRight,
          motorPositionZeroedAtMid === true,
        );

        return {
          ok: true,
          motorPositionAtLeftLimit: posAtLeft,
          motorPositionAtRightLimit: posAtRight,
          motorSpanCounts: span,
          midMotorPosition: mid,
          motorPositionZeroedAtMid,
          motorAbsRevolutions,
          log,
        };
      }
      await jogAssert(rpmTowardMotorMid(err));
      await sleep(pollMs);
    }
    await stopSafe();
    return { ok: false, error: "Timeout moving to midpoint.", log };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.push(`Homing aborted: ${msg}`);
    return { ok: false, error: msg, motorAbsRevolutions, log };
  } finally {
    await stopSafe();
  }
}
