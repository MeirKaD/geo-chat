import { useState, useEffect, useCallback } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
  minDuration?: number;
}

// Particle component for the background effect
function Particle({ delay, duration, startX, startY }: { delay: number; duration: number; startX: number; startY: number }) {
  return (
    <div
      className="absolute w-1 h-1 bg-blue-400 rounded-full opacity-0"
      style={{
        left: `${startX}%`,
        top: `${startY}%`,
        animation: `particleFloat ${duration}s ease-in-out ${delay}s infinite`,
        boxShadow: '0 0 6px 2px rgba(59, 130, 246, 0.5)',
      }}
    />
  );
}

// Grid line component
function GridLine({ orientation, position, delay }: { orientation: 'horizontal' | 'vertical'; position: number; delay: number }) {
  const isHorizontal = orientation === 'horizontal';
  return (
    <div
      className="absolute bg-gradient-to-r from-transparent via-blue-500/20 to-transparent"
      style={{
        [isHorizontal ? 'top' : 'left']: `${position}%`,
        [isHorizontal ? 'left' : 'top']: 0,
        [isHorizontal ? 'width' : 'height']: '100%',
        [isHorizontal ? 'height' : 'width']: '1px',
        animation: `gridPulse 3s ease-in-out ${delay}s infinite`,
        opacity: 0.3,
      }}
    />
  );
}

// Data stream effect
function DataStream({ left, delay }: { left: number; delay: number }) {
  return (
    <div
      className="absolute w-px h-32 opacity-0"
      style={{
        left: `${left}%`,
        top: '-10%',
        background: 'linear-gradient(180deg, transparent, rgba(59, 130, 246, 0.8), rgba(255, 82, 28, 0.6), transparent)',
        animation: `dataStream 2s ease-in ${delay}s infinite`,
      }}
    />
  );
}

// Orbiting dot
function OrbitDot({ radius, duration, startAngle, color }: { radius: number; duration: number; startAngle: number; color: string }) {
  return (
    <div
      className="absolute w-2 h-2 rounded-full"
      style={{
        left: '50%',
        top: '50%',
        marginLeft: '-4px',
        marginTop: '-4px',
        background: color,
        boxShadow: `0 0 10px 3px ${color}`,
        animation: `orbit ${duration}s linear infinite`,
        transformOrigin: `4px calc(${radius}px + 4px)`,
        transform: `rotate(${startAngle}deg)`,
      }}
    />
  );
}

