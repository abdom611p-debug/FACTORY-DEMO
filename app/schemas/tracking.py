from pydantic import BaseModel
from typing import Optional
from .detection import BoundingBox

class Track(BaseModel):
    track_id: int
    bbox: BoundingBox
    confidence: float
    first_seen: str
    last_seen: str
    class_name: str = "person"
    worker_id: Optional[str] = None
    zone_id: Optional[str] = None
