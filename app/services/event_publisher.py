import asyncio
import httpx
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

import json
from datetime import datetime

class EventPublisher:
    def __init__(self, backend_url: str):
        self.backend_url = backend_url
        self.client = httpx.AsyncClient(timeout=5.0)
        
        # A simple background task queue to not block the main AI loop
        self.queue: asyncio.Queue = asyncio.Queue()
        self.worker_task: asyncio.Task | None = None
        self.is_running = False

    def start(self):
        if not self.is_running:
            self.is_running = True
            self.worker_task = asyncio.create_task(self._process_queue())

    async def stop(self):
        self.is_running = False
        if self.worker_task:
            self.worker_task.cancel()
            try:
                await self.worker_task
            except asyncio.CancelledError:
                pass
        await self.client.aclose()

    async def publish_events(self, events: List[Any]):
        if not events:
            return
            
        if not self.is_running:
            self.start()
            
        for event in events:
            if hasattr(event, 'to_backend_dict'):
                payload = event.to_backend_dict()
            elif isinstance(event, dict):
                cam_id = event.get("camera_id") or event.get("cameraId")
                work_id = event.get("worker_id") or event.get("workerId")
                z_id = event.get("zone_id") or event.get("zoneId")
                
                payload = {
                    "eventType": event.get("event_type") or event.get("eventType") or "UNKNOWN_EVENT",
                    "timestamp": event.get("timestamp") or (datetime.utcnow().isoformat() + "Z"),
                    "confidence": event.get("confidence", 0.95),
                    "cameraId": str(cam_id) if cam_id and len(str(cam_id)) == 36 else None,
                    "workerId": str(work_id) if work_id and len(str(work_id)) == 36 else None,
                    "zoneId": str(z_id) if z_id and len(str(z_id)) == 36 else None,
                    "evidenceJson": json.dumps(event.get("evidence", {})) if isinstance(event.get("evidence"), dict) else str(event.get("evidenceJson", ""))
                }
            else:
                payload = event

            try:
                self.queue.put_nowait(payload)
            except asyncio.QueueFull:
                logger.warning("Event queue full, dropping event.")


    async def _process_queue(self):
        while self.is_running:
            try:
                event = await self.queue.get()
                await self._send_to_backend(event)
                self.queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in EventPublisher worker: {e}")
                
    async def _send_to_backend(self, event: Dict[str, Any]):
        if not self.backend_url:
            return
        await self._post_backend(event)

    async def _post_backend(self, event: Dict[str, Any]):
        if not self.backend_url:
            logger.warning("BACKEND_API_URL not configured. Skipping event publish.")
            return

        # Use the correct API endpoint
        url = f"{self.backend_url.rstrip('/')}/api/ai/events"
        
        try:
            # Send standard ISO format timestamp if not present
            if 'timestamp' not in event or not event['timestamp']:
                from datetime import datetime
                event['timestamp'] = datetime.utcnow().isoformat() + "Z"

            response = await self.client.post(url, json=event)
            response.raise_for_status()
            logger.debug(f"Successfully published event: {event.get('eventType')}")
        except httpx.ConnectError:
            logger.error(f"Failed to connect to backend at {url}")
        except httpx.TimeoutException:
            logger.error(f"Timeout while sending event to {url}")
        except httpx.HTTPStatusError as exc:
            logger.error(f"HTTP Error {exc.response.status_code} while sending event: {exc.response.text}")
        except Exception as e:
            logger.error(f"Unexpected error publishing event: {e}")


# AI event type (engine) → EGIC platform event type
EGIC_TYPES = {
    "NO_HELMET_DETECTED": "NO_HELMET", "NO_GLASSES_DETECTED": "NO_GLASSES", "NO_VEST_DETECTED": "NO_VEST",
    "UNAUTHORIZED_ZONE_ENTRY": "RESTRICTED_ZONE", "FIRE_DETECTED": "FIRE_DETECTED", "SMOKE_DETECTED": "SMOKE_DETECTED",
    "SMOKING_DETECTED": "SMOKING_DETECTED", "FALL_DETECTED": "FALL", "SOS_DETECTED": "SOS_GESTURE",
}


class EgicPublisher:
    """Mirrors engine events to the EGIC platform (/api/v1/events) so they appear on its live dashboard."""

    def __init__(self, platform_url: str):
        self.url = platform_url.rstrip("/") + "/api/v1/events" if platform_url else ""
        self.client = httpx.AsyncClient(timeout=5.0)

    async def publish_events(self, events: List[Dict[str, Any]]):
        if not self.url:
            return
        for e in events:
            etype = EGIC_TYPES.get(e.get("event_type"))
            if not etype:
                continue
            ev = e.get("evidence") or {}
            body = {"type": etype, "cameraId": e.get("camera_id"), "conf": e.get("confidence") or 0.9,
                    "source": "ai-engine", "sev": ev.get("severity"), "workerId": e.get("worker_id"),
                    "evidence": {"kind": "engine", "model": "EGIC AI Engine", **{k: v for k, v in ev.items() if k != "severity"}}}
            try:
                await self.client.post(self.url, json=body)
            except Exception as exc:
                logger.error(f"EGIC platform publish failed: {exc}")

    async def stop(self):
        await self.client.aclose()
