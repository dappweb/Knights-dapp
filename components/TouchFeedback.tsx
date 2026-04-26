import React, { useState, useRef } from 'react';

interface TouchFeedbackProps {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onTap?: () => void;
  hapticFeedback?: boolean;
  rippleColor?: string;
}

const TouchFeedback: React.FC<TouchFeedbackProps> = ({
  children,
  className = '',
  disabled = false,
  onTap,
  hapticFeedback = true,
  rippleColor = 'rgba(255, 255, 255, 0.3)'
}) => {
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const rippleIdRef = useRef(0);

  const createRipple = (event: React.TouchStart | React.MouseEvent) => {
    if (disabled) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = ('touches' in event ? event.touches[0].clientX : event.clientX) - rect.left;
    const y = ('touches' in event ? event.touches[0].clientY : event.clientY) - rect.top;

    const newRipple = {
      id: rippleIdRef.current++,
      x,
      y
    };

    setRipples(prev => [...prev, newRipple]);

    // Haptic feedback for mobile devices
    if (hapticFeedback && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }

    // Remove ripple after animation
    setTimeout(() => {
      setRipples(prev => prev.filter(ripple => ripple.id !== newRipple.id));
    }, 600);
  };

  const handleInteraction = (event: React.TouchStart | React.MouseEvent) => {
    createRipple(event);
    if (onTap) {
      onTap();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'} ${className}`}
      onTouchStart={handleInteraction}
      onMouseDown={handleInteraction}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {children}
      
      {/* Ripple effects */}
      {ripples.map(ripple => (
        <div
          key={ripple.id}
          className="absolute pointer-events-none animate-ping"
          style={{
            left: ripple.x - 10,
            top: ripple.y - 10,
            width: 20,
            height: 20,
            borderRadius: '50%',
            backgroundColor: rippleColor,
            transform: 'scale(0)',
            animation: 'ripple 0.6s ease-out'
          }}
        />
      ))}
      
      <style jsx>{`
        @keyframes ripple {
          to {
            transform: scale(4);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default TouchFeedback;