import asyncio
import base64

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.core.pipeline import Pipeline
from app.schemas.zones import Zone
from app.services.event_publisher import EgicPublisher, EventPublisher
from app.services.inference_service import InferenceService

app = FastAPI(title="EGIC · Factory AI Engine",
              description="PPE (SH17) · Fire & smoke (D-Fire) · Smoking · Pose behaviour (YOLO26) · Egyptian ANPR · Face ID · Zones")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=settings.CORS_ORIGINS.strip() != "*",
    allow_methods=["*"],
    allow_headers=["*"],
)

# One shared inference service (models load once); the local-camera pipeline is optional.
inference = InferenceService()
pipeline_instance: Pipeline | None = None
event_publisher: EventPublisher | None = None
egic_publisher: EgicPublisher | None = None


class WorkerRegistration(BaseModel):
    worker_id: str


@app.on_event("startup")
async def startup_event():
    global pipeline_instance, event_publisher, egic_publisher
    event_publisher = EventPublisher(settings.BACKEND_API_URL)
    event_publisher.start()
    egic_publisher = EgicPublisher(settings.EGIC_PLATFORM_URL)
    if settings.PRELOAD_MODELS:
        # load in the background so /health answers immediately (Railway health checks)
        asyncio.get_running_loop().run_in_executor(None, inference.initialize, ["fire", "smoking", "ppe", "pose", "anpr", "detector"])
    if settings.ENABLE_LOCAL_CAMERA:
        pipeline_instance = Pipeline(settings.DEFAULT_CAMERA_SOURCE, inference)
        pipeline_instance.initialize()


@app.on_event("shutdown")
async def shutdown_event():
    if pipeline_instance:
        pipeline_instance.stop()
    if event_publisher:
        await event_publisher.stop()
    if egic_publisher:
        await egic_publisher.stop()


async def publish(events):
    if not events:
        return
    await event_publisher.publish_events(events)
    await egic_publisher.publish_events(events)


async def read_image(request: Request) -> np.ndarray:
    """Accepts a raw image body (image/jpeg, image/png …) or multipart/form-data with a `file` field."""
    if request.headers.get("content-type", "").startswith("multipart/"):
        form = await request.form()
        f = form.get("file")
        data = await f.read() if f is not None else b""
    else:
        data = await request.body()
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR) if data else None
    if img is None:
        raise HTTPException(status_code=400, detail="Send a JPEG/PNG image as the request body or as multipart field 'file'")
    return img


@app.get("/health")
def health_check():
    return {"status": "ok", "engine": "ONLINE", "models": inference.status()}


@app.get("/models")
def get_models():
    return {
        "loaded": inference.status(),
        "ppe": {"weights": inference.ppe_detector.model_path, "model": "YOLOv8s · SH17 (17 classes)"},
        "fire": {"weights": inference.fire_detector.model_path, "model": "YOLOv8n · D-Fire (smoke, fire)"},
        "pose": {"weights": inference.pose.model_path, "model": "YOLO26n-pose · 17 keypoints"},
        "anpr": {"weights": [inference.anpr.plate_path, *inference.anpr.ocr_paths], "model": "YOLO11n plate + OCR ensemble (Egyptian)"},
        "smoking": {"weights": list(inference.smoking.model_paths), "model": "Ensemble YOLOv8 + YOLO11m · cigarette / vape"},
        "detector": {"weights": inference.detector.model_path, "model": "YOLOv8n · COCO + tracking"},
        "face": {"model": "MTCNN + InceptionResnetV1 (FaceNet)"},
    }


# ---------------- single-image AI endpoints (used by the EGIC web platform) ----------------
@app.post("/ppe/detect")
async def ppe_detect(request: Request):
    img = await read_image(request)
    return await run_in_threadpool(inference.detect_ppe, img)


@app.post("/fire/detect")
async def fire_detect(request: Request, camera_id: str | None = None, conf: float | None = None):
    """With `camera_id` the engine applies temporal confirmation and returns `alarms` when fire/smoke is confirmed."""
    img = await read_image(request)
    res = await run_in_threadpool(inference.detect_fire, img, camera_id, conf)
    if res["alarms"]:
        from app.schemas.events import AIEvent
        await publish([AIEvent.create(event_type=a["type"], camera_id=camera_id, confidence=a["confidence"],
                                      evidence={"severity": a["severity"], "box": a["box"]}).model_dump() for a in res["alarms"]])
    return res


@app.post("/smoking/detect")
async def smoking_detect(request: Request, camera_id: str | None = None):
    img = await read_image(request)
    res = await run_in_threadpool(inference.detect_smoking, img, camera_id)
    if res["alarms"]:
        from app.schemas.events import AIEvent
        await publish([AIEvent.create(event_type=a["type"], camera_id=camera_id, confidence=a["confidence"],
                                      evidence={"severity": a["severity"], "box": a["box"]}).model_dump() for a in res["alarms"]])
    return res


