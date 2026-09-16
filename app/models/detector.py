import numpy as np
from typing import List
from datetime import datetime
from ultralytics import YOLO
from app.models.base import BaseDetector
from app.schemas.detection import Detection, BoundingBox

class YOLODetector(BaseDetector):
    def __init__(self, model_path: str = "yolov8n.pt", conf_thresh: float = 0.5):
        self.model_path = model_path
        self.conf_thresh = conf_thresh
        self.model = None

    def load_model(self) -> None:
        print(f"Loading YOLO model from {self.model_path}...")
        self.model = YOLO(self.model_path)
        print("YOLO model loaded.")

    def predict(self, frame: np.ndarray, camera_id: str = "cam-01") -> List[Detection]:
        if self.model is None:
            self.load_model()
            
        # Run inference with tracking
        results = self.model.track(frame, persist=True, conf=self.conf_thresh, verbose=False)
        
        detections = []
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        for result in results:
            boxes = result.boxes
            if boxes is None or len(boxes) == 0:
                continue
                
            for i in range(len(boxes)):
                box = boxes[i]
                
                # Filter out classes we don't care about if needed.
                # In COCO: 0=person, 2=car, 3=motorcycle, 5=bus, 7=truck
                class_id = int(box.cls[0].item())
                confidence = float(box.conf[0].item())
                
                # xyxy format
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                
                track_id = None
                if box.id is not None:
                    track_id = int(box.id[0].item())
                    
                class_name = self.model.names[class_id]
                
                det = Detection(
                    class_name=class_name,
                    class_id=class_id,
                    confidence=confidence,
                    bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
                    track_id=track_id,
                    timestamp=timestamp,
                    camera_id=camera_id
                )
                detections.append(det)
                
        return detections
