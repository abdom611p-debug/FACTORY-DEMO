from typing import Dict, List
from datetime import datetime
from app.schemas.detection import Detection
from app.schemas.tracking import Track

class Tracker:
    """
    Manages the lifecycle of tracks.
    While YOLO provides the track ID, this class persists state (like worker_id)
    across frames so we don't have to run face recognition every frame.
    """
    def __init__(self, max_age: int = 30):
        self.tracks: Dict[int, Track] = {}
        self.max_age = max_age
        # We need a way to age-out tracks if they aren't seen, 
        # but YOLO handles track ID persistence. We just store metadata.
        
    def update(self, detections: List[Detection]) -> None:
        current_time = datetime.utcnow().isoformat() + "Z"
        current_track_ids = set()
        
        for det in detections:
            if det.track_id is None:
                continue
                
            current_track_ids.add(det.track_id)
            
            if det.track_id not in self.tracks:
                # New track
                self.tracks[det.track_id] = Track(
                    track_id=det.track_id,
                    bbox=det.bbox,
                    confidence=det.confidence,
                    first_seen=det.timestamp,
                    last_seen=det.timestamp,
                    class_name=det.class_name
                )
            else:
                # Update existing
                track = self.tracks[det.track_id]
                track.bbox = det.bbox
                track.confidence = det.confidence
                track.last_seen = det.timestamp
                
            # If the detection has a face_id (because face recognition just ran),
            # persist it to the track.
            if det.face_id is not None:
                self.tracks[det.track_id].worker_id = det.face_id
                
            # Copy persisted worker_id back to detection so downstream (zones) can use it
            if self.tracks[det.track_id].worker_id is not None:
                det.face_id = self.tracks[det.track_id].worker_id

        # Clean up old tracks could be done here based on timestamp differences,
        # but for simplicity, we just keep them if YOLO keeps them or clean periodically.
        # Simple cleanup: remove tracks not seen in current frame
        # (Since ByteTrack handles occlusion internally, if YOLO drops the track ID, we drop it too)
        
        # A more robust implementation would check datetime difference.
        lost_tracks = set(self.tracks.keys()) - current_track_ids
        for track_id in lost_tracks:
            # Here we might want to delay deletion, but for now we just delete
            del self.tracks[track_id]
            
    def get_track(self, track_id: int) -> Track:
        return self.tracks.get(track_id)
