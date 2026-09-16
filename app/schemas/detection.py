from pydantic import BaseModel, Field
from typing import Optional

class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def center(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2, (self.y1 + self.y2) / 2)

    @property
    def bottom_center(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2, self.y2)

class Detection(BaseModel):
    class_name: str
    class_id: int
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: BoundingBox
    track_id: Optional[int] = None
    timestamp: str
    camera_id: str
    
    # Contextual data
    face_id: Optional[str] = None
    ppe_status: Optional[dict[str, bool]] = None
