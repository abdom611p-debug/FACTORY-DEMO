"""
Fire & smoke detection + alarm logic.

Model: YOLOv8n fine-tuned on D-Fire (21k images, classes: smoke, fire).
Selected after a head-to-head benchmark against two YOLO26-S fire models
(see docs/MODEL_SELECTION.md): best recall on CCTV footage and the fewest false alarms.

A single frame never raises the alarm: FireAlarm requires the hazard to persist across
several recent frames (temporal confirmation) and then applies a cooldown per camera.
"""
import time
from collections import deque
from typing import Deque, Dict, List, Optional

import numpy as np
from ultralytics import YOLO

from app.config import settings

FIRE_WEIGHTS = "app/weights/fire_smoke_dfire_yolov8n.pt"


class FireSmokeDetector:
    def __init__(self, model_path: str = FIRE_WEIGHTS, conf_thresh: float = None):
        self.model_path = model_path
        self.conf_thresh = conf_thresh if conf_thresh is not None else settings.FIRE_CONFIDENCE
        self.model: Optional[YOLO] = None

    def load_model(self) -> None:
        self.model = YOLO(self.model_path)

    def predict(self, frame: np.ndarray, conf: float = None) -> List[dict]:
        if self.model is None:
            self.load_model()
        r = self.model(frame, conf=conf if conf is not None else self.conf_thresh, verbose=False)[0]
        h, w = frame.shape[:2]
        dets = []
        for box, score, cls in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist()):
            label = self.model.names[int(cls)].lower()
            area = (box[2] - box[0]) * (box[3] - box[1]) / float(w * h)
            dets.append({"box": [round(v, 1) for v in box], "score": round(score, 3), "label": label, "area": round(area, 4)})
        return dets


class FireAlarm:
    """Per-camera temporal confirmation: N of the last M frames must contain the hazard."""

    RULES = {
        # label: (hits needed, window, severity, event type)
        "fire": (3, 5, "CRITICAL", "FIRE_DETECTED"),
        "smoke": (4, 6, "HIGH", "SMOKE_DETECTED"),
    }

    def __init__(self, cooldown_sec: float = None):
        self.cooldown = cooldown_sec if cooldown_sec is not None else settings.FIRE_ALARM_COOLDOWN_SEC
        self.history: Dict[str, Dict[str, Deque[bool]]] = {}
        self.last_alarm: Dict[str, float] = {}

    def update(self, camera_id: str, dets: List[dict], now: float = None) -> List[dict]:
        now = now if now is not None else time.time()
        cam = self.history.setdefault(camera_id, {k: deque(maxlen=r[1]) for k, r in self.RULES.items()})
        alarms = []
        for label, (need, _, severity, event_type) in self.RULES.items():
            seen = [d for d in dets if d["label"] == label]
            cam[label].append(bool(seen))
            key = f"{camera_id}:{label}"
            if seen and sum(cam[label]) >= need and (key not in self.last_alarm or now - self.last_alarm[key] > self.cooldown):
                self.last_alarm[key] = now
                best = max(seen, key=lambda d: d["score"]) if seen else None
                alarms.append({
                    "type": event_type,
                    "label": label,
                    "severity": severity,
                    "confidence": best["score"] if best else None,
                    "box": best["box"] if best else None,
                    "area": best["area"] if best else None,
                })
        return alarms

    def state(self, camera_id: str) -> dict:
        cam = self.history.get(camera_id, {})
        return {label: f"{sum(h)}/{h.maxlen}" for label, h in cam.items()}
