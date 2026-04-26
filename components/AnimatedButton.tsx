import React from 'react';
import { Loader2 } from 'lucide-react';

interface AnimatedButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'md',
  className = '',
  icon,
  fullWidth = false
}) => {
  const baseClasses = `
    relative overflow-hidden font-bold rounded-xl transition-all duration-200 
    transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
    flex items-center justify-center gap-2
  `;

  const variantClasses = {
    primary: 'bg-gradient-to-r from-amber-400 to-amber-700 hover:from-amber-300 hover:to-amber-600 text-[#070B10] shadow-lg shadow-amber-500/30 hover:shadow-amber-500/40',
    secondary: 'bg-[#101820] hover:bg-[#16212B] text-white border border-amber-500/20 shadow-lg hover:shadow-xl',
    success: 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/40',
    warning: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-lg shadow-amber-500/40',
    danger: 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white shadow-lg shadow-rose-500/40'
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-3 text-base',
    lg: 'px-6 py-4 text-lg'
  };

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${widthClass}
        ${className}
      `}
    >
      {/* Shimmer effect for primary buttons */}
      {variant === 'primary' && (
        <div className="absolute inset-0 bg-white/20 translate-x-[-100%] animate-[shimmer_2s_infinite]"></div>
      )}
      
      {/* Hover effect for secondary buttons */}
      {variant === 'secondary' && (
        <div className="absolute inset-0 bg-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
      )}

      {/* Ripple effect */}
      <div className="absolute inset-0 overflow-hidden rounded-xl">
        <div className="absolute inset-0 bg-white/10 scale-0 rounded-full transition-transform duration-300 group-active:scale-150"></div>
      </div>

      {/* Content */}
      <div className="relative flex items-center justify-center gap-2">
        {loading && <Loader2 className="animate-spin" size={20} />}
        {!loading && icon && icon}
        <span>{children}</span>
      </div>
    </button>
  );
};

export default AnimatedButton;
