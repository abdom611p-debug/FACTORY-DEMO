from typing import List
import numpy as np
from app.models.base import BaseDetector
from app.models.detector import YOLODetector
from app.schemas.detection import Detection

class VehicleDetector(BaseDetector):
    def __init__(self, model_path: str = "yolov8n.pt", conf_thresh: float = 0.5):
        # We can reuse the YOLODetector but filter only vehicle classes
        self.yolo = YOLODetector(model_path=model_path, conf_thresh=conf_thresh)
        self.vehicle_classes = ["car", "truck", "bus", "motorcycle"]

    def load_model(self) -> None:
        self.yolo.load_model()

    def predict(self, frame: np.ndarray, camera_id: str = "cam-01") -> List[Detection]:
        detections = self.yolo.predict(frame, camera_id=camera_id)
        # Filter for vehicles only
        return [d for d in detections if d.class_name in self.vehicle_classes]
