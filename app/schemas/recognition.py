from pydantic import BaseModel
from typing import List

class FaceEmbedding(BaseModel):
    worker_id: str
    embedding: List[float]
    
class RecognitionResult(BaseModel):
    worker_id: str
    confidence: float
    bbox: Optional[list[float]] = None
