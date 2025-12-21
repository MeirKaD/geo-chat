import { useMemo, useRef, useState, useEffect } from 'react';
import MapGL, { type MapRef } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapControls from './MapControls';
import MapMarkers from './MapMarkers';

// Enable RTL text plugin globally (must be called before any map is created)
let rtlPluginLoaded = false;
if (!rtlPluginLoaded) {
  maplibregl.setRTLTextPlugin(
    'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
    true
  );
  rtlPluginLoaded = true;
}

export interface MapViewData {
  markers: {
    id?: string;
    lat: number;
    lng: number;
    title: string;
    description?: string;
    category?: string;
    popup?: {
      title?: string;
      description?: string;
      footer?: string;
      html?: string;
    };
  }[];
  bounds?: {
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
  } | null;
}

interface MapContainerProps {
  data: MapViewData | null;
}

type MarkerInput = MapViewData['markers'][number];

function computeBoundsFromMarkers(markers: MarkerInput[]): MapViewData['bounds'] {
  if (markers.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  markers.forEach((marker) => {
    if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lng)) return;
    minLat = Math.min(minLat, marker.lat);
    maxLat = Math.max(maxLat, marker.lat);
    minLng = Math.min(minLng, marker.lng);
    maxLng = Math.max(maxLng, marker.lng);
  });

  if (!Number.isFinite(minLat) || !Number.isFinite(maxLat) || !Number.isFinite(minLng) || !Number.isFinite(maxLng)) {
    return null;
  }

  // Avoid zero-area bounds which can cause fitBounds to misbehave
  if (minLat === maxLat) {
    minLat -= 0.0005;
    maxLat += 0.0005;
  }
  if (minLng === maxLng) {
    minLng -= 0.0005;
    maxLng += 0.0005;
  }

  return { minLat, minLng, maxLat, maxLng };
}

/**
 * Spread overlapping markers so they don't stack on the exact same lat/lng.
 * This keeps the map readable when many results geocode to the same point.
 */
function spreadOverlappingMarkers(markers: MarkerInput[]): MarkerInput[] {
  const buckets = new Map<string, MarkerInput[]>();

  markers.forEach((marker) => {
    const key = `${marker.lat.toFixed(5)}|${marker.lng.toFixed(5)}`;
    const group = buckets.get(key) ?? [];
    group.push(marker);
    buckets.set(key, group);
  });

  const spread: MarkerInput[] = [];
  const radius = 0.0006; // ~60m; small enough to stay near the real location

  buckets.forEach((group: MarkerInput[], key) => {
    if (group.length === 1) {
      spread.push(group[0]);
      return;
    }

    const [baseLatStr, baseLngStr] = key.split('|');
    const baseLat = Number(baseLatStr);
    const baseLng = Number(baseLngStr);

    // deterministic order so positions don't jump between renders
    const sorted = [...group].sort((a, b) => (a.id ?? a.title).localeCompare(b.id ?? b.title));

    sorted.forEach((marker, index) => {
      const angle = (2 * Math.PI * index) / sorted.length;
      const offsetLat = baseLat + radius * Math.sin(angle);
      const offsetLng = baseLng + radius * Math.cos(angle);

      spread.push({
        ...marker,
        lat: offsetLat,
        lng: offsetLng,
      });
    });
  });

  return spread;
}

export default function MapContainer({ data }: MapContainerProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const markers = data?.markers ?? [];
  const displayMarkers = useMemo(() => spreadOverlappingMarkers(markers), [markers]);
  const computedBounds = useMemo(
    () => data?.bounds ?? computeBoundsFromMarkers(displayMarkers),
    [data?.bounds, displayMarkers]
  );

  // Get user's current location on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };

          setUserLocation(newLocation);
        },
        (error) => {
          console.warn('Failed to get user location:', error.message);
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 0
        }
      );
    }
  }, [computedBounds]);

  // Fly to user location once available (only when we don't already have bounds)
  useEffect(() => {
    if (!userLocation || computedBounds) return;
    const map = mapRef.current;
    if (!map) return;

    map.flyTo({
      center: [userLocation.longitude, userLocation.latitude],
      zoom: 11,
      duration: 2000,
    });
  }, [userLocation, computedBounds]);

  // Fit map to results when we have bounds from data or computed markers
  useEffect(() => {
    if (!mapRef.current || !computedBounds) return;

    const { minLat, minLng, maxLat, maxLng } = computedBounds;
    mapRef.current.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      {
        padding: 60,
        duration: 800,
        maxZoom: 14,
      }
    );
  }, [computedBounds]);

  const center = useMemo(() => {
    if (computedBounds) {
      const { minLat, minLng, maxLat, maxLng } = computedBounds;
      return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2
      };
    }
    // Use user location if available, otherwise fallback to SF
    if (userLocation) {
      return userLocation;
    }
    return { latitude: 37.8, longitude: -122.4 };
  }, [computedBounds, userLocation]);

  return (
    <MapGL
      ref={mapRef}
      initialViewState={{
        longitude: center.longitude,
        latitude: center.latitude,
        zoom: 11
      }}
      style={{ width: '100%', height: '100vh' }}
      mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
    >
      <MapControls />
      <MapMarkers
        markers={displayMarkers.map((m) => ({
          id: m.id ?? `${m.lat},${m.lng}`,
          latitude: m.lat,
          longitude: m.lng,
          title: m.title,
          description: m.description,
          popup: m.popup
        }))}
      />
    </MapGL>
  );
}
