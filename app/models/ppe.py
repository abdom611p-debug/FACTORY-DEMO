"""
PPE detection — YOLOv8s trained on SH17 (17 manufacturing-safety classes:
person, head, face, helmet, glasses, safety-vest, gloves, ...).

Detections are associated with each person (same rules as the EGIC browser runtime,
js/ai.js → analyzePPE) to decide helmet / glasses / vest: OK, MISSING or UNKNOWN
(not visible enough to judge).
"""
from typing import Dict, List, Optional

import numpy as np
from ultralytics import YOLO

PPE_WEIGHTS = "app/weights/ppe_sh17_yolov8s.pt"

# per-class confidence (SH17 classes not used for compliance are effectively disabled)
PPE_CONF = {"person": 0.35, "head": 0.3, "face": 0.3, "helmet": 0.35, "glasses": 0.28, "safety-vest": 0.35,
            "safety-suit": 0.4, "gloves": 0.35, "face-mask": 0.35, "face-guard": 0.35, "hands": 0.35,
            "shoes": 0.35, "ear": 0.9, "ear-mufs": 0.4, "foot": 0.9, "tool": 0.9, "medical-suit": 0.5}

PPE_EVENT = {"helmet": "NO_HELMET_DETECTED", "glasses": "NO_GLASSES_DETECTED", "vest": "NO_VEST_DETECTED"}


def _center(b):
    return ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)


def _inside(p, b):
    return b[0] <= p[0] <= b[2] and b[1] <= p[1] <= b[3]


def _ioa(a, b):
    """intersection over area of a"""
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area = (a[2] - a[0]) * (a[3] - a[1])
    return inter / area if area > 0 else 0


def _expand(b, l, t, r, bt):
    w, h = b[2] - b[0], b[3] - b[1]
    return [b[0] - w * l, b[1] - h * t, b[2] + w * r, b[3] + h * bt]


def _pick(items: List[dict], score_fn) -> Optional[dict]:
    best, bs = None, 0
    for x in items:
        s = score_fn(x)
        if s > bs:
            best, bs = x, s
    return best


class PPEDetector:
    def __init__(self, model_path: str = PPE_WEIGHTS):
        self.model_path = model_path
        self.model: Optional[YOLO] = None

    def load_model(self) -> None:
        self.model = YOLO(self.model_path)

    def predict(self, frame: np.ndarray) -> List[dict]:
        if self.model is None:
            self.load_model()
        r = self.model(frame, conf=min(PPE_CONF.values()), iou=0.5, verbose=False)[0]
        dets = []
        for box, score, cls in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist()):
            label = self.model.names[int(cls)]
            if score >= PPE_CONF.get(label, 0.35):
                dets.append({"box": [round(v, 1) for v in box], "score": round(score, 3), "label": label})
        return dets

    @staticmethod
    def analyze(dets: List[dict], width: int, height: int) -> List[dict]:
        """Group PPE items per person → [{box, items: {helmet|glasses|vest: {state, box?, score?}}}]"""
        by: Dict[str, List[dict]] = {}
        for d in dets:
            by.setdefault(d["label"], []).append(d)
        persons = [p["box"] for p in by.get("person", [])]
        heads, faces = by.get("head", []), by.get("face", [])
        helmets, glasses, vests = by.get("helmet", []), by.get("glasses", []), by.get("safety-vest", [])

        # close-up camera with no person box: synthesise one from the head / face
        for hd in heads or faces:
            if not any(_inside(_center(hd["box"]), p) for p in persons):
                b = hd["box"]
                w, h = b[2] - b[0], b[3] - b[1]
                persons.append([max(0, b[0] - w * 1.3), max(0, b[1] - h * 0.25), min(width, b[2] + w * 1.3), min(height, b[3] + h * 5)])

        people = []
        for p in persons:
            ph = p[3] - p[1]
            top = [p[0], p[1] - ph * 0.08, p[2], p[1] + ph * 0.5]
            head = _pick(heads, lambda x: _ioa(x["box"], p) * x["score"] if _inside(_center(x["box"]), top) else 0)
            face = _pick(faces, lambda x: _ioa(x["box"], p) * x["score"] if _inside(_center(x["box"]), top) else 0)
            head_box = head["box"] if head else (_expand(face["box"], 0.18, 0.45, 0.18, 0.1) if face else None)
            items = {}

            if head_box:
                hz = _expand(head_box, 0.25, 0.7, 0.25, 0.1)
                hel = _pick(helmets, lambda x: x["score"] if (_inside(_center(x["box"]), hz) or _ioa(x["box"], hz) > 0.4) else 0)
                items["helmet"] = {"state": "OK", "box": hel["box"], "score": hel["score"]} if hel else {"state": "MISSING"}
            else:
                items["helmet"] = {"state": "UNKNOWN"}

            if face:
                gz = _expand(face["box"], 0.1, 0.05, 0.1, -0.35)
                gl = _pick(glasses, lambda x: x["score"] if (_inside(_center(x["box"]), gz) or _ioa(x["box"], face["box"]) > 0.5) else 0)
                items["glasses"] = {"state": "OK", "box": gl["box"], "score": gl["score"]} if gl else {"state": "MISSING"}
            else:
                items["glasses"] = {"state": "UNKNOWN"}

            head_h = head_box[3] - head_box[1] if head_box else ph * 0.2
            torso_top = head_box[3] + head_h * 0.15 if head_box else p[1] + ph * 0.25
            if min(p[3], height) - torso_top > head_h * 0.55:
                tz = [p[0], torso_top - head_h * 0.3, p[2], p[3]]
                vs = _pick(vests, lambda x: x["score"] if _ioa(x["box"], tz) > 0.45 else 0)
                items["vest"] = {"state": "OK", "box": vs["box"], "score": vs["score"]} if vs else {"state": "MISSING"}
            else:
                items["vest"] = {"state": "UNKNOWN"}

            people.append({"box": [round(v, 1) for v in p], "items": items})
        return people
