import { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Polygon, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

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

// Component to imperatively reset map view when center/zoom changes
function ViewResetter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom, { animate: false });
  }, [map, center, zoom]);

  return null;
}

export default function WineMap({
  onMapClick,
  clickedLocation,
  regionPolygon,
  showCorrectRegion,
  correctRegionPolygon,
  className = '',
}: WineMapProps) {
  // Convert GeoJSON polygon to Leaflet format
  const getPolygonCoordinates = (polygon: any) => {
    if (!polygon) return [];
    
    try {
      // GeoJSON format: { type: "Polygon", coordinates: [[[lng, lat], [lng, lat], ...]] }
      if (polygon.type === 'Polygon' && polygon.coordinates && polygon.coordinates[0]) {
        // Convert from [lng, lat] to [lat, lng] for Leaflet
        return polygon.coordinates[0].map((coord: number[]) => [coord[1], coord[0]]);
      }
      
      // Also support direct array format
      if (Array.isArray(polygon) && polygon.length > 0) {
        // Assume it's already in [lat, lng] format or convert if needed
        return polygon.map((coord: any) => {
          if (Array.isArray(coord) && coord.length === 2) {
            return coord;
          }
          return [0, 0];
        });
      }
    } catch (error) {
      console.error('Error parsing polygon:', error);
    }
    
    return [];
  };

  const questionRegion = useMemo(() => getPolygonCoordinates(regionPolygon), [regionPolygon]);
  const correctRegion = useMemo(
    () => (showCorrectRegion ? getPolygonCoordinates(correctRegionPolygon) : []),
    [showCorrectRegion, correctRegionPolygon]
  );

  // Memoize center and zoom to prevent unnecessary map resets
  // For text-to-map: zoom out to Europe view for exploration
  // For map-to-text: zoom in to the specific region
  const center = useMemo((): [number, number] => {
    if (questionRegion.length > 0) {
      // Map-to-text: Calculate center of the question region
      const lats = questionRegion.map((coord: any) => coord[0]);
      const lngs = questionRegion.map((coord: any) => coord[1]);
      const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      return [centerLat, centerLng];
    }
    // Text-to-map or no region: Default to Europe view
    return [48.0, 10.0];
  }, [questionRegion]);

  const zoom = useMemo(() => {
    // Map-to-text: Zoom to region (higher zoom)
    if (questionRegion.length > 0) return 6;
    // Text-to-map: Europe view (lower zoom for exploration)
    return 4;
  }, [questionRegion]);

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
        
        {/* Imperatively reset view when question changes */}
        <ViewResetter center={center} zoom={zoom} />
        
        {/* Handle map clicks for text-to-map questions */}
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}
        
        {/* Show clicked location marker */}
        {clickedLocation && <ClickMarker location={clickedLocation} />}
        
        {/* Display question region (for map-to-text) */}
        {questionRegion.length >= 3 && (
          <Polygon
            positions={questionRegion}
            pathOptions={{
              color: '#7c2d12', // burgundy
              fillColor: '#dc2626',
              fillOpacity: 0.4,
              weight: 2,
            }}
          />
        )}
        
        {/* Display correct region (feedback) - requires at least 3 points for valid polygon */}
        {showCorrectRegion && correctRegion.length >= 3 && (
          <Polygon
            positions={correctRegion}
            pathOptions={{
              color: '#15803d', // green
              fillColor: '#22c55e',
              fillOpacity: 0.3,
              weight: 2,
              dashArray: '5, 5',
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
