interface CustomMarkerProps {
  rating?: number;
  isHovered?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
}

export default function CustomMarker({
  rating,
  isHovered = false,
  onClick,
  onMouseEnter
}: CustomMarkerProps) {
  // Determine color based on rating
  const getMarkerColor = () => {
    if (!rating) return '#3B82F6'; // Default blue
    if (rating >= 4.5) return '#10B981'; // Green for excellent
    if (rating >= 4.0) return '#3B82F6'; // Blue for great
    if (rating >= 3.5) return '#F59E0B'; // Orange for good
    return '#EF4444'; // Red for poor
  };

  const color = getMarkerColor();

  return (
    <div
      className="cursor-pointer transition-transform duration-200"
      style={{
        transform: isHovered ? 'scale(1.2)' : 'scale(1)',
      }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <svg
        width="32"
        height="42"
        viewBox="0 0 32 42"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))',
        }}
      >
        {/* Pin shape */}
        <path
          d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26c0-8.837-7.163-16-16-16z"
          fill={color}
        />
        {/* Inner circle */}
        <circle cx="16" cy="16" r="6" fill="white" />
        {/* Rating indicator dot */}
        {rating && (
          <circle cx="16" cy="16" r="3" fill={color} />
        )}
      </svg>
      {/* Animated pulse effect on hover */}
      {isHovered && (
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: color,
            opacity: 0.3,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      )}
      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              transform: translate(-50%, 0) scale(1);
              opacity: 0.3;
            }
            50% {
              transform: translate(-50%, 0) scale(1.5);
              opacity: 0;
            }
          }
        `}
      </style>
    </div>
  );
}
