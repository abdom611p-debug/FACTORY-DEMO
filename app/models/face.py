import numpy as np
import cv2
import json
import os
from typing import List, Dict, Optional
from facenet_pytorch import MTCNN, InceptionResnetV1
import torch
from app.models.base import BaseFaceRecognizer

class FaceNetRecognizer(BaseFaceRecognizer):
    def __init__(self, db_path: str = "./data/faces.json", threshold: float = 0.7):
        self.db_path = db_path
        self.threshold = threshold
        self.device = torch.device('cuda:0' if torch.cuda.is_available() else 'cpu')
        self.mtcnn = None
        self.resnet = None
        self.embeddings_db: Dict[str, np.ndarray] = {}
        
    def load_model(self) -> None:
        print("Loading FaceNet models...")
        self.mtcnn = MTCNN(keep_all=False, device=self.device)
        self.resnet = InceptionResnetV1(pretrained='vggface2').eval().to(self.device)
        self._load_db()
        print("FaceNet models loaded.")

    def _load_db(self):
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, "r") as f:
                    data = json.load(f)
                    for k, v in data.items():
                        self.embeddings_db[k] = np.array(v)
            except Exception as e:
                print(f"Error loading face db: {e}")
        else:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            with open(self.db_path, "w") as f:
                json.dump({}, f)
                
    def _save_db(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        data = {k: v.tolist() for k, v in self.embeddings_db.items()}
        with open(self.db_path, "w") as f:
            json.dump(data, f)

    def generate_embedding(self, face_image: np.ndarray) -> Optional[List[float]]:
        if self.mtcnn is None or self.resnet is None:
            self.load_model()
            
        # Convert BGR (OpenCV) to RGB (facenet-pytorch expects PIL or RGB tensor)
        img_rgb = cv2.cvtColor(face_image, cv2.COLOR_BGR2RGB)
        
        # Detect and align face
        x_aligned = self.mtcnn(img_rgb)
        
        if x_aligned is not None:
            # Generate embedding
            x_aligned = x_aligned.unsqueeze(0).to(self.device)
            embeddings = self.resnet(x_aligned).detach().cpu().numpy()
            return embeddings[0].tolist()
        return None

    def register_face(self, worker_id: str, image: np.ndarray) -> bool:
        embedding = self.generate_embedding(image)
        if embedding is not None:
            self.embeddings_db[worker_id] = np.array(embedding)
            self._save_db()
            return True
        return False

    def identify_face(self, face_image: np.ndarray, threshold: float = None) -> Optional[str]:
        thresh = threshold if threshold is not None else self.threshold
        
        embedding = self.generate_embedding(face_image)
        if embedding is None or len(self.embeddings_db) == 0:
            return None
            
        query_emb = np.array(embedding)
        
        # Simple Euclidean distance comparison
        best_id = None
        min_dist = float('inf')
        
        for worker_id, db_emb in self.embeddings_db.items():
            dist = np.linalg.norm(query_emb - db_emb)
            if dist < min_dist:
                min_dist = dist
                best_id = worker_id
                
        if min_dist < thresh:
            return best_id
        return None
