export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface MapPayload {
  markers: Array<{
    id?: string;
    lat: number;
    lng: number;
    title: string;
    description?: string;
    category?: string;
  }>;
  polygons?: Array<{
    id: string;
    type: string;
    coordinates: number[][][];
  }>;
  bounds?: {
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
  } | null;
}

export interface ChatRequest {
  messages: ChatMessage[];
  threadId?: string;
  fastMode?: boolean;  // Use fast pipeline (no scraping, limited to 10 results)
}

export interface ChatResponse {
  role: 'assistant';
  content: string;
  timestamp: string;
  threadId?: string;
  map?: MapPayload | null;
}
