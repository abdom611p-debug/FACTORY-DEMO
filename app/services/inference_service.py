import threading
import time
from collections import deque
from typing import Any, Dict, List

import numpy as np

from app.config import settings
from app.models.anpr import EgyptianANPR
from app.models.detector import YOLODetector
from app.models.face import FaceNetRecognizer
from app.models.fire import FireAlarm, FireSmokeDetector
from app.models.pose import PoseAnalyzer
from app.models.ppe import PPE_EVENT, PPEDetector
from app.models.smoking import SmokingAlarm, SmokingDetector
from app.schemas.events import AIEvent
from app.tracking.tracker import Tracker
from app.zones.zone_manager import ZoneManager


class _Guarded:
    """Lazy-loads a model once and serialises inference (Ultralytics models are not thread-safe)."""

    def __init__(self, model):
        self.model = model
        self.lock = threading.Lock()
        self.loaded = False

    def ensure(self):
        with self.lock:
            if not self.loaded:
                self.model.load_model()
                self.loaded = True
        return self


class InferenceService:
    def __init__(self):
        self.detector = YOLODetector()
        self.ppe_detector = PPEDetector()
        self.fire_detector = FireSmokeDetector()
        self.pose = PoseAnalyzer()
        self.anpr = EgyptianANPR()
        self.smoking = SmokingDetector()
        self.smoking_alarm = SmokingAlarm()
        self.face_recognizer = FaceNetRecognizer()
        self.tracker = Tracker()
        self.zone_manager = ZoneManager()
        self.fire_alarm = FireAlarm()

        self._g = {name: _Guarded(m) for name, m in {
            "detector": self.detector, "ppe": self.ppe_detector, "fire": self.fire_detector,
            "pose": self.pose, "anpr": self.anpr, "smoking": self.smoking, "face": self.face_recognizer,
        }.items()}
        self.frame_count = 0
        self.face_recognition_interval = 10  # run face rec every N frames per track
        self.ppe_interval = 2  # PPE on every 2nd frame of a stream
        self.ppe_history: Dict[str, Dict[str, deque]] = {}
        self.ppe_last_alarm: Dict[str, float] = {}

    def initialize(self, names: List[str] = None):
        for name in names or self._g:
            try:
                self._g[name].ensure()
            except Exception as e:  # a missing optional model must not take the engine down
                print(f"[engine] could not load {name}: {e}")

    def status(self) -> Dict[str, bool]:
        return {name: g.loaded for name, g in self._g.items()}

    def _run(self, name: str, fn):
        g = self._g[name].ensure()
        with g.lock:
            t0 = time.perf_counter()
            out = fn()
            return out, round((time.perf_counter() - t0) * 1000)

    # ---------- single-shot APIs (REST) ----------
    def detect_ppe(self, image: np.ndarray) -> dict:
        dets, ms = self._run("ppe", lambda: self.ppe_detector.predict(image))
        h, w = image.shape[:2]
        return {"dets": dets, "people": PPEDetector.analyze(dets, w, h), "ms": ms, "schema": "sh17", "model": "YOLOv8s-SH17"}

    def detect_fire(self, image: np.ndarray, camera_id: str = None, conf: float = None) -> dict:
        dets, ms = self._run("fire", lambda: self.fire_detector.predict(image, conf=conf))
        alarms = self.fire_alarm.update(camera_id, dets) if camera_id else []
        return {"dets": dets, "alarms": alarms, "ms": ms, "model": "YOLOv8n-D-Fire",
                "state": self.fire_alarm.state(camera_id) if camera_id else None}

    def detect_smoking(self, image: np.ndarray, camera_id: str = None) -> dict:
        res, ms = self._run("smoking", lambda: self.smoking.predict(image))
        alarm = self.smoking_alarm.update(camera_id, res) if camera_id else None
        return {**res, "alarms": [alarm] if alarm else [], "ms": ms, "model": "Ensemble YOLOv8 + YOLO11m (cigarette/vape)"}

    def detect_pose(self, image: np.ndarray) -> dict:
        people, ms = self._run("pose", lambda: self.pose.predict(image))
        return {"people": people, "ms": ms, "model": "YOLO26n-pose"}

    def read_plates(self, image: np.ndarray) -> dict:
        plates, ms = self._run("anpr", lambda: self.anpr.read(image))
        return {"plates": plates, "ms": ms, "model": "YOLO11n plate + EGIC-trained OCR ensemble (EG)"}

    # ---------- streaming pipeline ----------
    def _ppe_events(self, people: List[dict], camera_id: str) -> List[dict]:
        hist = self.ppe_history.setdefault(camera_id, {k: deque(maxlen=5) for k in PPE_EVENT})
        events, now = [], time.time()
        for item, event_type in PPE_EVENT.items():
            hist[item].append(any(p["items"].get(item, {}).get("state") == "MISSING" for p in people))
            key = f"{camera_id}:{item}"
            if sum(hist[item]) >= 3 and (key not in self.ppe_last_alarm or now - self.ppe_last_alarm[key] > settings.PPE_ALARM_COOLDOWN_SEC):
                self.ppe_last_alarm[key] = now
                events.append(AIEvent.create(event_type=event_type, camera_id=camera_id, confidence=0.85,
                                             evidence={"missing": item}).model_dump())
        return events

    def process_frame(self, frame_image: np.ndarray, camera_id: str = "cam-01") -> tuple[list, List[Dict[str, Any]]]:
        self.frame_count += 1

        # 1. Base detection & tracking (person / vehicle)
        (detections, _) = self._run("detector", lambda: self.detector.predict(frame_image, camera_id=camera_id))
        self.tracker.update(detections)
        events: List[Dict[str, Any]] = []

        # 2. Face recognition on tracked persons (periodically)
        face_ready = self._g["face"].loaded
        for det in detections:
            if det.class_name != "person" or det.track_id is None or not face_ready:
                continue
            track = self.tracker.get_track(det.track_id)
            if not track or (track.worker_id is not None and self.frame_count % self.face_recognition_interval != 0):
                continue
            h, w = frame_image.shape[:2]
            x1, y1, x2, y2 = map(int, [det.bbox.x1, det.bbox.y1, det.bbox.x2, det.bbox.y2])
            crop = frame_image[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
            if crop.size == 0:
                continue
            worker_id = self.face_recognizer.identify_face(crop)
            if worker_id:
                det.face_id = worker_id
                if track.worker_id != worker_id:
                    events.append(AIEvent.create(event_type="FACE_RECOGNIZED", camera_id=camera_id,
                                                 worker_id=worker_id, track_id=det.track_id).model_dump())
                track.worker_id = worker_id

        # 3. PPE compliance (only when people are in view)
        if any(d.class_name == "person" for d in detections) and self.frame_count % self.ppe_interval == 0:
            events += self._ppe_events(self.detect_ppe(frame_image)["people"], camera_id)

        # 4. Fire & smoke — every frame, alarm after temporal confirmation
        for a in self.detect_fire(frame_image, camera_id=camera_id)["alarms"]:
            events.append(AIEvent.create(event_type=a["type"], camera_id=camera_id, confidence=a["confidence"],
                                         evidence={"severity": a["severity"], "box": a["box"], "area": a["area"]}).model_dump())

        # 5. Smoking — only when people are in view (every 2nd frame)
        if any(d.class_name == "person" for d in detections) and self.frame_count % 2 == 1:
            for a in self.detect_smoking(frame_image, camera_id=camera_id)["alarms"]:
                events.append(AIEvent.create(event_type=a["type"], camera_id=camera_id, confidence=a["confidence"],
                                             evidence={"severity": a["severity"], "box": a["box"], "label": a["label"]}).model_dump())

        # 6. Zones
        for det in detections:
            for ze in self.zone_manager.process_detection(det):
                events.append(AIEvent.create(event_type=ze["type"], camera_id=camera_id, worker_id=ze.get("worker_id"),
                                             track_id=ze.get("track_id"), zone_id=ze.get("zone_id")).model_dump())
        return detections, events
