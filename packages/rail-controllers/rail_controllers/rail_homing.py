"""Seek travel limits and center the rail (Teknic measured position + limit switches)."""

from __future__ import annotations

import math
from enum import Enum, auto
from typing import Any

METADATA = {
    "id": "rail_homing",
    "name": "Home rail",
    "description": (
        "Back off active limits, seek left then right limit switches, move to midpoint, "
        "optionally zero Teknic measured position at center. Uses motor measured counts "
        "and Arduino limit switches only."
    ),
    "defaultParams": {
        "jogRpm": 60.0,
        "midPositionTolerance": 2.0,
        "approachPosition": 48.0,
        "approachRpm": 22.0,
        "zeroMotorAtMid": 1.0,
        "minTravelForLimitCounts": 48.0,
        "phaseTimeoutSec": 120.0,
    },
    "paramLabels": {
        "jogRpm": "Homing jog RPM",
        "midPositionTolerance": "Mid tolerance (counts)",
        "approachPosition": "Approach threshold (counts)",
        "approachRpm": "Approach RPM",
        "zeroMotorAtMid": "Zero at mid (1=yes)",
        "minTravelForLimitCounts": "Min travel before limit (counts)",
        "phaseTimeoutSec": "Phase timeout (s)",
    },
    "paramOrder": [
        "jogRpm",
        "midPositionTolerance",
        "approachPosition",
        "approachRpm",
        "zeroMotorAtMid",
        "minTravelForLimitCounts",
        "phaseTimeoutSec",
    ],
}


class _Phase(Enum):
    BACKOFF = auto()
    SEEK_LEFT = auto()
    SEEK_RIGHT = auto()
    SEEK_MID = auto()


def _rpm_toward_left(rpm: float) -> float:
    return rpm


def _rpm_toward_right(rpm: float) -> float:
    return -rpm


