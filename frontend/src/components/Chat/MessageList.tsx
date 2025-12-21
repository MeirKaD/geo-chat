import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import type { Message } from './ChatContainer';

interface MessageListProps {
  messages: Message[];
  isTyping: boolean;
  progressLogs?: string[];
}

export default function MessageList({ messages, isTyping, progressLogs }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, progressLogs]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {isTyping && (
        <div className="flex flex-col items-start space-y-3">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-blue-800/30 rounded-2xl px-5 py-3 shadow-lg">
            <div className="flex space-x-1.5">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>

          {progressLogs && progressLogs.length > 0 && (
            <div className="w-full max-w-[80%] bg-slate-900/70 border border-blue-700/30 rounded-xl p-4 space-y-2">
              <div className="text-xs font-semibold text-blue-300 mb-2">Agent Progress:</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {progressLogs.map((log, index) => (
                  <div
                    key={index}
                    className="text-xs text-blue-100/80 font-mono flex items-start gap-2 animate-fadeIn"
                  >
                    <span className="text-blue-400 flex-shrink-0">→</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
