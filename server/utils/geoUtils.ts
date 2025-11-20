// Utility functions for geographic calculations

/**
 * Check if a point is inside a polygon using the ray-casting algorithm
 * @param point - [lat, lng] coordinates of the point
 * @param polygon - GeoJSON polygon object with coordinates
 * @returns true if point is inside polygon, false otherwise
 */
export function isPointInPolygon(
  point: { lat: number; lng: number },
  polygon: any
): boolean {
  if (!polygon || !point) return false;

  try {
    // Extract coordinates from GeoJSON format
    let coords: number[][];
    
    if (polygon.type === 'Polygon' && polygon.coordinates && polygon.coordinates[0]) {
      // GeoJSON format: { type: "Polygon", coordinates: [[[lng, lat], ...]] }
      // Convert from [lng, lat] to [lat, lng] for processing
      coords = polygon.coordinates[0].map((coord: number[]) => [coord[1], coord[0]]);
    } else if (Array.isArray(polygon) && polygon.length > 0) {
      // Direct array format [[lat, lng], ...]
      coords = polygon;
    } else {
      return false;
    }

    // Ray-casting algorithm
    let inside = false;
    const x = point.lat;
    const y = point.lng;

    for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
      const xi = coords[i][0];
      const yi = coords[i][1];
      const xj = coords[j][0];
      const yj = coords[j][1];

      const intersect =
        yi > y !== yj > y &&
        x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }

    return inside;
  } catch (error) {
    console.error('Error checking point in polygon:', error);
    return false;
  }
}
