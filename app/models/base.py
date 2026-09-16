from abc import ABC, abstractmethod
import numpy as np
from typing import List, Dict, Any
from app.schemas.detection import Detection

class BaseDetector(ABC):
    @abstractmethod
    def load_model(self) -> None:
        pass
        
    @abstractmethod
    def predict(self, frame: np.ndarray) -> List[Detection]:
        pass

class BaseFaceRecognizer(ABC):
    @abstractmethod
    def load_model(self) -> None:
        pass
        
    @abstractmethod
    def register_face(self, worker_id: str, image: np.ndarray) -> bool:
        pass

    @abstractmethod
    def generate_embedding(self, face_image: np.ndarray) -> List[float]:
        pass
        
    @abstractmethod
    def identify_face(self, face_image: np.ndarray, threshold: float = 0.6) -> str:
        """Returns worker_id or None"""
        pass
