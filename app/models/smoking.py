"""
Smoking detection — ensemble of two cigarette detectors (selected after benchmarking 7 public models
on an independent smoking / not-smoking test set, see docs/MODEL_SELECTION.md):

  • YOLOv8  (cigarette · vape · smoke · person)   — best single model, F1 0.85
  • YOLO11m (cigarette)                            — F1 0.83
  • mean of both scores                            — F1 0.88, precision 0.93, 0 false alarms on webcam shots

A person is flagged as smoking when the fused cigarette/vape score passes the threshold;
SmokingAlarm then needs the detection to persist across frames before raising an event.
"""
import time
from collections import deque
from typing import Dict, List, Optional

import numpy as np
from ultralytics import YOLO

SMOKING_WEIGHTS = ("app/weights/smoking_yolov8_cigarette_vape.pt", "app/weights/smoking_yolo11m_cigarette.pt")
SMOKING_LABELS = {"cigarette", "vape", "smoke", "smooking"}


def _iou(a, b):
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / u if u > 0 else 0


class SmokingDetector:
    def __init__(self, model_paths=SMOKING_WEIGHTS, threshold: float = 0.3):
        self.model_paths = model_paths
        self.threshold = threshold
        self.models: List[YOLO] = []

    def load_model(self) -> None:
        self.models = [YOLO(p) for p in self.model_paths]

    def _run(self, m: YOLO, frame: np.ndarray) -> List[dict]:
        r = m(frame, conf=0.1, verbose=False)[0]
        out = []
        for box, score, cls in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist()):
            label = m.names[int(cls)].lower()
            out.append({"box": [round(v, 1) for v in box], "score": round(score, 3),
                        "label": "cigarette" if label in ("smooking",) else label})
        return out

    def predict(self, frame: np.ndarray) -> dict:
        if not self.models:
            self.load_model()
        per_model = [self._run(m, frame) for m in self.models]
        persons = [d for d in per_model[0] if d["label"] == "person" and d["score"] >= 0.35]
        hits = [[d for d in dets if d["label"] in SMOKING_LABELS] for dets in per_model]

        # image-level fused score = mean of each model's best smoking score (0 when a model sees nothing)
        best = [max((d["score"] for d in h), default=0.0) for h in hits]
        fused = sum(best) / len(best)

        # boxes: model-1 boxes, confirmed or boosted by model-2 overlap
        dets = []
        for d in hits[0] + [x for x in (hits[1] if len(hits) > 1 else []) if not any(_iou(x["box"], y["box"]) > 0.3 for y in hits[0])]:
            partner = max((y["score"] for h in hits for y in h if y is not d and _iou(y["box"], d["box"]) > 0.3), default=0.0)
            score = round((d["score"] + partner) / 2, 3)
            if score >= self.threshold * 0.8:
                dets.append({**d, "score": score})
        dets.sort(key=lambda d: -d["score"])
        return {"smoking": fused >= self.threshold, "score": round(fused, 3), "dets": dets, "persons": persons}


class SmokingAlarm:
    def __init__(self, hits: int = 3, window: int = 5, cooldown_sec: float = 45):
        self.hits, self.window, self.cooldown = hits, window, cooldown_sec
        self.history: Dict[str, deque] = {}
        self.last: Dict[str, float] = {}

    def update(self, camera_id: str, result: dict, now: float = None) -> Optional[dict]:
        now = now if now is not None else time.time()
        h = self.history.setdefault(camera_id, deque(maxlen=self.window))
        h.append(result["smoking"])
        if result["smoking"] and sum(h) >= self.hits and (camera_id not in self.last or now - self.last[camera_id] > self.cooldown):
            self.last[camera_id] = now
            top = result["dets"][0] if result["dets"] else None
            return {"type": "SMOKING_DETECTED", "severity": "HIGH", "confidence": result["score"],
                    "box": top["box"] if top else None, "label": top["label"] if top else "cigarette"}
        return None