export default function SplashScreen({ onComplete, minDuration = 3500 }: SplashScreenProps) {
  const [phase, setPhase] = useState<'loading' | 'revealing' | 'complete'>('loading');
  const [progress, setProgress] = useState(0);

  const handleComplete = useCallback(() => {
    setPhase('complete');
    setTimeout(onComplete, 800);
  }, [onComplete]);

  useEffect(() => {
    // Animate progress bar
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 2;
      });
    }, minDuration / 50);

    // Transition to reveal phase
    const revealTimer = setTimeout(() => {
      setPhase('revealing');
    }, minDuration - 800);

    // Complete the splash
    const completeTimer = setTimeout(() => {
      handleComplete();
    }, minDuration);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(revealTimer);
      clearTimeout(completeTimer);
    };
  }, [minDuration, handleComplete]);

  // Generate particles
  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    delay: Math.random() * 3,
    duration: 3 + Math.random() * 2,
    startX: Math.random() * 100,
    startY: Math.random() * 100,
  }));

  // Generate grid lines
  const gridLines = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: `h${i}`, orientation: 'horizontal' as const, position: (i + 1) * 12.5, delay: i * 0.1 })),
    ...Array.from({ length: 8 }, (_, i) => ({ id: `v${i}`, orientation: 'vertical' as const, position: (i + 1) * 12.5, delay: i * 0.1 })),
  ];

  // Generate data streams
  const dataStreams = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    left: 5 + i * 8,
    delay: Math.random() * 2,
  }));

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden transition-opacity duration-700 ${
        phase === 'complete' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        background: 'radial-gradient(ellipse at center, #0F172A 0%, #020617 50%, #000000 100%)',
      }}
    >
      {/* Animated grid background */}
      <div className="absolute inset-0 overflow-hidden opacity-50">
        {gridLines.map(line => (
          <GridLine key={line.id} orientation={line.orientation} position={line.position} delay={line.delay} />
        ))}
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden">
        {particles.map(p => (
          <Particle key={p.id} delay={p.delay} duration={p.duration} startX={p.startX} startY={p.startY} />
        ))}
      </div>

      {/* Data streams falling */}
      <div className="absolute inset-0 overflow-hidden">
        {dataStreams.map(stream => (
          <DataStream key={stream.id} left={stream.left} delay={stream.delay} />
        ))}
      </div>

      {/* Central glow effect */}
      <div
        className="absolute w-96 h-96 rounded-full opacity-30"
        style={{
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(255, 82, 28, 0.2) 40%, transparent 70%)',
          animation: 'centralPulse 4s ease-in-out infinite',
        }}
      />

      {/* Orbiting elements */}
      <div className="absolute" style={{ width: '300px', height: '300px' }}>
        <OrbitDot radius={120} duration={8} startAngle={0} color="rgba(59, 130, 246, 0.8)" />
        <OrbitDot radius={120} duration={8} startAngle={120} color="rgba(255, 82, 28, 0.8)" />
        <OrbitDot radius={120} duration={8} startAngle={240} color="rgba(59, 130, 246, 0.8)" />
        <OrbitDot radius={150} duration={12} startAngle={60} color="rgba(255, 82, 28, 0.6)" />
        <OrbitDot radius={150} duration={12} startAngle={180} color="rgba(59, 130, 246, 0.6)" />
        <OrbitDot radius={150} duration={12} startAngle={300} color="rgba(255, 82, 28, 0.6)" />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Logo container with glow */}
        <div
          className={`relative transition-all duration-1000 ${
            phase === 'revealing' ? 'scale-110' : 'scale-100'
          }`}
          style={{
            animation: 'logoFloat 3s ease-in-out infinite',
          }}
        >
          {/* Outer glow ring */}
          <div
            className="absolute -inset-8 rounded-full opacity-60"
            style={{
              background: 'conic-gradient(from 0deg, rgba(59, 130, 246, 0.5), rgba(255, 82, 28, 0.5), rgba(59, 130, 246, 0.5))',
              animation: 'rotateGlow 4s linear infinite',
              filter: 'blur(20px)',
            }}
          />

          {/* Inner glow */}
          <div
            className="absolute -inset-4 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)',
              animation: 'innerPulse 2s ease-in-out infinite',
            }}
          />

          {/* Logo */}
          <div
            className="relative bg-slate-900/80 backdrop-blur-xl rounded-2xl p-8 border border-blue-500/30"
            style={{
              boxShadow: '0 0 60px rgba(59, 130, 246, 0.3), inset 0 0 30px rgba(59, 130, 246, 0.1)',
            }}
          >
            <img
              src="https://congreso.america-digital.com/wp-content/uploads/2022/07/BRIGHT-DATA.png.webp"
              alt="Bright Data"
              className="h-16 md:h-20 object-contain relative z-10"
              style={{
                filter: 'drop-shadow(0 0 20px rgba(59, 130, 246, 0.5))',
              }}
            />
          </div>
        </div>

        {/* Tagline */}
        <div
          className="mt-10 text-center"
          style={{
            animation: 'fadeSlideUp 1s ease-out 0.5s both',
          }}
        >
          <h2
            className="text-xl md:text-2xl font-light tracking-[0.3em] uppercase"
            style={{
              background: 'linear-gradient(90deg, #60A5FA, #FFFFFF, #FB923C)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 0 40px rgba(59, 130, 246, 0.5)',
            }}
          >
            Geo Intelligence
          </h2>
          <p
            className="mt-2 text-sm text-slate-400 tracking-widest"
            style={{
              animation: 'fadeSlideUp 1s ease-out 0.8s both',
            }}
          >
            Powered by The world's largest data network
          </p>
        </div>

        {/* Progress bar */}
        <div
          className="mt-12 w-64 h-1 bg-slate-800 rounded-full overflow-hidden"
          style={{
            animation: 'fadeSlideUp 1s ease-out 1s both',
          }}
        >
          <div
            className="h-full rounded-full transition-all duration-100"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #3B82F6, #FF521C)',
              boxShadow: '0 0 20px rgba(59, 130, 246, 0.8)',
            }}
          />
        </div>

        {/* Loading text */}
        <p
          className="mt-4 text-xs text-slate-500 tracking-widest uppercase"
          style={{
            animation: 'textPulse 1.5s ease-in-out infinite',
          }}
        >
          {phase === 'revealing' ? 'Initializing...' : 'Loading Experience'}
        </p>
      </div>

      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-32 h-32 border-l-2 border-t-2 border-blue-500/30" style={{ animation: 'cornerPulse 2s ease-in-out infinite' }} />
      <div className="absolute top-0 right-0 w-32 h-32 border-r-2 border-t-2 border-orange-500/30" style={{ animation: 'cornerPulse 2s ease-in-out infinite 0.5s' }} />
      <div className="absolute bottom-0 left-0 w-32 h-32 border-l-2 border-b-2 border-orange-500/30" style={{ animation: 'cornerPulse 2s ease-in-out infinite 1s' }} />
      <div className="absolute bottom-0 right-0 w-32 h-32 border-r-2 border-b-2 border-blue-500/30" style={{ animation: 'cornerPulse 2s ease-in-out infinite 1.5s' }} />

      {/* Scan line effect */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(59, 130, 246, 0.1) 2px, rgba(59, 130, 246, 0.1) 4px)',
          animation: 'scanLines 8s linear infinite',
        }}
      />
    </div>
  );
}
