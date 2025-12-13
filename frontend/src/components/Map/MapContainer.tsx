import { useMemo, useRef } from 'react';
import Map, { type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapControls from './MapControls';
import MapMarkers from './MapMarkers';

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

  const markers = data?.markers ?? [];

  const center = useMemo(() => {
    if (data?.bounds) {
      const { minLat, minLng, maxLat, maxLng } = data.bounds;
      return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2
      };
    }
    return { latitude: 37.8, longitude: -122.4 };
  }, [data]);

  return (
    <Map
      ref={mapRef}
      initialViewState={{
        longitude: center.longitude,
        latitude: center.latitude,
        zoom: 11
      }}
      style={{ width: '100%', height: '100vh' }}
      mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
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
