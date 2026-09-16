import pytest
from app.schemas.detection import BoundingBox
from app.zones.point_in_polygon import is_point_in_polygon

def test_bounding_box_center():
    bbox = BoundingBox(x1=100, y1=100, x2=300, y2=500)
    assert bbox.center == (200.0, 300.0)
    assert bbox.bottom_center == (200.0, 500.0)

def test_point_in_polygon():
    poly = [[0, 0], [10, 0], [10, 10], [0, 10]]
    
    # Inside
    assert is_point_in_polygon((5, 5), poly) == True
    
    # Edge
    assert is_point_in_polygon((0, 5), poly) == True
    
    # Outside
    assert is_point_in_polygon((15, 15), poly) == False
    assert is_point_in_polygon((-1, 5), poly) == False
