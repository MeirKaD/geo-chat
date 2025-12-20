import { useMemo, useRef, useState, useEffect } from 'react';
import Map, { type MapRef } from 'react-map-gl/maplibre';
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

export default function MapContainer({ data }: MapContainerProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const markers = data?.markers ?? [];

  // Get user's current location on mount
  useEffect(() => {
    console.log('[MapContainer] Checking geolocation availability...');

    if ('geolocation' in navigator) {
      console.log('[MapContainer] Geolocation API is available, requesting position...');

      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('[MapContainer] Geolocation success:', {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });

          const newLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };

          setUserLocation(newLocation);

          // Fly to user location if no data bounds exist
          if (!data?.bounds && mapRef.current) {
            console.log('[MapContainer] Flying to user location...');
            mapRef.current.flyTo({
              center: [newLocation.longitude, newLocation.latitude],
              zoom: 11,
              duration: 2000
            });
          }
        },
        (error) => {
          console.error('[MapContainer] Geolocation error:', {
            code: error.code,
            message: error.message
          });
          // Fallback to SF on error
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 0
        }
      );
    } else {
      console.warn('[MapContainer] Geolocation API not available in this browser');
    }
  }, [data?.bounds]);

  const center = useMemo(() => {
    console.log('[MapContainer] Calculating center with:', {
      hasBounds: !!data?.bounds,
      hasUserLocation: !!userLocation,
      userLocation
    });

    if (data?.bounds) {
      const { minLat, minLng, maxLat, maxLng } = data.bounds;
      const boundsCenter = {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2
      };
      console.log('[MapContainer] Using bounds center:', boundsCenter);
      return boundsCenter;
    }
    // Use user location if available, otherwise fallback to SF
    if (userLocation) {
      console.log('[MapContainer] Using user location:', userLocation);
      return userLocation;
    }
    console.log('[MapContainer] Using SF fallback');
    return { latitude: 37.8, longitude: -122.4 };
  }, [data, userLocation]);

  return (
    <Map
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
        markers={markers.map((m) => ({
          id: m.id ?? `${m.lat},${m.lng}`,
          latitude: m.lat,
          longitude: m.lng,
          title: m.title,
          description: m.description,
          popup: m.popup
        }))}
      />
    </Map>
  );
}
