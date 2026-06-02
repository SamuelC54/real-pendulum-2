"""Rail jog scale: Teknic RPM ↔ cart cm/s (matches physical-motor-service motionUnits)."""

from __future__ import annotations

# Default matches config.sim.plant.mpsPerRpm in app-config.
_DEFAULT_MPS_PER_RPM = 0.0007


def rpm_to_cm_per_sec(rpm: float, *, mps_per_rpm: float = _DEFAULT_MPS_PER_RPM) -> float:
    return -rpm * mps_per_rpm * 100.0


def cm_per_sec_to_rpm(cm_per_sec: float, *, mps_per_rpm: float = _DEFAULT_MPS_PER_RPM) -> float:
    if mps_per_rpm == 0:
        return 0.0
    return -(cm_per_sec / 100.0) / mps_per_rpm


def tick_command_to_cm_units(out: dict) -> dict:
    """Normalize controller tick payloads to cm/s for control-api."""
    if not out:
        return out
    result = dict(out)
    if "rpm" in result:
        result["cmPerSec"] = rpm_to_cm_per_sec(float(result.pop("rpm")))
    if "maxVelocityRpm" in result:
        result["maxVelocityCmPerSec"] = rpm_to_cm_per_sec(float(result.pop("maxVelocityRpm")))
    if "maxAccelerationRpmPerSec" in result:
        rpm_s = float(result.pop("maxAccelerationRpmPerSec"))
        result["maxAccelerationCmPerSec2"] = -rpm_s * _DEFAULT_MPS_PER_RPM * 100.0
    return result
