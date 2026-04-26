import toast from 'react-hot-toast';

/**
 * Global Toast Configuration Utility
 * 
 * This utility provides centralized control over toast notifications,
 * allowing users to disable red error notifications while keeping
 * success and info notifications active.
 */

class ToastConfig {
  private static instance: ToastConfig;
  private errorNotificationsEnabled: boolean = true; // Default: enabled
  
  private constructor() {}
  
  static getInstance(): ToastConfig {
    if (!ToastConfig.instance) {
      ToastConfig.instance = new ToastConfig();
    }
    return ToastConfig.instance;
  }
  
  /**
   * Enable or disable error notifications globally
   */
  setErrorNotificationsEnabled(enabled: boolean): void {
    this.errorNotificationsEnabled = enabled;
    console.log(`Error notifications ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Check if error notifications are enabled
   */
  areErrorNotificationsEnabled(): boolean {
    return this.errorNotificationsEnabled;
  }
  
  /**
   * Wrapper for toast.error that respects the global setting
   */
  error(message: string, options?: any): string | null {
    if (!this.errorNotificationsEnabled) {
      console.warn('🔇 Error notification suppressed:', message);
      return null;
    }
    return toast.error(message, options);
  }
  
  /**
   * Always show success notifications (not affected by error setting)
   */
  success(message: string, options?: any): string {
    return toast.success(message, options);
  }
  
  /**
   * Always show loading notifications (not affected by error setting)
   */
  loading(message: string, options?: any): string {
    return toast.loading(message, options);
  }
  
  /**
   * Always show info notifications (not affected by error setting)
   */
  info(message: string, options?: any): string {
    return toast(message, options);
  }
  
  /**
   * Dismiss a specific toast
   */
  dismiss(toastId?: string): void {
    toast.dismiss(toastId);
  }
}

// Export singleton instance
export const toastConfig = ToastConfig.getInstance();

// Export convenience functions
export const enableErrorNotifications = (enabled: boolean = true) => {
  toastConfig.setErrorNotificationsEnabled(enabled);
};

export const disableErrorNotifications = () => {
  toastConfig.setErrorNotificationsEnabled(false);
};

// Override the global toast.error function
const originalToastError = toast.error;
toast.error = (message: string, options?: any) => {
  return toastConfig.error(message, options) || '';
};

export default toastConfig;