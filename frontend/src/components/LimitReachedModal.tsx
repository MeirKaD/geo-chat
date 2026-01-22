import React from 'react';
import brightdataLogo from '../assets/brightdata.svg';
import { LangChain } from '@lobehub/icons';
interface LimitReachedModalProps {
  isOpen: boolean;
}

export const LimitReachedModal: React.FC<LimitReachedModalProps> = ({ isOpen }) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fadeIn"
        style={{
          animation: 'fadeIn 0.3s ease-out'
        }}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="relative flex flex-col items-center gap-6 px-8 py-8 rounded-2xl shadow-2xl max-w-md w-full animate-scaleIn"
          style={{
            background: 'rgba(20, 28, 47, 0.95)',
            border: '2px solid #2D3B55',
            backdropFilter: 'blur(20px)',
            animation: 'scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}
        >
          {/* Agentic Enrichment Layer Card */}
          <div className="flex flex-col items-center text-center gap-2">
            <span className="text-[16px] font-semibold tracking-wide" style={{ color: '#FFFFFF' }}>
              Agentic enrichment layer
            </span>
            <span className="text-[13px] font-semibold" style={{ color: '#94A3B8' }}>
              Powered by
            </span>
            <div className="mt-2 flex items-center justify-center gap-4">
              <img
                src={brightdataLogo}
                alt="Bright Data"
                className="h-12 object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]"
              />
              <span className="text-[26px]">🤝</span>
              <LangChain
                size={64}
                color="#FFFFFF"
              />
            </div>
          </div>

          {/* Message */}
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2" style={{ color: '#FFFFFF' }}>
             It's just a Demo
            </h2>
            <p className="text-sm" style={{ color: '#94A3B8' }}>
            Built to demonstrate the power of Agentic AI. This app was brought to you by Bright Data.
            </p>
          </div>

          {/* CTAs */}
          <div className="flex flex-col gap-3 w-full">
            {/* Clone the repo button */}
            <a
              href="https://github.com/MeirKaD/geo-chat"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 px-6 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                color: '#FFFFFF',
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="flex-shrink-0"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Clone the repo
            </a>

            {/*  credits button */}
            <a
              href="https://brightdata.com/?hs_signup=1&utm_source=demos&utm_medium=geo-chat&utm_campaign=geo-chat&promo=geo-chat"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 px-6 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-[1.02] border-2"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                color: '#FFFFFF',
                borderColor: '#2D3B55',
              }}
            >
              Get free web access credits
            </a>
          </div>
        </div>
      </div>

      {/* Keyframes animations */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </>
  );
};
