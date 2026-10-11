"""Model-free tests for the alarm / association logic (fast, no weights needed)."""
from app.models.anpr import assemble_plate
from app.models.fire import FireAlarm
from app.models.ppe import PPEDetector
from app.models.smoking import SmokingAlarm


def _fire(score=0.8):
    return [{"box": [10, 10, 50, 50], "score": score, "label": "fire", "area": 0.01}]


def test_fire_alarm_needs_temporal_confirmation():
    alarm = FireAlarm(cooldown_sec=60)
    assert alarm.update("cam", _fire(), now=0) == []
    assert alarm.update("cam", _fire(), now=1) == []
    out = alarm.update("cam", _fire(), now=2)
    assert len(out) == 1 and out[0]["type"] == "FIRE_DETECTED" and out[0]["severity"] == "CRITICAL"
    # cooldown: still burning, no duplicate alarm
    assert alarm.update("cam", _fire(), now=3) == []
    # after the cooldown it fires again
    assert alarm.update("cam", _fire(), now=70)[0]["type"] == "FIRE_DETECTED"


def test_fire_alarm_ignores_single_flicker_and_is_per_camera():
    alarm = FireAlarm(cooldown_sec=60)
    for t, dets in enumerate([_fire(), [], [], _fire(), []]):
        assert alarm.update("cam-a", dets, now=t) == []
    alarm.update("cam-b", _fire(), now=0)
    alarm.update("cam-b", _fire(), now=1)
    assert alarm.update("cam-a", _fire(), now=5) == []  # cam-a has only 2/5 hits


def test_smoke_needs_more_evidence_than_fire():
    alarm = FireAlarm(cooldown_sec=60)
    smoke = [{"box": [0, 0, 9, 9], "score": 0.6, "label": "smoke", "area": 0.01}]
    for t in range(3):
        assert alarm.update("cam", smoke, now=t) == []
    assert alarm.update("cam", smoke, now=3)[0]["type"] == "SMOKE_DETECTED"


def test_smoking_alarm():
    alarm = SmokingAlarm(hits=3, window=5, cooldown_sec=45)
    pos = {"smoking": True, "score": 0.7, "dets": [{"box": [1, 2, 3, 4], "label": "cigarette", "score": 0.7}]}
    neg = {"smoking": False, "score": 0.0, "dets": []}
    assert alarm.update("cam", pos, now=0) is None
    assert alarm.update("cam", neg, now=1) is None
    assert alarm.update("cam", pos, now=2) is None
    a = alarm.update("cam", pos, now=3)
    assert a and a["type"] == "SMOKING_DETECTED" and a["label"] == "cigarette"


def test_ppe_association_helmet_ok_vest_missing():
    dets = [
        {"box": [100, 50, 300, 600], "score": 0.9, "label": "person"},
        {"box": [160, 60, 240, 140], "score": 0.8, "label": "head"},
        {"box": [150, 40, 250, 110], "score": 0.85, "label": "helmet"},
    ]
    people = PPEDetector.analyze(dets, 640, 640)
    assert len(people) == 1
    items = people[0]["items"]
    assert items["helmet"]["state"] == "OK"
    assert items["vest"]["state"] == "MISSING"
    assert items["glasses"]["state"] == "UNKNOWN"  # no face visible → cannot judge


def test_egyptian_plate_assembly():
    # visual order left→right: digits ٧ ١ ٢ then letters (read right→left)
    chars = [
        {"box": [10, 20, 30, 60], "score": 0.9, "label": "7"},
        {"box": [35, 20, 55, 60], "score": 0.9, "label": "1"},
        {"box": [60, 20, 80, 60], "score": 0.9, "label": "2"},
        {"box": [100, 20, 120, 60], "score": 0.9, "label": "non"},
        {"box": [125, 20, 145, 60], "score": 0.9, "label": "taa"},
    ]
    r = assemble_plate(chars)
    assert r["valid"]
    assert r["digits"] == "٧١٢"
    assert r["letters"] == ["ط", "ن"]
