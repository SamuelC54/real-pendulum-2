from rail_controllers.registry import create_controller, list_metadata
from rail_controllers.service import start, status, stop, tick


def _state(
    *,
    pos: float,
    time_sec: float,
    left: bool = False,
    right: bool = False,
) -> dict:
    return {
        "measuredPosition": pos,
        "timeSec": time_sec,
        "limitLeftPressed": left,
        "limitRightPressed": right,
        "cartConnected": True,
        "sensorConnected": True,
    }


def test_rail_homing_completes_when_limits_found():
    start("rail_homing", {"jogRpm": 60.0, "minTravelForLimitCounts": 5.0, "phaseTimeoutSec": 30.0})
    assert status()["active"] is True

    # Back off right limit
    out = tick(_state(pos=0.0, time_sec=0.0, right=True))
    assert out.get("rpm") == 60.0

    # Clear limits → seek left
    tick(_state(pos=1.0, time_sec=0.1))
    out = tick(_state(pos=2.0, time_sec=0.2))
    assert out.get("rpm") == 60.0

    # Hit left limit after min travel
    tick(_state(pos=10.0, time_sec=0.3, left=True))
    tick(_state(pos=12.0, time_sec=0.4, left=True))

    # Seek right
    tick(_state(pos=12.0, time_sec=0.5, left=False))
    tick(_state(pos=20.0, time_sec=0.6, right=True))

    # Move to mid and finish
    done = tick(_state(pos=16.0, time_sec=0.7))
    assert done.get("done") is True
    assert "homingResult" in done
    assert done["homingResult"]["motorSpanCounts"] > 0

    stop()
    assert status()["active"] is False


def test_rail_homing_metadata_registered():
    ids = {m["id"] for m in list_metadata()}
    assert "rail_homing" in ids
    ctrl = create_controller("rail_homing", {})
    assert hasattr(ctrl, "tick")
