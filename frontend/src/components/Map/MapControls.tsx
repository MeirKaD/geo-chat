import { NavigationControl, GeolocateControl, ScaleControl } from 'react-map-gl/maplibre';

export default function MapControls() {
  return (
    <>
      {/* Navigation controls (zoom +/-) */}
      <NavigationControl position="top-right" />

      {/* Geolocation button */}
      <GeolocateControl
        position="top-right"
        trackUserLocation
      />

      {/* Scale bar */}
      <ScaleControl position="bottom-right" />
    </>
  );
}
