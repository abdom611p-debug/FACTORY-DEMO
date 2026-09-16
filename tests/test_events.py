import pytest
from app.schemas.zones import Zone
from app.schemas.detection import Detection, BoundingBox
from app.zones.zone_manager import ZoneManager
from datetime import datetime

def test_zone_manager_events():
    manager = ZoneManager()
    
    zone = Zone(
        id="zone-1",
        name="Restricted Area",
        polygon=[[0, 0], [100, 0], [100, 100], [0, 100]],
        restricted_worker_ids=["worker-2"]
    )
    manager.add_zone(zone)
    
    # Person outside zone
    det1 = Detection(
        class_name="person",
        class_id=0,
        confidence=0.9,
        bbox=BoundingBox(x1=200, y1=200, x2=250, y2=250), # bottom_center: (225, 250) -> outside
        track_id=1,
        timestamp=datetime.utcnow().isoformat(),
        camera_id="cam-1",
        face_id="worker-1"
    )
    
    events = manager.process_detection(det1)
    assert len(events) == 0
    
    # Person enters zone
    det2 = Detection(
        class_name="person",
        class_id=0,
        confidence=0.9,
        bbox=BoundingBox(x1=10, y1=10, x2=50, y2=50), # bottom_center: (30, 50) -> inside
        track_id=1,
        timestamp=datetime.utcnow().isoformat(),
        camera_id="cam-1",
        face_id="worker-1"
    )
    
    events = manager.process_detection(det2)
    assert len(events) == 1
    assert events[0]["type"] == "PERSON_ENTERED_ZONE"
    
    # Unauthorized worker enters zone
    det3 = Detection(
        class_name="person",
        class_id=0,
        confidence=0.9,
        bbox=BoundingBox(x1=10, y1=10, x2=50, y2=50),
        track_id=2,
        timestamp=datetime.utcnow().isoformat(),
        camera_id="cam-1",
        face_id="worker-2"  # Restricted!
    )
    
    events = manager.process_detection(det3)
    assert len(events) == 2
    assert events[0]["type"] == "PERSON_ENTERED_ZONE"
    assert events[1]["type"] == "UNAUTHORIZED_ZONE_ENTRY"
    assert events[1]["worker_id"] == "worker-2"
