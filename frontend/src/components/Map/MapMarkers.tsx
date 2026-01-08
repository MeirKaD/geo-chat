import { Marker, Popup } from 'react-map-gl/maplibre';
import { useState } from 'react';
import CustomMarker from './CustomMarker';

interface MarkerData {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  description?: string;
  category?: string;
  popup?: {
    title?: string;
    description?: string;
    footer?: string;
    html?: string;
  };
  data?: {
    rating?: number;
    url?: string;
    website?: string;
    phone?: string;
    priceLevel?: string;
    address?: string;
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

    const rating = marker.data?.rating;
    const priceLevel = marker.data?.priceLevel;
    const url = marker.data?.url;
    const website = marker.data?.website;
    const phone = marker.data?.phone;
    const address = marker.data?.address;

    return (
      <div className="min-w-[240px] max-w-[300px]">
        {/* Title */}
        <div className="font-bold text-base mb-2 text-gray-900">
          {marker.popup?.title ?? marker.title}
        </div>

        {/* Rating */}
        {rating && (
          <div className="flex items-center gap-1 mb-2">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  className="text-yellow-400"
                  style={{
                    opacity: star <= Math.round(rating) ? 1 : 0.3,
                  }}
                >
                  ⭐
                </span>
              ))}
            </div>
            <span className="text-sm font-medium text-gray-700">
              {rating.toFixed(1)}
            </span>
          </div>
        )}

        {/* Price Level */}
        {priceLevel && (
          <div className="mb-2">
            <span className="text-green-600 font-semibold">{priceLevel}</span>
          </div>
        )}

        {/* Description */}
        {(marker.popup?.description || marker.description) && (
          <div className="text-sm text-gray-600 mb-3 line-clamp-3">
            {marker.popup?.description ?? marker.description}
          </div>
        )}

        {/* Address */}
        {address && (
          <div className="text-xs text-gray-500 mb-2 flex items-start gap-1">
            <span>📍</span>
            <span>{address}</span>
          </div>
        )}

        {/* Footer */}
        {marker.popup?.footer && (
          <div className="text-xs text-gray-500 mb-2 border-t pt-2">
            {marker.popup.footer}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 mt-3 pt-2 border-t border-gray-200">
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              View Details
            </a>
          )}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-200 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              Website
            </a>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded hover:bg-green-200 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              📞 Call
            </a>
          )}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${marker.latitude},${marker.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-white border border-gray-300 px-2 py-1.5 rounded hover:bg-gray-50 transition-colors flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            title="Open in Google Maps"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="w-4 h-4"
            >
              <path
                fill="#4285F4"
                d="M12 0C7.31 0 3.5 3.81 3.5 8.5c0 1.62.46 3.13 1.25 4.42L12 24l7.25-11.08c.79-1.29 1.25-2.8 1.25-4.42C20.5 3.81 16.69 0 12 0z"
              />
              <circle fill="#34A853" cx="12" cy="8.5" r="3"/>
            </svg>
          </a>
        </div>
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
          <CustomMarker
            rating={marker.data?.rating}
            category={marker.category}
            isHovered={hovered?.id === marker.id}
            onClick={() => onMarkerClick?.(marker)}
            onMouseEnter={() => setHovered(marker)}
          />
        </Marker>
      ))}
      {hovered && (
        <Popup
          longitude={hovered.longitude}
          latitude={hovered.latitude}
          anchor="top"
          closeButton={true}
          closeOnMove={false}
          onClose={() => setHovered(null)}
          maxWidth="320px"
          className="custom-popup"
        >
          <div
            onMouseLeave={() => setHovered(null)}
            className="p-3"
          >
            {renderPopupContent(hovered)}
          </div>
        </Popup>
      )}
    </>
  );
}
