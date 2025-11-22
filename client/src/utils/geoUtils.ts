// Utility functions for geographic calculations (client-side)

/**
 * Normalize GeoJSON geometry to extract all coordinate points
 * Supports both Polygon and MultiPolygon, including interior rings
 * @param geometry - GeoJSON geometry object
 * @returns Array of [lat, lng] coordinates from all rings
 */
function normalizeGeoJSONCoordinates(geometry: any): number[][] {
  if (!geometry) return [];

  try {
    const coords: number[][] = [];

    if (geometry.type === 'Polygon' && geometry.coordinates) {
      // Polygon: coordinates is [outerRing, innerRing1, innerRing2, ...]
      // Each ring is [[lng, lat], [lng, lat], ...]
      for (const ring of geometry.coordinates) {
        if (Array.isArray(ring)) {
          for (const coord of ring) {
            if (coord.length >= 2) {
              // Convert from [lng, lat] to [lat, lng]
              coords.push([coord[1], coord[0]]);
            }
          }
        }
      }
    } else if (geometry.type === 'MultiPolygon' && geometry.coordinates) {
      // MultiPolygon: coordinates is [polygon1, polygon2, ...]
      // Each polygon is [outerRing, innerRing1, ...]
      for (const polygon of geometry.coordinates) {
        if (Array.isArray(polygon)) {
          for (const ring of polygon) {
            if (Array.isArray(ring)) {
              for (const coord of ring) {
                if (coord.length >= 2) {
                  // Convert from [lng, lat] to [lat, lng]
                  coords.push([coord[1], coord[0]]);
                }
              }
            }
          }
        }
      }
    } else if (Array.isArray(geometry) && geometry.length > 0) {
      // Direct array format [[lat, lng], ...]
      return geometry.filter(c => Array.isArray(c) && c.length >= 2);
    }

    return coords;
  } catch (error) {
    console.error('Error normalizing GeoJSON coordinates:', error);
    return [];
  }
}

/**
 * Calculate bounds that include a polygon/multipolygon and a point
 * @param geometry - GeoJSON polygon or multipolygon object
 * @param point - Additional point { lat, lng } to include in bounds
 * @returns Bounds as [[minLat, minLng], [maxLat, maxLng]] or null if invalid
 */
export function getBoundsForPolygonAndPoint(
  geometry: any,
  point: { lat: number; lng: number }
): [[number, number], [number, number]] | null {
  if (!geometry || !point) return null;

  try {
    const coords = normalizeGeoJSONCoordinates(geometry);
    
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
 * Calculate the centroid (center point) of a polygon or multipolygon
 * For MultiPolygon, calculates the centroid of the largest polygon by area
 * @param geometry - GeoJSON polygon or multipolygon object
 * @returns centroid as { lat: number; lng: number } or null if invalid
 */
export function getPolygonCentroid(geometry: any): { lat: number; lng: number } | null {
  if (!geometry) return null;

  try {
    let targetCoords: number[][] = [];

    if (geometry.type === 'Polygon' && geometry.coordinates && geometry.coordinates[0]) {
      // Simple polygon - use outer ring
      targetCoords = geometry.coordinates[0].map((coord: number[]) => [coord[1], coord[0]]);
    } else if (geometry.type === 'MultiPolygon' && geometry.coordinates) {
      // MultiPolygon - find the largest polygon by number of vertices (proxy for area)
      let largestPolygon: number[][] = [];
      let maxVertices = 0;

      for (const polygon of geometry.coordinates) {
        if (Array.isArray(polygon) && polygon[0]) {
          const outerRing = polygon[0];
          if (outerRing.length > maxVertices) {
            maxVertices = outerRing.length;
            largestPolygon = outerRing.map((coord: number[]) => [coord[1], coord[0]]);
          }
        }
      }

      targetCoords = largestPolygon;
    } else if (Array.isArray(geometry) && geometry.length > 0) {
      // Direct array format [[lat, lng], ...]
      targetCoords = geometry;
    } else {
      return null;
    }

    if (targetCoords.length === 0) return null;

    // Calculate centroid using the average of all points
    const lats = targetCoords.map(coord => coord[0]);
    const lngs = targetCoords.map(coord => coord[1]);
    
    const centerLat = lats.reduce((sum, lat) => sum + lat, 0) / lats.length;
    const centerLng = lngs.reduce((sum, lng) => sum + lng, 0) / lngs.length;

    return { lat: centerLat, lng: centerLng };
  } catch (error) {
    console.error('Error calculating polygon centroid:', error);
    return null;
  }
}
