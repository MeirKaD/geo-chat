import { useRef, useState } from 'react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { sendChatMessageStream } from '../../api/client';

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
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [fastMode, setFastMode] = useState(true);
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

    // Call backend API with streaming
    setIsTyping(true);
    setProgressLogs([]);

    try {
      const response = await sendChatMessageStream(
        [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
        threadIdRef.current,
        (progress) => {
          // Add progress log
          if (progress.message) {
            setProgressLogs(prev => [...prev, progress.message!]);
          }
        },
        fastMode
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
      setProgressLogs([]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <div className="px-6 py-4 border-b border-blue-800/30 bg-slate-900/50 backdrop-blur-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              GeoChat
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-blue-300/70">Powered by</span>
              <img
                src="https://congreso.america-digital.com/wp-content/uploads/2022/07/BRIGHT-DATA.png.webp"
                alt="Bright Data"
                className="h-12 object-contain"
              />
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <a
              href="https://brightdata.com"
              target="_blank"
              rel="noopener noreferrer"
              className="shiny-button px-5 py-2.5 bg-gradient-to-r from-blue-600 via-purple-500 to-blue-600 text-white hover:text-white text-sm font-semibold rounded-full overflow-hidden no-underline"
            >
              <span className="relative z-10 text-white">
                Build Your Own Agent
                <span className="block text-xs font-normal text-blue-100">Free credits included</span>
              </span>
            </a>
            {/* Fast Mode Toggle */}
            <button
              onClick={() => setFastMode(!fastMode)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                fastMode
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${fastMode ? 'bg-amber-400' : 'bg-slate-500'}`} />
              {fastMode ? 'Fast Mode' : 'Deep Search'}
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <MessageList messages={messages} isTyping={isTyping} progressLogs={progressLogs} />

      {/* Input */}
      <ChatInput onSendMessage={handleSendMessage} />
    </div>
  );
}
