from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    DEFAULT_CAMERA_SOURCE: str = "0"  # '0' usually means local webcam
    # Open DEFAULT_CAMERA_SOURCE on startup. Off by default so the engine boots on servers without a camera (Railway).
    ENABLE_LOCAL_CAMERA: bool = False
    BACKEND_API_URL: str = ""  # ASP.NET backend (optional)
    EGIC_PLATFORM_URL: str = ""  # EGIC platform server — AI events are mirrored to its /api/v1/events (optional)

    CONFIDENCE_THRESHOLD: float = 0.5
    IOU_THRESHOLD: float = 0.45

    FIRE_CONFIDENCE: float = 0.3
    FIRE_ALARM_COOLDOWN_SEC: float = 60
    PPE_ALARM_COOLDOWN_SEC: float = 30
    PRELOAD_MODELS: bool = True
    # Comma-separated origins allowed by CORS ("*" for the demo)
    CORS_ORIGINS: str = "*"

    FACE_DB_PATH: str = "./data/faces.json"
    DB_PATH: str = "./data/db.json"


settings = Settings()
