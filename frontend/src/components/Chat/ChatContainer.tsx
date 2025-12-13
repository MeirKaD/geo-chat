import { useRef, useState } from 'react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { sendChatMessage } from '../../api/client';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface MapData {
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
}

interface ChatContainerProps {
  onMapUpdate?: (map: MapData | null) => void;
}

export default function ChatContainer({ onMapUpdate }: ChatContainerProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm GeoChat. Ask me about any place - restaurants, homes, hotels, or anything location-based!",
      timestamp: new Date()
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const threadIdRef = useRef<string>(crypto.randomUUID());

  const handleSendMessage = async (content: string) => {

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

    // Call backend API
    setIsTyping(true);
    try {
      const response = await sendChatMessage(
        [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
        threadIdRef.current
      );

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.content,
        timestamp: new Date(response.timestamp)
      };
      setMessages(prev => [...prev, assistantMessage]);

      if (onMapUpdate) {
        onMapUpdate(response.map ?? null);
      }
    } catch (err) {
      console.error('Chat error:', err);

      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Sorry, I encountered an error. Please make sure the backend server is running.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Chat</h2>
      </div>

      {/* Messages */}
      <MessageList messages={messages} isTyping={isTyping} />

      {/* Input */}
      <ChatInput onSendMessage={handleSendMessage} />
    </div>
  );
}
