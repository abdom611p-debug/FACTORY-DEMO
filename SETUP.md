# Factory AI Monitoring Platform - Phase 1 Setup

## Requirements
- Python 3.12+
- A webcam (for demo) or a video file.

## Setup Instructions

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Configuration**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   You can change `DEFAULT_CAMERA_SOURCE` in `.env` to point to a video file path (e.g. `./video.mp4`) instead of `0` if you don't have a webcam.

3. **Run the AI Engine**:
   ```bash
   python -m app.main
   ```
   Or using uvicorn directly:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

## Demo Instructions

1. **Verify API**: 
   Open `http://localhost:8000/docs` to see the Swagger UI.

2. **Register a Worker (Face Recognition)**:
   Use the `POST /ai/register-worker` endpoint in Swagger.
   Upload a clear image of a face, and set `worker_id` (e.g. `worker-001`).

3. **Create a Zone**:
   Use the `POST /zones` endpoint to create a polygon zone.
   ```json
   {
     "id": "zone-1",
     "name": "Restricted Area",
     "polygon": [[0,0], [640,0], [640, 480], [0, 480]],
     "restricted_worker_ids": ["worker-001"]
   }
   ```

4. **Live Feed**:
   Connect a WebSocket client to `ws://localhost:8000/ws/live`.
   The server will start processing the video source (webcam or file) and emit JSON containing `image` (base64 JPEG), `events`, and `detections`.

## Tests

Run the test suite with pytest:
```bash
pytest tests/
```

## Known Limitations

- **Performance**: The YOLO tracker and FaceNet models are running synchronously in the python asyncio event loop. For a true production system handling many concurrent streams, inference should be isolated in background worker processes or dedicated inference servers (like Triton).
- **PPE Model**: The demo uses a public HuggingFace YOLO PPE model which might have different class IDs than expected. A robust implementation would map those dynamically.
- **Model Downloads**: First run will take some time as it downloads `yolov8n.pt`, `facenet-pytorch` weights, etc.
