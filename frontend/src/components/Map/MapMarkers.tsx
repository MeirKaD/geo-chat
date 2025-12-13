import { Marker, Popup } from 'react-map-gl/maplibre';
import { useState } from 'react';

interface MarkerData {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  description?: string;
  popup?: {
    title?: string;
    description?: string;
    footer?: string;
    html?: string;
  };
}

interface MapMarkersProps {
  markers: MarkerData[];
  onMarkerClick?: (marker: MarkerData) => void;
}

export default function MapMarkers({ markers, onMarkerClick }: MapMarkersProps) {
  const [hovered, setHovered] = useState<MarkerData | null>(null);

  const renderPopupContent = (marker: MarkerData) => {
    if (marker.popup?.html) {
      return <div dangerouslySetInnerHTML={{ __html: marker.popup.html }} />;
    }
    return (
      <div className="text-sm space-y-1">
        <div className="font-semibold">{marker.popup?.title ?? marker.title}</div>
        <div className="text-gray-700">{marker.popup?.description ?? marker.description}</div>
        {marker.popup?.footer && (
          <div className="text-xs text-gray-500">{marker.popup.footer}</div>
        )}
      </div>
    );
  };

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
            onMouseEnter={() => setHovered(marker)}
          >
            📍
          </div>
        </Marker>
      ))}
      {hovered && (
        <Popup
          longitude={hovered.longitude}
          latitude={hovered.latitude}
          anchor="top"
          closeButton={false}
          closeOnMove={false}
          onClose={() => setHovered(null)}
          maxWidth="260px"
        >
          <div
            onMouseLeave={() => setHovered(null)}
            className="p-2 text-gray-900"
          >
            {renderPopupContent(hovered)}
          </div>
        </Popup>
      )}
    </>
  );
}
