import numpy as np
from typing import List, Dict
from datetime import datetime
from ultralytics import YOLO
from app.models.base import BaseDetector
from app.schemas.detection import Detection, BoundingBox

class PPEDetector(BaseDetector):
    def __init__(self, model_path: str = "keremberke/yolov8m-protective-equipment-detection", conf_thresh: float = 0.5):
        # We can use ultralytics directly if it's a YOLOv8 format model on local disk or downloaded from hub
        # For demo purposes, we will assume a generic YOLO model is provided or downloaded.
        self.model_path = model_path
        self.conf_thresh = conf_thresh
        self.model = None

    def load_model(self) -> None:
        try:
            self.model = YOLO(self.model_path)
            print(f"PPE model loaded from {self.model_path}")
        except Exception as e:
            print(f"Failed to load PPE model {self.model_path}: {e}")
            print("Fallback to yolov8n.pt for DEMO purposes (Will just detect objects, not PPE)")
            self.model = YOLO("yolov8n.pt")

    def predict(self, frame: np.ndarray, camera_id: str = "cam-01") -> List[Detection]:
        if self.model is None:
            self.load_model()
            
        results = self.model(frame, conf=self.conf_thresh, verbose=False)
        detections = []
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        for result in results:
            boxes = result.boxes
            if boxes is None or len(boxes) == 0:
                continue
                
            for i in range(len(boxes)):
                box = boxes[i]
                class_id = int(box.cls[0].item())
                confidence = float(box.conf[0].item())
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                class_name = self.model.names[class_id]
                
                det = Detection(
                    class_name=class_name,
                    class_id=class_id,
                    confidence=confidence,
                    bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
                    track_id=None, # PPE usually doesn't need to track itself, it attaches to the person track
                    timestamp=timestamp,
                    camera_id=camera_id
                )
                detections.append(det)
                
        return detections
