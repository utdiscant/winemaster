import { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Polygon, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { normalizeGeoJSONCoordinates } from '@/utils/geoUtils';

// Fix for default marker icons in Leaflet with bundlers
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  iconRetinaUrl: iconRetina,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface WineMapProps {
  // For text-to-map: Handle map clicks
  onMapClick?: (lat: number, lng: number) => void;
  clickedLocation?: { lat: number; lng: number } | null;
  
  // For map-to-text: Display region polygon
  regionPolygon?: any; // GeoJSON polygon
  
  // For displaying feedback after answer
  showCorrectRegion?: boolean;
  correctRegionPolygon?: any;
  centerMarker?: { lat: number; lng: number } | null; // Green pin for correct region center
  
  // For fitting bounds to show both pins
  fitBounds?: [[number, number], [number, number]] | null; // [[minLat, minLng], [maxLat, maxLng]]
  
  className?: string;
}

// Component to handle map click events
function MapClickHandler({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

// Component to add a marker for clicked location
function ClickMarker({ location }: { location: { lat: number; lng: number } | null }) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    // Remove existing marker
    if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }

    // Add new marker if location exists
    if (location) {
      markerRef.current = L.marker([location.lat, location.lng]).addTo(map);
    }

    return () => {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
      }
    };
  }, [location, map]);

  return null;
}

// Component to add a green marker for the center of correct region
function CenterMarker({ location }: { location: { lat: number; lng: number } | null }) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    // Remove existing marker
    if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }

    // Add new green marker if location exists
    if (location) {
      const greenIcon = L.icon({
        iconUrl: icon,
        iconRetinaUrl: iconRetina,
        shadowUrl: iconShadow,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        className: 'hue-rotate-90', // Make it green
      });

      markerRef.current = L.marker([location.lat, location.lng], { icon: greenIcon }).addTo(map);
    }

    return () => {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
      }
    };
  }, [location, map]);

  return null;
}

// Component to imperatively reset map view when center/zoom changes
function ViewResetter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom, { animate: false });
  }, [map, center, zoom]);

  return null;
}

// Component to fit map bounds to show specific area
function BoundsFitter({ bounds }: { bounds: [[number, number], [number, number]] | null }) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (bounds) {
      // Only fit once when bounds are first provided
      // After that, let user pan/zoom freely
      if (!hasFittedRef.current) {
        hasFittedRef.current = true;
        
        // Fit bounds with padding - Leaflet handles padding correctly as pixels
        map.fitBounds(bounds, { 
          padding: [60, 60], // 60px padding for ~10-15% visual buffer
          animate: true, // Smooth transition
          maxZoom: 8, // Don't zoom in too close
          duration: 0.5, // Fast animation
        });
      }
    } else {
      // Reset when bounds are cleared (new question)
      hasFittedRef.current = false;
    }
  }, [map, bounds]);

  return null;
}

export default function WineMap({
  onMapClick,
  clickedLocation,
  regionPolygon,
  showCorrectRegion,
  correctRegionPolygon,
  centerMarker,
  fitBounds,
  className = '',
}: WineMapProps) {
  // Convert GeoJSON geometry to array of Leaflet polygon coordinates
  // Returns array of polygons (outer rings only for now), where each polygon is an array of [lat, lng] coordinates
  // Note: Interior rings (holes) are not yet supported - would require GeoJSON layer or Polygon holes prop
  const getPolygonCoordinates = (geometry: any): number[][][] => {
    if (!geometry) return [];
    
    try {
      const polygons: number[][][] = [];

      if (geometry.type === 'Polygon' && geometry.coordinates) {
        // Simple Polygon: coordinates is [outerRing, innerRing1, ...]
        // For now, just use the outer ring
        const outerRing = geometry.coordinates[0];
        if (outerRing && outerRing.length > 0) {
          polygons.push(outerRing.map((coord: number[]) => [coord[1], coord[0]]));
        }
      } else if (geometry.type === 'MultiPolygon' && geometry.coordinates) {
        // MultiPolygon: coordinates is [polygon1, polygon2, ...]
        // Each polygon is [outerRing, innerRing1, ...]
        for (const polygon of geometry.coordinates) {
          if (polygon && polygon[0]) {
            const outerRing = polygon[0];
            if (outerRing && outerRing.length > 0) {
              polygons.push(outerRing.map((coord: number[]) => [coord[1], coord[0]]));
            }
          }
        }
      } else if (Array.isArray(geometry) && geometry.length > 0) {
        // Direct array format [[lat, lng], ...]
        if (geometry[0] && Array.isArray(geometry[0]) && typeof geometry[0][0] === 'number') {
          polygons.push(geometry);
        }
      }

      return polygons;
    } catch (error) {
      console.error('Error parsing geometry:', error);
      return [];
    }
  };

  const questionRegions = useMemo(() => getPolygonCoordinates(regionPolygon), [regionPolygon]);
  const correctRegions = useMemo(
    () => (showCorrectRegion ? getPolygonCoordinates(correctRegionPolygon) : []),
    [showCorrectRegion, correctRegionPolygon]
  );

  // Memoize center and zoom to prevent unnecessary map resets
  // For text-to-map: zoom out to Europe view for exploration
  // For map-to-text: zoom in to the specific region
  const center = useMemo((): [number, number] => {
    if (questionRegions.length > 0 && questionRegions[0].length > 0) {
      // Map-to-text: Calculate center of all question regions
      const allCoords = questionRegions.flat();
      const lats = allCoords.map((coord: any) => coord[0]);
      const lngs = allCoords.map((coord: any) => coord[1]);
      const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      return [centerLat, centerLng];
    }
    // Text-to-map or no region: Default to Europe view
    return [48.0, 10.0];
  }, [questionRegions]);

  const zoom = useMemo(() => {
    // Map-to-text: Zoom to region (higher zoom)
    if (questionRegions.length > 0) return 6;
    // Text-to-map: Europe view (lower zoom for exploration)
    return 4;
  }, [questionRegions]);

  return (
    <div className={`relative ${className}`} style={{ height: '400px', width: '100%' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%', borderRadius: '0.5rem' }}
        data-testid="wine-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />
        
        {/* Imperatively reset view when question changes or fit to custom bounds */}
        {fitBounds ? (
          <BoundsFitter bounds={fitBounds} />
        ) : (
          <ViewResetter center={center} zoom={zoom} />
        )}
        
        {/* Handle map clicks for text-to-map questions */}
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}
        
        {/* Show clicked location marker */}
        {clickedLocation && <ClickMarker location={clickedLocation} />}
        
        {/* Show green center marker for correct region */}
        {centerMarker && <CenterMarker location={centerMarker} />}
        
        {/* Display question regions (for map-to-text) - supports MultiPolygon */}
        {questionRegions.map((polygon, idx) => 
          polygon.length >= 3 ? (
            <Polygon
              key={`question-${idx}`}
              positions={polygon}
              pathOptions={{
                color: '#7c2d12', // burgundy
                fillColor: '#dc2626',
                fillOpacity: 0.4,
                weight: 2,
              }}
            />
          ) : null
        )}
        
        {/* Display correct regions (feedback) - supports MultiPolygon */}
        {showCorrectRegion && correctRegions.map((polygon, idx) => 
          polygon.length >= 3 ? (
            <Polygon
              key={`correct-${idx}`}
              positions={polygon}
              pathOptions={{
                color: '#15803d', // green
                fillColor: '#22c55e',
                fillOpacity: 0.3,
                weight: 2,
                dashArray: '5, 5',
              }}
            />
          ) : null
        )}
      </MapContainer>
    </div>
  );
}
