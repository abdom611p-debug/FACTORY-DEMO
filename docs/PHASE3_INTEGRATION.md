# Phase 3 Integration Architecture Document

## Executive Summary

Phase 3 completes the end-to-end integration of the **Factory AI Monitoring Platform**, bridging hardware frame acquisition (smartphone camera), real-time computer vision inference (Python AI Engine), enterprise domain event processing (ASP.NET Core Backend), and real-time dashboard visualization (React SignalR Dashboard).

---

## 🔄 End-to-End Dataflow Diagram

```
[ Smartphone Camera ]
        │ (getUserMedia)
        ▼
[ React Mobile App /mobile-camera ]
        │ (JPEG Base64 WebSocket: /ws/video-stream)
        ▼
[ Python AI Engine (FastAPI + OpenCV + YOLOv8) ]
        │ 1. Frame Decoding & Inference
        │ 2. Tracking, PPE, Zone & Face Evaluation
        │ 3. Event Creation
        │ (httpx Async POST: /api/ai/events)
        ▼
[ ASP.NET Core 9 Backend Web API ]
        │ 1. AIEventsController receives payload
        │ 2. IEventProcessor stores event & evaluates rules
        │ 3. Violation created in PostgreSQL (if rule matched)
        │ 4. LiveEventHub broadcasts "AI_EVENT_RECEIVED"
        │ (SignalR WebSockets)
        ▼
[ React Command Center Dashboard ]
        │ 1. useSignalR hook receives event
        │ 2. Zustand eventStore updates global feed
        │ 3. Dashboard KPIs & toast notifications trigger
```

---

## 📡 API Contracts & Integration Boundaries

### 1. Mobile Camera → AI Engine WebSocket
- **URL**: `ws://<AI_HOST>:8000/ws/video-stream`
- **Request Format**:
  ```json
  {
    "image": "data:image/jpeg;base64,...",
    "cameraId": "mobile-camera-01"
  }
  ```
- **Response Format**:
  ```json
  {
    "detections": [
      {
        "bbox": [100, 150, 300, 450],
        "class_name": "person",
        "confidence": 0.92,
        "track_id": 1,
        "person_id": "W-101",
        "ppe_status": {"helmet": true, "vest": false}
      }
    ],
    "events": [...]
  }
  ```

### 2. AI Engine → ASP.NET Backend Async Event Dispatch
- **Endpoint**: `POST http://<BACKEND_HOST>:5000/api/ai/events`
- **Payload Schema**:
  ```json
  {
    "eventType": "NO_HELMET_DETECTED",
    "timestamp": "2026-09-16T04:45:00Z",
    "confidence": 0.92,
    "cameraId": null,
    "workerId": null,
    "zoneId": null,
    "evidenceJson": "{\"frame_available\": true, \"bbox\": [100, 150, 300, 450]}"
  }
  ```

### 3. ASP.NET Backend → React Frontend SignalR Hub
- **Hub Endpoint**: `ws://<BACKEND_HOST>:5000/hubs/live-events`
- **SignalR Method**: `AI_EVENT_RECEIVED`
- **Payload**: Full `AIEvent` JSON entity broadcasted to all connected dashboard clients.

---

## 🔐 Security & Mobile Access

1. **Camera API Constraints**: Modern mobile engines (iOS WebKit / Android Chromium) require `HTTPS` for `navigator.mediaDevices.getUserMedia()`.
2. **Cloudflare Tunnel Setup**: For physical testing without local SSL certificates:
   - Command: `cloudflared tunnel --url http://localhost:5173`
   - Secure public HTTPS URL generated automatically for mobile testing.
3. **CORS Policy**: Configured in FastAPI (`app/main.py`) and ASP.NET Core (`Program.cs`) allowing `*` origins for dev/demo setups.

---

## 🧪 Verification & Acceptance Criteria

- [x] **Zero Mock Data**: All events displayed on dashboard originate from active frame processing.
- [x] **Async Non-Blocking AI Queue**: Frame inference loop does not block when HTTP calls to backend take time.
- [x] **SignalR Auto-Reconnect**: Frontend automatically reconnects to SignalR hub if backend restarts.
- [x] **Responsive Canvas Scaling**: Bounding boxes scale dynamically regardless of phone screen aspect ratio.
