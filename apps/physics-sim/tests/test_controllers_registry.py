from controllers.registry import create_controller, list_metadata
from controllers.service import start, status, stop, tick


def test_list_includes_oscillate_position():
    ids = {m["id"] for m in list_metadata()}
    assert "oscillate_position" in ids
    assert "go_to_center" in ids


def test_go_to_center_moves_then_done():
    start("go_to_center", {"centerCm": 0.0, "toleranceCm": 0.5})
    assert status()["active"] is True

    cmd = tick({"positionCm": 5.0, "timeSec": 0.0})
    assert cmd["positionCm"] == 0.0

    assert tick({"positionCm": 2.0, "timeSec": 0.5}) == {}

    done = tick({"positionCm": 0.1, "timeSec": 1.0})
    assert done.get("done") is True

    stop()


def test_oscillate_position_alternates_targets():
    start("oscillate_position", {"amplitudeCm": 2.0, "toleranceCm": 0.1, "dwellSec": 0.0})
    assert status()["active"] is True

    cmd0 = tick({"positionCm": 10.0, "timeSec": 0.0})
    assert cmd0["positionCm"] == 8.0

    assert tick({"positionCm": 8.0, "timeSec": 0.1}) == {}

    cmd1 = tick({"positionCm": 8.05, "timeSec": 0.2})
    assert cmd1["positionCm"] == 12.0

    stop()
    assert status()["active"] is False


def test_create_unknown_raises():
    try:
        create_controller("not_a_real_controller", {})
        raised = False
    except ValueError:
        raised = True
    assert raised
