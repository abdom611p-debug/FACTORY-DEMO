import asyncio
import cv2
import base64
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import numpy as np

from app.config import settings
from app.core.pipeline import Pipeline
from app.schemas.zones import Zone
from app.services.event_publisher import EventPublisher

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Factory AI Monitoring Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global pipeline instance
pipeline_instance = None
pipeline_task = None
event_publisher = None

class WorkerRegistration(BaseModel):
    worker_id: str

@app.on_event("startup")
async def startup_event():
    global pipeline_instance, pipeline_task, event_publisher
    
    event_publisher = EventPublisher(settings.BACKEND_API_URL)
    event_publisher.start()
    
    pipeline_instance = Pipeline(settings.DEFAULT_CAMERA_SOURCE)
    pipeline_instance.initialize()

@app.on_event("shutdown")
async def shutdown_event():
    global pipeline_instance, event_publisher
    if pipeline_instance:
        pipeline_instance.stop()
    if event_publisher:
        await event_publisher.stop()

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/models")
def get_models():
    return {
        "detector": pipeline_instance.inference.detector.model_path,
        "ppe": pipeline_instance.inference.ppe_detector.model_path
    }

@app.get("/config")
def get_config():
    return settings.model_dump()

@app.post("/zones")
def create_zone(zone: Zone):
    pipeline_instance.inference.zone_manager.add_zone(zone)
    return {"status": "zone added", "zone": zone}

@app.get("/zones")
def get_zones():
    return pipeline_instance.inference.zone_manager.get_zones()

@app.delete("/zones/{zone_id}")
def delete_zone(zone_id: str):
    pipeline_instance.inference.zone_manager.remove_zone(zone_id)
    return {"status": "zone removed"}

@app.post("/ai/register-worker")
async def register_worker(worker_id: str, file: UploadFile = File(...)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    success = pipeline_instance.inference.face_recognizer.register_face(worker_id, img)
    if success:
        return {"status": "success", "worker_id": worker_id}
    raise HTTPException(status_code=400, detail="Could not detect face in image")

@app.post("/ai/test-image")
async def test_image(file: UploadFile = File(...)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    detections, events = pipeline_instance.inference.process_frame(img, camera_id="test")
    
    return {
        "detections": [d.model_dump() for d in detections],
        "events": events
    }

@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # We will process frames and send them here.
    # In a real app, the pipeline runs independently and broadcasts to a channel.
    # For this demo, we'll run a local loop if one isn't running.
    
    try:
        async for frame in pipeline_instance.run():
            # Annotate the image
            annotated_img = frame.image.copy()
            for det in frame.detections:
                x1, y1, x2, y2 = map(int, [det.bbox.x1, det.bbox.y1, det.bbox.x2, det.bbox.y2])
                cv2.rectangle(annotated_img, (x1, y1), (x2, y2), (0, 255, 0), 2)
                label = f"{det.class_name} {det.confidence:.2f}"
                if det.face_id:
                    label += f" [{det.face_id}]"
                elif det.track_id is not None:
                    label += f" #{det.track_id}"
                cv2.putText(annotated_img, label, (x1, max(y1-10, 0)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                
            # Draw zones
            for zone in pipeline_instance.inference.zone_manager.get_zones():
                pts = np.array(zone.polygon, np.int32)
                pts = pts.reshape((-1, 1, 2))
                cv2.polylines(annotated_img, [pts], True, (0, 0, 255), 2)
                cv2.putText(annotated_img, zone.name, tuple(pts[0][0]), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

            # Encode as JPEG
            _, buffer = cv2.imencode('.jpg', annotated_img)
            b64_str = base64.b64encode(buffer).decode('utf-8')
            
            payload = {
                "frame_id": frame.frame_id,
                "timestamp": frame.timestamp,
                "image": b64_str,
                "events": frame.events,
                "detections": [d.model_dump() for d in frame.detections]
            }
            
            await websocket.send_json(payload)
            
    except WebSocketDisconnect:
        pipeline_instance.stop()
        print("WebSocket disconnected")
    except Exception as e:
        pipeline_instance.stop()
        print(f"Error in websocket loop: {e}")

@app.websocket("/ws/video-stream")
async def video_stream_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # This endpoint receives base64 encoded JPEGs from the mobile camera
    try:
        while True:
            data = await websocket.receive_json()
            if "image" not in data:
                continue
                
            # Decode base64
            img_data = base64.b64decode(data["image"].split(",")[1] if "," in data["image"] else data["image"])
            nparr = np.frombuffer(img_data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is not None:
                # Process the frame
                camera_id = data.get("cameraId", "mobile-camera")
                detections, events = pipeline_instance.inference.process_frame(img, camera_id=camera_id)
                
                # Publish events asynchronously to the ASP.NET backend
                if events:
                    await event_publisher.publish_events(events)
                
                # Return annotations to the client so it can draw bounding boxes
                await websocket.send_json({
                    "detections": [d.model_dump() for d in detections],
                    "events": events
                })
                
    except WebSocketDisconnect:
        print("Mobile streaming WebSocket disconnected")
    except Exception as e:
        print(f"Error in mobile streaming websocket loop: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
