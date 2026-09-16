from app.schemas.zones import Zone
from app.schemas.detection import Detection
from app.zones.point_in_polygon import is_point_in_polygon
from typing import Dict, List, Optional

class ZoneManager:
    def __init__(self):
        self.zones: Dict[str, Zone] = {}
        # Track which zone a track_id is currently in: track_id -> zone_id
        self.track_zone_state: Dict[int, str] = {}

    def add_zone(self, zone: Zone):
        self.zones[zone.id] = zone
        
    def remove_zone(self, zone_id: str):
        if zone_id in self.zones:
            del self.zones[zone_id]
            
    def get_zones(self) -> List[Zone]:
        return list(self.zones.values())

    def process_detection(self, detection: Detection) -> List[dict]:
        """
        Process a single detection, check zone intersections, and yield events.
        """
        events = []
        if detection.track_id is None:
            return events

        current_zone_id = None
        point = detection.bbox.bottom_center

        # Find which zone the detection is in
        for zone in self.zones.values():
            if is_point_in_polygon(point, zone.polygon):
                current_zone_id = zone.id
                break
                
        previous_zone_id = self.track_zone_state.get(detection.track_id)
        
        # State change: Entered a new zone
        if current_zone_id and current_zone_id != previous_zone_id:
            events.append({
                "type": "PERSON_ENTERED_ZONE",
                "zone_id": current_zone_id,
                "track_id": detection.track_id,
                "worker_id": detection.face_id
            })
            
            # Check for unauthorized entry
            zone = self.zones[current_zone_id]
            worker_id = detection.face_id
            
            if zone.restricted_worker_ids and worker_id in zone.restricted_worker_ids:
                events.append({
                    "type": "UNAUTHORIZED_ZONE_ENTRY",
                    "zone_id": current_zone_id,
                    "track_id": detection.track_id,
                    "worker_id": worker_id
                })
            elif zone.allowed_worker_ids and worker_id not in zone.allowed_worker_ids and worker_id is not None:
                events.append({
                    "type": "UNAUTHORIZED_ZONE_ENTRY",
                    "zone_id": current_zone_id,
                    "track_id": detection.track_id,
                    "worker_id": worker_id
                })

        # State change: Exited a zone
        if previous_zone_id and current_zone_id != previous_zone_id:
            events.append({
                "type": "PERSON_EXITED_ZONE",
                "zone_id": previous_zone_id,
                "track_id": detection.track_id,
                "worker_id": detection.face_id
            })

        # Update state
        if current_zone_id:
            self.track_zone_state[detection.track_id] = current_zone_id
        elif previous_zone_id:
            del self.track_zone_state[detection.track_id]
            
        return events
