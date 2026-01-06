import { useRef, useState, useMemo, useEffect } from 'react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { sendChatMessageStream } from '../../api/client';
import { LimitReachedModal } from '../LimitReachedModal';

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
    data?: {
      address?: string;
      url?: string;
      rating?: number;
      priceLevel?: string;
      price?: number;
      phone?: string;
      website?: string;
      hours?: string;
      amenities?: string[];
      photos?: string[];
      metadata?: any;
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
  const initialMessage: Message = {
    id: '1',
    role: 'assistant',
    content: "Hi! I'm GeoChat. Ask me about any place - restaurants, homes, hotels, or anything location-based!",
    timestamp: new Date()
  };

  // Initialize messages with stored count
  const [messages, setMessages] = useState<Message[]>(() => {
    const storedCount = parseInt(localStorage.getItem('geo-chat-user-message-count') || '0', 10);
    if (storedCount > 0) {
      // Create placeholder messages to maintain the count
      const placeholderMessages: Message[] = [initialMessage];
      for (let i = 0; i < storedCount; i++) {
        placeholderMessages.push({
          id: `stored-user-${i}`,
          role: 'user',
          content: '[Previous session message]',
          timestamp: new Date()
        });
        placeholderMessages.push({
          id: `stored-assistant-${i}`,
          role: 'assistant',
          content: '[Previous session response]',
          timestamp: new Date()
        });
      }
      return placeholderMessages;
    }
    return [initialMessage];
  });
  const [isTyping, setIsTyping] = useState(false);
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [fastMode, setFastMode] = useState(true);
  const threadIdRef = useRef<string>(crypto.randomUUID());

  // Count user messages (excluding the initial assistant message)
  const userMessageCount = useMemo(() => {
    return messages.filter(m => m.role === 'user').length;
  }, [messages]);

  // Persist user message count to localStorage
  useEffect(() => {
    if (userMessageCount > 0) {
      localStorage.setItem('geo-chat-user-message-count', userMessageCount.toString());
    }
  }, [userMessageCount]);

  // Show modal when user has sent 5 messages
  const showLimitModal = userMessageCount >= 5;

  const handleClearHistory = async () => {
    // DO NOT reset backend counter or message count - limit should persist

    // Clear messages (but keep the count in state)
    setMessages([initialMessage]);
    // Clear map datay
    if (onMapUpdate) {
      onMapUpdate(null);
    }
    // Clear localStorage (but NOT the message count)
    localStorage.removeItem('geo-chat-map-data');
    // Do NOT generate new thread ID - keep the same one to maintain rate limit
  };

  const handleSendMessage = async (content: string) => {
    // Prevent sending if limit reached
    if (userMessageCount >= 5) {
      return;
    }

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

      // Check if it's a rate limit error
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      if (errorMessage.includes('Message limit exceeded') || errorMessage.includes('429')) {
        // Don't add an error message, just let the modal show
        // Remove the user message that was just added since it wasn't processed
        setMessages(prev => prev.slice(0, -1));
      } else {
        // Add error message for other errors
        const assistantError: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '❌ Sorry, I encountered an error. Please make sure the backend server is running.',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantError]);
      }
    } finally {
      setIsTyping(false);
      setProgressLogs([]);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#0A0E17' }}>
      {/* Bright Data Brand Header */}
      <div className="px-4 md:px-5 py-4 md:py-5" style={{ background: 'linear-gradient(180deg, #141C2F 0%, #0A0E17 100%)' }}>
        {/* GeoChat Title & CTA */}
        <div className="flex items-center justify-between mb-4">
            <div>
              <h2
                className="text-xl md:text-2xl font-bold tracking-tight"
                style={{
                  background: 'linear-gradient(90deg, #FFFFFF 0%, #94A3B8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                GeoChat
              </h2>
              <p className="text-xs mt-0.5 whitespace-nowrap" style={{ color: '#B7C9DE' }}>
                Location intelligence demo
              </p>
          </div>
          <a
            href="https://brightdata.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 hover:opacity-90"
            style={{
              background: '#0066FF',
              color: '#FFFFFF',
            }}
          >
            Get free web access credits
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>

        {/* Fast/Deep Mode Toggle - Bright Data styled */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: '#94A3B8' }}>Search mode</span>
          <div className="flex items-center gap-2">
          <button
            onClick={() => setFastMode(!fastMode)}
            className="flex items-center rounded-full overflow-hidden transition-all"
            style={{
              background: '#1E293B',
              border: '1px solid #2D3B55',
            }}
            aria-label={fastMode ? 'Switch to Deep mode' : 'Switch to Fast mode'}
          >
            <span
              className="px-3 py-1.5 text-xs font-semibold transition-all rounded-full"
              style={{
                background: !fastMode ? '#0066FF' : 'transparent',
                color: !fastMode ? '#FFFFFF' : '#64748B',
              }}
            >
              Deep
            </span>
            <span
              className="px-3 py-1.5 text-xs font-semibold transition-all rounded-full"
              style={{
                background: fastMode ? '#FF521C' : 'transparent',
                color: fastMode ? '#FFFFFF' : '#64748B',
              }}
            >
              Fast
            </span>
          </button>
                      {/* Clear history button */}
                      <button
              onClick={handleClearHistory}
              className="p-2 rounded-full transition-all duration-200 hover:bg-slate-800/50"
              style={{ color: '#64748B' }}
              title="Clear history and start fresh"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Divider with glow effect */}
      <div
        className="h-px mx-4"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, #0066FF 50%, transparent 100%)',
          opacity: 0.5,
        }}
      />

      {/* Messages */}
      <MessageList messages={messages} isTyping={isTyping} progressLogs={progressLogs} />

      {/* Input */}
      <ChatInput onSendMessage={handleSendMessage} />

      {/* Limit Reached Modal */}
      <LimitReachedModal isOpen={showLimitModal} />
    </div>
  );
}