class RailHomingController:
    def __init__(self, params: dict[str, Any]) -> None:
        d = METADATA["defaultParams"]
        self.homing_rpm = float(min(120, max(5, params.get("jogRpm", d["jogRpm"]))))
        self.mid_tol = float(params.get("midPositionTolerance", d["midPositionTolerance"]))
        self.approach_threshold = float(
            max(self.mid_tol + 1, params.get("approachPosition", d["approachPosition"]))
        )
        self.approach_rpm = float(min(self.homing_rpm, max(8, params.get("approachRpm", d["approachRpm"]))))
        self.zero_at_mid = bool(int(params.get("zeroMotorAtMid", d["zeroMotorAtMid"])))
        self.min_travel = float(max(0, params.get("minTravelForLimitCounts", d["minTravelForLimitCounts"])))
        self.phase_timeout_sec = float(params.get("phaseTimeoutSec", d["phaseTimeoutSec"]))

        self.phase = _Phase.BACKOFF
        self.started_at = 0.0
        self.phase_started_at = 0.0
        self.log: list[str] = []
        self.pos_at_left: float | None = None
        self.pos_at_right: float | None = None
        self.pos_at_left_seek_start: float | None = None
        self.pos_at_right_seek_start: float | None = None
        self.cleared_left_while_seeking_right = False
        self.inc_to_right = True
        self.motor_abs_revolutions = 0.0
        self._last_time_sec: float | None = None
        self._last_rpm = 0.0

    def _timeout(self, time_sec: float) -> bool:
        return time_sec - self.phase_started_at > self.phase_timeout_sec

    def _integrate_rpm(self, time_sec: float) -> None:
        if self._last_time_sec is not None:
            dt = time_sec - self._last_time_sec
            if dt > 0:
                self.motor_abs_revolutions += abs(self._last_rpm) * dt / 60.0
        self._last_time_sec = time_sec

    def _fail(self, msg: str) -> dict[str, Any]:
        self.log.append(f"Homing aborted: {msg}")
        return {
            "done": True,
            "error": msg,
            "log": self.log,
            "motorAbsRevolutions": self.motor_abs_revolutions,
        }

    def _success(self) -> dict[str, Any]:
        span = abs(self.pos_at_right - self.pos_at_left)  # type: ignore[operator]
        mid = (self.pos_at_left + self.pos_at_right) / 2  # type: ignore[operator]
        if span < 1:
            self.log.append("Warning: motor span between limits is very small.")
        return {
            "done": True,
            "homingResult": {
                "posAtLeft": self.pos_at_left,
                "posAtRight": self.pos_at_right,
                "motorSpanCounts": span,
                "midMotorPosition": mid,
                "zeroMotorAtMid": self.zero_at_mid,
            },
            "log": self.log,
            "motorAbsRevolutions": self.motor_abs_revolutions,
        }

    def tick(self, state: dict[str, Any]) -> dict[str, Any]:
        time_sec = float(state.get("timeSec", 0))
        if self.started_at == 0.0:
            self.started_at = time_sec
            self.phase_started_at = time_sec
            self.log.append(
                f"Homing start: rpm={self.homing_rpm}, min travel={self.min_travel} counts, "
                f"timeout={self.phase_timeout_sec}s."
            )

        if not state.get("cartConnected", True):
            return self._fail("Motor is not connected.")
        if not state.get("sensorConnected", True):
            return self._fail("Sensor board is not connected.")

        measured = state.get("measuredPosition")
        if measured is None or not math.isfinite(float(measured)):
            return self._fail(
                "Motor measured position unavailable — rebuild motor DLL for PosnMeasured."
            )
        pos = float(measured)
        left = bool(state.get("limitLeftPressed"))
        right = bool(state.get("limitRightPressed"))

        self._integrate_rpm(time_sec)

        if self.phase == _Phase.BACKOFF:
            if not left and not right:
                self.log.append("Limits clear — starting seek.")
                self.phase = _Phase.SEEK_LEFT
                self.phase_started_at = time_sec
                self.pos_at_left_seek_start = pos
                self._last_rpm = 0.0
                return {"rpm": 0.0}
            if left and right:
                return self._fail("Both limit switches active — check wiring.")
            rpm = _rpm_toward_right(self.homing_rpm) if left else _rpm_toward_left(self.homing_rpm)
            self._last_rpm = rpm
            if self._timeout(time_sec):
                return self._fail("Timeout backing off a limit switch.")
            return {"rpm": rpm}

        if self.phase == _Phase.SEEK_LEFT:
            if right and not left:
                return self._fail("Right limit tripped while seeking left — check wiring/direction.")
            moved = abs(pos - (self.pos_at_left_seek_start or pos))
            if left and moved >= self.min_travel:
                self.pos_at_left = pos
                self.log.append(f"Left limit at motor measured position={self.pos_at_left}.")
                self.phase = _Phase.SEEK_RIGHT
                self.phase_started_at = time_sec
                self.pos_at_right_seek_start = pos
                self.cleared_left_while_seeking_right = False
                self._last_rpm = 0.0
                return {"rpm": 0.0}
            rpm = _rpm_toward_left(self.homing_rpm)
            self._last_rpm = rpm
            if self._timeout(time_sec):
                return self._fail("Timeout seeking left limit.")
            return {"rpm": rpm}

        if self.phase == _Phase.SEEK_RIGHT:
            if not left:
                self.cleared_left_while_seeking_right = True
            if self.cleared_left_while_seeking_right and left and not right:
                return self._fail("Left limit tripped again while seeking right.")
            moved = abs(pos - (self.pos_at_right_seek_start or pos))
            if right and moved >= self.min_travel:
                self.pos_at_right = pos
                self.log.append(f"Right limit at motor measured position={self.pos_at_right}.")
                self.inc_to_right = self.pos_at_right > self.pos_at_left  # type: ignore[operator]
                self.phase = _Phase.SEEK_MID
                self.phase_started_at = time_sec
                self._last_rpm = 0.0
                return {"rpm": 0.0}
            rpm = _rpm_toward_right(self.homing_rpm)
            self._last_rpm = rpm
            if self._timeout(time_sec):
                return self._fail("Timeout seeking right limit.")
            return {"rpm": rpm}

        # SEEK_MID
        mid = (self.pos_at_left + self.pos_at_right) / 2  # type: ignore[operator]
        err = pos - mid
        if abs(err) <= self.mid_tol:
            self.log.append(f"Reached mid (motor position={pos}, target={mid}).")
            self._last_rpm = 0.0
            return self._success()

        mag = self.homing_rpm if abs(err) > self.approach_threshold else self.approach_rpm
        if err > 0:
            rpm = _rpm_toward_left(mag) if self.inc_to_right else _rpm_toward_right(mag)
        else:
            rpm = _rpm_toward_right(mag) if self.inc_to_right else _rpm_toward_left(mag)
        self._last_rpm = rpm
        if self._timeout(time_sec):
            return self._fail("Timeout moving to midpoint.")
        return {"rpm": rpm}


def create(params: dict[str, Any]) -> RailHomingController:
    return RailHomingController(params)
