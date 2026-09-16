from shapely.geometry import Point, Polygon
from app.schemas.zones import Zone

def is_point_in_polygon(point: tuple[float, float], polygon_coords: list[list[float]]) -> bool:
    """
    Checks if a given (x,y) point is inside a polygon.
    Uses shapely library for robust point-in-polygon check.
    """
    p = Point(point[0], point[1])
    poly = Polygon(polygon_coords)
    return poly.contains(p) or poly.touches(p)
