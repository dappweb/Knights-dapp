import React, { useState, useRef, useEffect } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
}

const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children, className = "" }) => {
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  
  const THRESHOLD = 60;
  const MAX_PULL = 120;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      setStartY(e.touches[0].clientY);
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || refreshing) return;

    const y = e.touches[0].clientY;
    const diff = y - startY;

    if (window.scrollY === 0 && diff > 0) {
        // Logarithmic resistance
        const newY = Math.min(diff * 0.4, MAX_PULL);
        setCurrentY(newY);
        // Prevent default behavior if possible to stop rubber banding
        // Note: e.preventDefault() can't be called on passive listeners
    } else {
        setIsPulling(false);
        setCurrentY(0);
    }
  };

  const handleTouchEnd = async () => {
    setIsPulling(false);
    if (currentY >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setCurrentY(THRESHOLD); // Snap to threshold
      try {
        await onRefresh();
      } finally {
        // If the page doesn't reload (e.g. partial refresh), we reset
        setRefreshing(false);
        setCurrentY(0);
      }
    } else {
      setCurrentY(0);
    }
  };

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`min-h-screen ${className}`}
    >
      <div 
        className="flex items-center justify-center overflow-hidden w-full"
        style={{ 
          height: `${currentY}px`, 
          transition: isPulling ? 'none' : 'height 0.3s ease-out'
        }}
      >
        {refreshing ? (
           <div className="flex items-center gap-2 text-neon-400">
             <Loader2 className="animate-spin w-5 h-5" />
             <span className="text-sm font-medium">Refreshing...</span>
           </div>
        ) : (
           <div 
             className="flex items-center justify-center p-2 rounded-full bg-gray-800/50 border border-gray-700"
             style={{ 
                transform: `rotate(${currentY >= THRESHOLD ? 180 : 0}deg)`, 
                transition: 'transform 0.2s',
                opacity: currentY / THRESHOLD
             }}
           >
             <ArrowDown className="w-5 h-5 text-neon-400" />
           </div>
        )}
      </div>
      <div style={{ transition: 'transform 0.2s' }}>
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