@app.post("/pose/detect")
async def pose_detect(request: Request):
    img = await read_image(request)
    return await run_in_threadpool(inference.detect_pose, img)


@app.post("/anpr/read")
async def anpr_read(request: Request):
    img = await read_image(request)
    return await run_in_threadpool(inference.read_plates, img)


@app.post("/ai/analyze")
async def analyze(request: Request, tasks: str = "ppe,fire,pose", camera_id: str | None = None):
    img = await read_image(request)
    wanted = {t.strip() for t in tasks.split(",")}
    out = {}
    if "fire" in wanted:
        out["fire"] = await run_in_threadpool(inference.detect_fire, img, camera_id)
    if "smoking" in wanted:
        out["smoking"] = await run_in_threadpool(inference.detect_smoking, img, camera_id)
    if "ppe" in wanted:
        out["ppe"] = await run_in_threadpool(inference.detect_ppe, img)
    if "pose" in wanted:
        out["pose"] = await run_in_threadpool(inference.detect_pose, img)
    if "anpr" in wanted:
        out["anpr"] = await run_in_threadpool(inference.read_plates, img)
    return out


# ---------------- zones & workers ----------------
@app.post("/zones")
def create_zone(zone: Zone):
    inference.zone_manager.add_zone(zone)
    return {"status": "zone added", "zone": zone}


@app.get("/zones")
def get_zones():
    return inference.zone_manager.get_zones()


@app.delete("/zones/{zone_id}")
def delete_zone(zone_id: str):
    inference.zone_manager.remove_zone(zone_id)
    return {"status": "zone removed"}


@app.post("/ai/register-worker")
async def register_worker(worker_id: str, file: UploadFile = File(...)):
    img = cv2.imdecode(np.frombuffer(await file.read(), np.uint8), cv2.IMREAD_COLOR)
    inference._g["face"].ensure()
    if await run_in_threadpool(inference.face_recognizer.register_face, worker_id, img):
        return {"status": "success", "worker_id": worker_id}
    raise HTTPException(status_code=400, detail="Could not detect face in image")


@app.post("/ai/test-image")
async def test_image(file: UploadFile = File(...)):
    img = cv2.imdecode(np.frombuffer(await file.read(), np.uint8), cv2.IMREAD_COLOR)
    detections, events = await run_in_threadpool(inference.process_frame, img, "test")
    return {"detections": [d.model_dump() for d in detections], "events": events}


# ---------------- streaming ----------------
@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    if pipeline_instance is None:
        await websocket.send_json({"error": "local camera disabled — set ENABLE_LOCAL_CAMERA=true"})
        await websocket.close()
        return
    try:
        async for frame in pipeline_instance.run():
            annotated = frame.image.copy()
            for det in frame.detections:
                x1, y1, x2, y2 = map(int, [det.bbox.x1, det.bbox.y1, det.bbox.x2, det.bbox.y2])
                cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
                label = f"{det.class_name} {det.confidence:.2f}"
                if det.face_id:
                    label += f" [{det.face_id}]"
                elif det.track_id is not None:
                    label += f" #{det.track_id}"
                cv2.putText(annotated, label, (x1, max(y1 - 10, 0)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
            for zone in inference.zone_manager.get_zones():
                pts = np.array(zone.polygon, np.int32).reshape((-1, 1, 2))
                cv2.polylines(annotated, [pts], True, (0, 0, 255), 2)
                cv2.putText(annotated, zone.name, tuple(pts[0][0]), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
            _, buffer = cv2.imencode(".jpg", annotated)
            await publish(frame.events)
            await websocket.send_json({
                "frame_id": frame.frame_id,
                "timestamp": frame.timestamp,
                "image": base64.b64encode(buffer).decode("utf-8"),
                "events": frame.events,
                "detections": [d.model_dump() for d in frame.detections],
            })
    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"Error in websocket loop: {e}")


@app.websocket("/ws/video-stream")
async def video_stream_endpoint(websocket: WebSocket):
    """Receives base64 JPEG frames (mobile camera / RTSP bridge) and returns detections + events."""
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            if "image" not in data:
                continue
            raw = data["image"].split(",")[1] if "," in data["image"] else data["image"]
            img = cv2.imdecode(np.frombuffer(base64.b64decode(raw), np.uint8), cv2.IMREAD_COLOR)
            if img is None:
                continue
            detections, events = await run_in_threadpool(inference.process_frame, img, data.get("cameraId", "mobile-camera"))
            await publish(events)
            await websocket.send_json({"detections": [d.model_dump() for d in detections], "events": events})
    except WebSocketDisconnect:
        print("Mobile streaming WebSocket disconnected")
    except Exception as e:
        print(f"Error in mobile streaming websocket loop: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
