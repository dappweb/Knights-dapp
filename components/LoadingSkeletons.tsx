import React from 'react';

interface SkeletonProps {
  className?: string;
  animate?: boolean;
}

export const SkeletonBase: React.FC<SkeletonProps> = ({ 
  className = "", 
  animate = true 
}) => (
  <div 
    className={`bg-gray-700 rounded ${animate ? 'animate-pulse' : ''} ${className}`}
  />
);

export const SkeletonCard: React.FC<SkeletonProps> = ({ 
  className = "" 
}) => (
  <div className={`animate-pulse bg-gray-800/50 rounded-xl p-4 border border-gray-700 ${className}`}>
    <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
    <div className="h-8 bg-gray-700 rounded w-1/2 mb-2"></div>
    <div className="h-3 bg-gray-700 rounded w-full"></div>
  </div>
);

export const SkeletonButton: React.FC<SkeletonProps> = ({ 
  className = "" 
}) => (
  <div className={`animate-pulse bg-gray-700 rounded-xl h-12 ${className}`}></div>
);

export const SkeletonText: React.FC<{ 
  lines?: number; 
  className?: string;
}> = ({ 
  lines = 3, 
  className = "" 
}) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <SkeletonBase 
        key={i}
        className={`h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`}
      />
    ))}
  </div>
);

export const SkeletonAvatar: React.FC<{ 
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ 
  size = 'md', 
  className = "" 
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  };
  
  return (
    <SkeletonBase 
      className={`${sizeClasses[size]} rounded-full ${className}`}
    />
  );
};

export const SkeletonTable: React.FC<{ 
  rows?: number;
  columns?: number;
  className?: string;
}> = ({ 
  rows = 5, 
  columns = 4, 
  className = "" 
}) => (
  <div className={`space-y-3 ${className}`}>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={rowIndex} className="flex gap-4">
        {Array.from({ length: columns }).map((_, colIndex) => (
          <SkeletonBase 
            key={colIndex}
            className="h-4 flex-1"
          />
        ))}
      </div>
    ))}
  </div>
);

export const SkeletonStats: React.FC<{ 
  items?: number;
  className?: string;
}> = ({ 
  items = 4, 
  className = "" 
}) => (
  <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className}`}>
    {Array.from({ length: items }).map((_, i) => (
      <div key={i} className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <SkeletonBase className="h-3 w-16 mb-2" />
        <SkeletonBase className="h-8 w-20 mb-1" />
        <SkeletonBase className="h-3 w-12" />
      </div>
    ))}
  </div>
);

export const SkeletonChart: React.FC<SkeletonProps> = ({ 
  className = "" 
}) => (
  <div className={`bg-gray-800/50 rounded-xl p-6 border border-gray-700 ${className}`}>
    <SkeletonBase className="h-4 w-32 mb-4" />
    <div className="flex items-end gap-2 h-32">
      {Array.from({ length: 12 }).map((_, i) => (
        <SkeletonBase 
          key={i}
          className={`flex-1 bg-gray-600`}
          style={{ height: `${Math.random() * 80 + 20}%` }}
        />
      ))}
    </div>
  </div>
);

export const SkeletonList: React.FC<{ 
  items?: number;
  showAvatar?: boolean;
  className?: string;
}> = ({ 
  items = 5, 
  showAvatar = false, 
  className = "" 
}) => (
  <div className={`space-y-3 ${className}`}>
    {Array.from({ length: items }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
        {showAvatar && <SkeletonAvatar size="sm" />}
        <div className="flex-1">
          <SkeletonBase className="h-4 w-3/4 mb-1" />
          <SkeletonBase className="h-3 w-1/2" />
        </div>
        <SkeletonBase className="h-6 w-16" />
      </div>
    ))}
  </div>
);

// Specialized skeletons for specific components
export const SkeletonMiningPanel: React.FC = () => (
  <div className="space-y-6">
    {/* Step indicator skeleton */}
    <div className="flex items-center justify-center gap-4 mb-8">
      {[1, 2, 3].map((step) => (
        <div key={step} className="flex items-center">
          <SkeletonButton className="w-32 h-10" />
          {step < 3 && <div className="w-8 h-0.5 mx-2 bg-gray-800" />}
        </div>
      ))}
    </div>
    
    {/* Main content skeleton */}
    <SkeletonCard className="h-64" />
    
    {/* Grid layout skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <SkeletonCard className="h-48" />
      </div>
      <SkeletonCard className="h-48" />
    </div>
  </div>
);

export const SkeletonSwapPanel: React.FC = () => (
  <div className="max-w-md mx-auto space-y-4">
    <SkeletonBase className="h-8 w-32 mx-auto mb-6" />
    <SkeletonCard className="h-20" />
    <div className="flex justify-center">
      <SkeletonBase className="w-10 h-10 rounded-full" />
    </div>
    <SkeletonCard className="h-20" />
    <SkeletonButton className="w-full h-12" />
  </div>
);

export default {
  SkeletonBase,
  SkeletonCard,
  SkeletonButton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonTable,
  SkeletonStats,
  SkeletonChart,
  SkeletonList,
  SkeletonMiningPanel,
  SkeletonSwapPanel
};