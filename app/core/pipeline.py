import cv2
import asyncio
from datetime import datetime
from typing import AsyncGenerator
from app.core.frame import Frame
from app.services.inference_service import InferenceService

class VideoSource:
    def __init__(self, source: str):
        # Convert '0' to int 0 for webcam
        self.source = int(source) if source.isdigit() else source
        self.cap = None

    def start(self):
        self.cap = cv2.VideoCapture(self.source)
        if not self.cap.isOpened():
            raise RuntimeError(f"Failed to open video source: {self.source}")

    def read(self):
        if self.cap is None:
            return False, None
        return self.cap.read()

    def stop(self):
        if self.cap:
            self.cap.release()

class Pipeline:
    def __init__(self, source_path: str, inference: InferenceService = None):
        self.source = VideoSource(source_path)
        self.inference = inference or InferenceService()
        self.is_running = False
        
    def initialize(self):
        self.inference.initialize()
        self.source.start()
        
    def stop(self):
        self.is_running = False
        self.source.stop()

    async def run(self) -> AsyncGenerator[Frame, None]:
        self.is_running = True
        frame_id = 0
        camera_id = str(self.source.source)
        
        while self.is_running:
            ret, image = self.source.read()
            if not ret:
                break
                
            frame = Frame(
                frame_id=frame_id,
                image=image,
                timestamp=datetime.utcnow().isoformat() + "Z",
                camera_id=camera_id
            )
            
            # Process (off the event loop — inference is CPU bound)
            detections, events = await asyncio.to_thread(self.inference.process_frame, image, camera_id)
            frame.detections = detections
            frame.events = events
            
            yield frame
            frame_id += 1
            
            # Yield control back to event loop
            await asyncio.sleep(0.01)
