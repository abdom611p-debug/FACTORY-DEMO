import numpy as np
from pydantic import BaseModel, ConfigDict
from typing import Any

class Frame(BaseModel):
    # Enable arbitrary types for numpy array
    model_config = ConfigDict(arbitrary_types_allowed=True)
    
    frame_id: int
    image: np.ndarray
    timestamp: str
    camera_id: str
    
    # Store results from pipeline
    detections: list = []
    events: list = []
