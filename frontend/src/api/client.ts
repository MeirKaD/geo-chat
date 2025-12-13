const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  role: 'assistant';
  content: string;
  timestamp: string;
  threadId?: string;
  map?: {
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
    polygons?: {
      id: string;
      type: string;
      coordinates: number[][][];
    }[];
    bounds?: {
      minLat: number;
      minLng: number;
      maxLat: number;
      maxLng: number;
    } | null;
  } | null;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  threadId: string
): Promise<ChatResponse> {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, threadId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function checkHealth(): Promise<{ status: string; timestamp: string }> {
  const response = await fetch(`${API_URL}/api/health`);

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  return response.json();
}
