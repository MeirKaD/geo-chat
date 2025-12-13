import { Marker } from 'react-map-gl/maplibre';

interface MarkerData {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
}

interface MapMarkersProps {
  markers: MarkerData[];
  onMarkerClick?: (marker: MarkerData) => void;
}

export default function MapMarkers({ markers, onMarkerClick }: MapMarkersProps) {
  return (
    <>
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          longitude={marker.longitude}
          latitude={marker.latitude}
          anchor="bottom"
          onClick={() => onMarkerClick?.(marker)}
        >
          <div
            className="cursor-pointer"
            style={{
              fontSize: '24px',
            }}
          >
            📍
          </div>
        </Marker>
      ))}
    </>
  );
}
