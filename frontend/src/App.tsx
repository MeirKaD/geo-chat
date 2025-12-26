import { useState, useEffect, useCallback } from 'react';
import MapContainer, { type MapViewData } from './components/Map/MapContainer';
import ChatContainer from './components/Chat/ChatContainer';
import FloatingChat from './components/Chat/FloatingChat';
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
  // Mobile: show expanded chat panel (fullscreen) or floating chat on map
  const [showExpandedChat, setShowExpandedChat] = useState(false);

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
    <div className="flex flex-col md:flex-row h-[100dvh]">
      {/* Map - always visible, full width on mobile, 2/3 on desktop */}
      <div className={`flex-1 relative ${showExpandedChat ? 'hidden md:block' : 'block'}`}>
        <MapContainer data={mapData} />
        {/* Floating chat on map - mobile only */}
        <div className="md:hidden">
          <FloatingChat
            onMapUpdate={handleMapUpdate}
            onExpandClick={() => setShowExpandedChat(true)}
          />
        </div>
      </div>

      {/* Chat panel - always visible on desktop, expandable on mobile */}
      <div className={`w-full md:w-96 h-full ${showExpandedChat ? 'block' : 'hidden'} md:block`}>
        <ChatContainer onMapUpdate={handleMapUpdate} />
        {/* Close button - mobile only when expanded, positioned at bottom left */}
        <button
          onClick={() => setShowExpandedChat(false)}
          className="md:hidden fixed bottom-24 left-4 z-20 p-3 bg-slate-800/90 backdrop-blur-sm text-white rounded-full flex items-center justify-center shadow-lg border border-blue-700/40"
          title="Back to map"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default App;
