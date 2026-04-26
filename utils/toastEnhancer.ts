import toast from 'react-hot-toast';

export interface EnhancedToastOptions {
  duration?: number;
  icon?: string;
  position?: 'top-center' | 'top-right' | 'bottom-center' | 'bottom-right';
  style?: React.CSSProperties;
}

export class ToastEnhancer {
  // Global flag to control error notifications
  private static errorNotificationsEnabled = false;

  static enableErrorNotifications(enabled: boolean = true) {
    this.errorNotificationsEnabled = enabled;
  }

  static success(message: string, options: EnhancedToastOptions = {}) {
    return toast.success(message, {
      duration: options.duration || 4000,
      icon: options.icon || '🎉',
      position: options.position || 'top-center',
      style: {
        background: 'rgba(16, 185, 129, 0.1)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        color: '#10b981',
        backdropFilter: 'blur(8px)',
        ...options.style
      }
    });
  }

  static error(message: string, options: EnhancedToastOptions = {}) {
    // Check if error notifications are disabled
    if (!this.errorNotificationsEnabled) {
      console.warn('Error notification suppressed:', message);
      return null;
    }

    return toast.error(message, {
      duration: options.duration || 5000,
      icon: options.icon || '❌',
      position: options.position || 'top-center',
      style: {
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        color: '#ef4444',
        backdropFilter: 'blur(8px)',
        ...options.style
      }
    });
  }

  static loading(message: string, options: EnhancedToastOptions & { id?: string } = {}) {
    return toast.loading(message, {
      id: options.id,
      icon: options.icon || '⏳',
      position: options.position || 'top-center',
      style: {
        background: 'rgba(59, 130, 246, 0.1)',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        color: '#3b82f6',
        backdropFilter: 'blur(8px)',
        ...options.style
      }
    });
  }

  static warning(message: string, options: EnhancedToastOptions = {}) {
    return toast(message, {
      duration: options.duration || 4000,
      icon: options.icon || '⚠️',
      position: options.position || 'top-center',
      style: {
        background: 'rgba(245, 158, 11, 0.1)',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        color: '#f59e0b',
        backdropFilter: 'blur(8px)',
        ...options.style
      }
    });
  }

  static info(message: string, options: EnhancedToastOptions = {}) {
    return toast(message, {
      duration: options.duration || 3000,
      icon: options.icon || 'ℹ️',
      position: options.position || 'top-center',
      style: {
        background: 'rgba(99, 102, 241, 0.1)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        color: '#6366f1',
        backdropFilter: 'blur(8px)',
        ...options.style
      }
    });
  }

  static transaction = {
    pending: (message: string, id: string) => this.loading(`⏳ ${message}`, { id }),
    success: (message: string, id: string) => toast.success(`🎉 ${message}`, { id }),
    error: (message: string, id: string) => {
      if (!this.errorNotificationsEnabled) {
        console.warn('Transaction error notification suppressed:', message);
        return null;
      }
      return toast.error(`❌ ${message}`, { id });
    }
  };
}

export default ToastEnhancer;