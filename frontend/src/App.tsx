import { useState, useEffect, useCallback } from 'react';
import MapContainer, { type MapViewData } from './components/Map/MapContainer';
import ChatContainer from './components/Chat/ChatContainer';
import './App.css';

const STORAGE_KEY = 'geo-chat-map-data';

function loadMapDataFromStorage(): MapViewData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as MapViewData;
    }
  } catch (error) {
    console.warn('Failed to load map data from storage:', error);
  }
  return null;
}

function saveMapDataToStorage(data: MapViewData | null): void {
  try {
    if (data && data.markers.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  } catch (error) {
    console.warn('Failed to save map data to storage:', error);
  }
}

function App() {
  // Initialize state from local storage
  const [mapData, setMapData] = useState<MapViewData | null>(() => loadMapDataFromStorage());

  // Wrapper to save to local storage whenever map data updates
  const handleMapUpdate = useCallback((data: MapViewData | null) => {
    setMapData(data);
    saveMapDataToStorage(data);
  }, []);

  // Also save when mapData changes (covers initial load merging scenarios)
  useEffect(() => {
    if (mapData) {
      saveMapDataToStorage(mapData);
    }
  }, [mapData]);

  return (
    <div className="flex h-screen">
      {/* Map - takes 2/3 of the screen */}
      <div className="flex-1">
        <MapContainer data={mapData} />
      </div>

      {/* Chat - takes 1/3 of the screen */}
      <div className="w-96">
        <ChatContainer onMapUpdate={handleMapUpdate} />
      </div>
    </div>
  );
}

export default App;
