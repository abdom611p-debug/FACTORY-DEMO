from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
import uuid

class AIEvent(BaseModel):
    event_id: str
    event_type: str
    timestamp: str
    camera_id: str
    worker_id: Optional[str] = None
    track_id: Optional[int] = None
    zone_id: Optional[str] = None
    confidence: Optional[float] = None
    evidence: dict[str, Any] = {"frame_available": True}
    
    @classmethod
    def create(cls, event_type: str, camera_id: str, **kwargs):
        return cls(
            event_id=str(uuid.uuid4()),
            event_type=event_type,
            timestamp=datetime.utcnow().isoformat() + "Z",
            camera_id=camera_id,
            **kwargs
        )

    def to_backend_dict(self) -> dict[str, Any]:
        import json
        return {
            "eventType": self.event_type,
            "timestamp": self.timestamp,
            "confidence": self.confidence if self.confidence is not None else 0.95,
            "cameraId": self.camera_id if self.camera_id and len(self.camera_id) == 36 else None, # Guid check
            "workerId": self.worker_id if self.worker_id and len(self.worker_id) == 36 else None,
            "zoneId": self.zone_id if self.zone_id and len(self.zone_id) == 36 else None,
            "evidenceJson": json.dumps(self.evidence)
        }

