import { useState, type FormEvent } from 'react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
}

export default function ChatInput({ onSendMessage }: ChatInputProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="border-t border-blue-800/30 p-6 bg-slate-900/50 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="flex space-x-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me anything about places..."
          className="flex-1 px-6 py-3 bg-slate-800/50 border border-blue-700/40 rounded-full text-blue-50 placeholder-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-medium rounded-full hover:from-blue-500 hover:to-blue-600 disabled:from-slate-700 disabled:to-slate-800 disabled:cursor-not-allowed disabled:text-blue-400/50 transition-all shadow-lg hover:shadow-blue-500/25"
        >
          Send
        </button>
      </form>
    </div>
  );
}
