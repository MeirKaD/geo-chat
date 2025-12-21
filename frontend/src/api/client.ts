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

export interface ProgressUpdate {
  currentStep: string;
  percentComplete: number;
  message?: string;
}

export async function sendChatMessageStream(
  messages: ChatMessage[],
  threadId: string,
  onProgress: (progress: ProgressUpdate) => void
): Promise<ChatResponse> {
  const response = await fetch(`${API_URL}/api/chat/stream`, {
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

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error('Response body is not readable');
  }

  let finalResponse: ChatResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.substring(6));

        if (data.type === 'progress') {
          onProgress({
            currentStep: data.currentStep,
            percentComplete: data.percentComplete,
            message: data.message,
          });
        } else if (data.type === 'complete') {
          finalResponse = {
            role: data.role,
            content: data.content,
            timestamp: data.timestamp,
            threadId: data.threadId,
            map: data.map,
          };
        } else if (data.type === 'error') {
          throw new Error(data.message || 'Unknown error');
        }
      }
    }
  }

  if (!finalResponse) {
    throw new Error('No response received from server');
  }

  return finalResponse;
}

export async function checkHealth(): Promise<{ status: string; timestamp: string }> {
  const response = await fetch(`${API_URL}/api/health`);

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  return response.json();
}
