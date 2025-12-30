import { useState, useRef, type FormEvent } from 'react';
import { sendChatMessageStream } from '../../api/client';
import type { Message, MapData } from './ChatContainer';

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
  const [messages, setMessages] = useState<Message[]>([]);
  const threadIdRef = useRef<string>(crypto.randomUUID());

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

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
      setLastResponse('Sorry, I encountered an error. Please try again.');
    } finally {
      setIsTyping(false);
      setProgressLog('');
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 p-3 safe-area-bottom">
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

      {/* Bright Data branding bar */}
      <a
        href="https://brightdata.com"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 mb-2 px-3 py-1.5 mx-auto rounded-full"
        style={{
          background: 'rgba(20, 28, 47, 0.9)',
          border: '1px solid #2D3B55',
          backdropFilter: 'blur(8px)',
        }}
      >
        <img
          src="https://congreso.america-digital.com/wp-content/uploads/2022/07/BRIGHT-DATA.png.webp"
          alt="Bright Data"
          className="h-4 object-contain"
        />
        <span className="text-[9px] font-medium" style={{ color: '#94A3B8' }}>
          Agentic enrichment layer
        </span>
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
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
