import type { Message } from './ChatContainer';

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-5 py-3 shadow-lg ${
          isUser
            ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white'
            : 'bg-gradient-to-br from-slate-800 to-slate-900 text-blue-50 border border-blue-800/30'
        }`}
      >
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        <p className={`text-xs mt-2 ${isUser ? 'text-blue-200/80' : 'text-blue-400/60'}`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
