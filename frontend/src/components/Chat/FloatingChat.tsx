import { useState, useRef, useMemo, useEffect, type FormEvent } from 'react';
import { sendChatMessageStream } from '../../api/client';
import type { Message, MapData } from './ChatContainer';
import brightdataLogo from '../../assets/brightdata.svg';
import { LimitReachedModal } from '../LimitReachedModal';

interface FloatingChatProps {
  onMapUpdate?: (map: MapData | null) => void;
  onExpandClick: () => void;
}

export default function FloatingChat({ onMapUpdate, onExpandClick }: FloatingChatProps) {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [lastResponse, setLastResponse] = useState<string | null>(null);
  const [progressLog, setProgressLog] = useState<string>('');
  const [showResponse, setShowResponse] = useState(false);
  const [fastMode, setFastMode] = useState(true);

  // Initialize messages with stored count
  const [messages, setMessages] = useState<Message[]>(() => {
    const storedCount = parseInt(localStorage.getItem('geo-chat-user-message-count') || '0', 10);
    if (storedCount > 0) {
      // Create placeholder messages to maintain the count
      const placeholderMessages: Message[] = [];
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
    return [];
  });

  const threadIdRef = useRef<string>(crypto.randomUUID());

  const userMessageCount = useMemo(() => {
    return messages.filter(m => m.role === 'user').length;
  }, [messages]);

  // Persist user message count to localStorage
  useEffect(() => {
    if (userMessageCount > 0) {
      localStorage.setItem('geo-chat-user-message-count', userMessageCount.toString());
    }
  }, [userMessageCount]);

  const showLimitModal = userMessageCount >= 5;

  const handleClearHistory = async () => {
    // DO NOT reset backend counter or message count - limit should persist

    // Clear messages (but keep the count in state)
    setMessages([]);
    setLastResponse(null);
    setShowResponse(false);
    // Clear map data
    if (onMapUpdate) {
      onMapUpdate(null);
    }
    // Clear localStorage (but NOT the message count)
    localStorage.removeItem('geo-chat-map-data');
    // Do NOT generate new thread ID - keep the same one to maintain rate limit
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    // Prevent sending if limit reached
    if (userMessageCount >= 5) {
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);
    setProgressLog('');
    setShowResponse(true);
    setLastResponse(null);

    try {
      const response = await sendChatMessageStream(
        [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
        threadIdRef.current,
        (progress) => {
          if (progress.message) {
            setProgressLog(progress.message);
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
      setLastResponse(response.content);

      if (onMapUpdate) {
        onMapUpdate(response.map ?? null);
      }
    } catch (err) {
      console.error('Chat error:', err);

      // Check if it's a rate limit error
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      if (errorMessage.includes('Message limit exceeded') || errorMessage.includes('429')) {
        // Don't show error message, just let the modal appear
        // Remove the user message that was just added since it wasn't processed
        setMessages(prev => prev.slice(0, -1));
      } else {
        setLastResponse('Sorry, I encountered an error. Please try again.');
      }
    } finally {
      setIsTyping(false);
      setProgressLog('');
    }
  };

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <div className="absolute bottom-0 left-0 right-0 p-3 safe-area-bottom pointer-events-auto">
        {/* Response bubble - shows when there's a response or loading */}
        {showResponse && (lastResponse || isTyping) && (
          <div className="mb-3 mx-1">
            <div className="bg-slate-900/95 backdrop-blur-md rounded-2xl border border-blue-700/40 shadow-xl overflow-hidden">
              {/* Header with collapse/expand */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-blue-800/30">
                <span className="text-xs text-blue-300/70">
                  {isTyping ? 'Searching...' : 'Response'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onExpandClick}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Expand
                  </button>
                  <button
                    onClick={() => setShowResponse(false)}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
              {/* Content */}
              <div className="px-4 py-3 max-h-32 overflow-y-auto">
                {isTyping ? (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-sm text-blue-300/70 truncate">{progressLog || 'Processing...'}</span>
                  </div>
                ) : (
                  <p className="text-sm text-blue-50 line-clamp-4">{lastResponse}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bright Data branding bar - above input */}
        <a
          href="https://brightdata.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit flex-col items-center justify-center gap-1 mb-2 px-5 py-2.5 mx-auto rounded-full"
          style={{
            background: 'rgba(20, 28, 47, 0.9)',
            border: '1px solid #2D3B55',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span className="text-[10px] font-medium whitespace-nowrap leading-none" style={{ color: '#B7C9DE' }}>
            Agentic enrichment layer
          </span>
          <img src={brightdataLogo} alt="Bright Data" className="h-5 object-contain" />
        </a>

        {/* Input area */}
        <div
          className="rounded-full shadow-xl"
          style={{
            background: 'rgba(20, 28, 47, 0.95)',
            border: '1px solid #2D3B55',
            backdropFilter: 'blur(8px)',
          }}
        >
          <form onSubmit={handleSubmit} className="flex items-center gap-1.5 p-1.5">
          {/* Fast/Deep mode toggle */}
          <button
            type="button"
            onClick={() => setFastMode(!fastMode)}
            className="flex-shrink-0 flex items-center h-7 rounded-full overflow-hidden"
            style={{
              background: '#1E293B',
              border: '1px solid #2D3B55',
            }}
            title={fastMode ? 'Fast Mode - Click for Deep Search' : 'Deep Search - Click for Fast Mode'}
          >
            <span
              className="px-2 py-1 text-[10px] font-semibold transition-all rounded-full"
              style={{
                background: !fastMode ? '#0066FF' : 'transparent',
                color: !fastMode ? '#FFFFFF' : '#64748B',
              }}
            >
              Deep
            </span>
            <span
              className="px-2 py-1 text-[10px] font-semibold transition-all rounded-full"
              style={{
                background: fastMode ? '#FF521C' : 'transparent',
                color: fastMode ? '#FFFFFF' : '#64748B',
              }}
            >
              Fast
            </span>
          </button>

          {/* Input */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about places..."
            disabled={isTyping}
            className="flex-1 min-w-0 px-3 py-2 bg-transparent focus:outline-none text-sm"
            style={{ color: '#FFFFFF' }}
          />

          {/* Send button */}
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="flex-shrink-0 p-2 rounded-full flex items-center justify-center transition-all border-0"
            style={{
              background: !input.trim() || isTyping ? '#1E293B' : '#0066FF',
              color: !input.trim() || isTyping ? '#64748B' : '#FFFFFF',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>

          {/* Clear history button */}
          <button
            type="button"
            onClick={handleClearHistory}
            className="flex-shrink-0 p-2 rounded-full flex items-center justify-center transition-all"
            style={{
              background: 'transparent',
              border: '1px solid #2D3B55',
              color: '#94A3B8',
            }}
            title="Clear history and start fresh"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </button>

          {/* Expand button */}
          <button
            type="button"
            onClick={onExpandClick}
            className="flex-shrink-0 p-2 rounded-full flex items-center justify-center transition-all"
            style={{
              background: 'transparent',
              border: '1px solid #2D3B55',
              color: '#94A3B8',
            }}
            title="Expand chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
          </button>
        </form>
      </div>
      </div>

      {/* Limit Reached Modal */}
      <LimitReachedModal isOpen={showLimitModal} />
    </div>
  );
}
