from typing import List, Dict, Any
import cv2
import numpy as np

from app.models.detector import YOLODetector
from app.models.ppe import PPEDetector
from app.models.face import FaceNetRecognizer
from app.tracking.tracker import Tracker
from app.zones.zone_manager import ZoneManager
from app.schemas.detection import Detection
from app.schemas.events import AIEvent

class InferenceService:
    def __init__(self):
        self.detector = YOLODetector()
        self.ppe_detector = PPEDetector()
        self.face_recognizer = FaceNetRecognizer()
        self.tracker = Tracker()
        self.zone_manager = ZoneManager()
        
        self.frame_count = 0
        self.face_recognition_interval = 10 # Run face rec every N frames per track
        
    def initialize(self):
        self.detector.load_model()
        self.ppe_detector.load_model()
        self.face_recognizer.load_model()
        
    def process_frame(self, frame_image: np.ndarray, camera_id: str = "cam-01") -> tuple[List[Detection], List[Dict[str, Any]]]:
        self.frame_count += 1
        
        # 1. Base Detection & Tracking (Person/Vehicle)
        detections = self.detector.predict(frame_image, camera_id=camera_id)
        
        # 2. Update Tracker (to persist worker_ids across frames)
        self.tracker.update(detections)
        
        events = []
        
        # 3. Process each person detection for Face & PPE
        for det in detections:
            if det.class_name == "person":
                
                # Check Face Recognition (only if we don't know who this is, or periodically)
                if det.track_id is not None:
                    track = self.tracker.get_track(det.track_id)
                    if track and (track.worker_id is None or self.frame_count % self.face_recognition_interval == 0):
                        # Crop face area (approximate top 20% of bounding box for demo, or run MTCNN on full box)
                        x1, y1, x2, y2 = map(int, [det.bbox.x1, det.bbox.y1, det.bbox.x2, det.bbox.y2])
                        # Basic bounds check
                        h, w = frame_image.shape[:2]
                        x1, y1 = max(0, x1), max(0, y1)
                        x2, y2 = min(w, x2), min(h, y2)
                        
                        person_crop = frame_image[y1:y2, x1:x2]
                        if person_crop.size > 0:
                            worker_id = self.face_recognizer.identify_face(person_crop)
                            if worker_id:
                                det.face_id = worker_id
                                if track.worker_id != worker_id:
                                    events.append(AIEvent.create(
                                        event_type="FACE_RECOGNIZED",
                                        camera_id=camera_id,
                                        worker_id=worker_id,
                                        track_id=det.track_id
                                    ).model_dump())
                                track.worker_id = worker_id
                
                # We could run PPE detection locally on the cropped person
                # For demo, the global PPE model might just return all PPEs, 
                # but let's assume we run it on the crop to associate it.
                # Actually, the global PPEDetector runs on the full frame in a real setup,
                # then uses IoU to match vests/helmets to person bboxes.
                
        # 4. Global PPE Detection (Optional/Demo)
        # ppe_detections = self.ppe_detector.predict(frame_image, camera_id)
        # ... logic to assign PPE to person detections based on bounding box overlap ...
        
        # 5. Zone Engine evaluation
        for det in detections:
            zone_events = self.zone_manager.process_detection(det)
            for ze in zone_events:
                events.append(AIEvent.create(
                    event_type=ze["type"],
                    camera_id=camera_id,
                    worker_id=ze.get("worker_id"),
                    track_id=ze.get("track_id"),
                    zone_id=ze.get("zone_id")
                ).model_dump())
                
        return detections, events
