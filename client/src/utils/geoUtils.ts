// Utility functions for geographic calculations (client-side)

/**
 * Calculate bounds that include a polygon and a point
 * @param polygon - GeoJSON polygon object with coordinates
 * @param point - Additional point { lat, lng } to include in bounds
 * @returns Bounds as [[minLat, minLng], [maxLat, maxLng]] or null if invalid
 */
export function getBoundsForPolygonAndPoint(
  polygon: any,
  point: { lat: number; lng: number }
): [[number, number], [number, number]] | null {
  if (!polygon || !point) return null;

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
      return null;
    }

    if (coords.length === 0) return null;

    // Get all latitudes and longitudes (polygon + user point)
    const allLats = [...coords.map(c => c[0]), point.lat];
    const allLngs = [...coords.map(c => c[1]), point.lng];
    
    const minLat = Math.min(...allLats);
    const maxLat = Math.max(...allLats);
    const minLng = Math.min(...allLngs);
    const maxLng = Math.max(...allLngs);
    
    return [
      [minLat, minLng], // Southwest corner
      [maxLat, maxLng], // Northeast corner
    ];
  } catch (error) {
    console.error('Error calculating bounds:', error);
    return null;
  }
}

/**
 * Calculate the centroid (center point) of a polygon
 * @param polygon - GeoJSON polygon object with coordinates
 * @returns centroid as { lat: number; lng: number } or null if invalid
 */
export function getPolygonCentroid(polygon: any): { lat: number; lng: number } | null {
  if (!polygon) return null;

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
      return null;
    }

    if (coords.length === 0) return null;

    // Calculate centroid using the average of all points
    const lats = coords.map(coord => coord[0]);
    const lngs = coords.map(coord => coord[1]);
    
    const centerLat = lats.reduce((sum, lat) => sum + lat, 0) / lats.length;
    const centerLng = lngs.reduce((sum, lng) => sum + lng, 0) / lngs.length;

    return { lat: centerLat, lng: centerLng };
  } catch (error) {
    console.error('Error calculating polygon centroid:', error);
    return null;
  }
}
