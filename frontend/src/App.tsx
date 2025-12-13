import { useState } from 'react';
import MapContainer, { type MapViewData } from './components/Map/MapContainer';
import ChatContainer from './components/Chat/ChatContainer';
import './App.css';

function App() {
  const [mapData, setMapData] = useState<MapViewData | null>(null);

  return (
    <div className="flex h-screen">
      {/* Map - takes 2/3 of the screen */}
      <div className="flex-1">
        <MapContainer data={mapData} />
      </div>

      {/* Chat - takes 1/3 of the screen */}
      <div className="w-96">
        <ChatContainer onMapUpdate={setMapData} />
      </div>
    </div>
  );
}

export default App;
