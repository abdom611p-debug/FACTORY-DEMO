from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    DEFAULT_CAMERA_SOURCE: str = "0" # '0' usually means local webcam
    BACKEND_API_URL: str = "http://localhost:5000"
    
    CONFIDENCE_THRESHOLD: float = 0.5
    IOU_THRESHOLD: float = 0.45
    
    FACE_DB_PATH: str = "./data/faces"
    DB_PATH: str = "./data/db.json"
    
    class Config:
        env_file = ".env"
        env_file_encoding = 'utf-8'

settings = Settings()
