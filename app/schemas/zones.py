from pydantic import BaseModel
from typing import List, Optional

class Zone(BaseModel):
    id: str
    name: str
    polygon: List[List[float]]  # List of [x, y] coordinates
    allowed_worker_ids: Optional[List[str]] = []
    restricted_worker_ids: Optional[List[str]] = []
    zone_type: str = "monitoring" # e.g. monitoring, restricted
