import { AlertTriangle, X } from "lucide-react";
import React from "react";
import toast from "react-hot-toast";

interface ErrorToastProps {
  message: string;
  toastId?: string;
}

const ErrorToast: React.FC<ErrorToastProps> = ({ message, toastId }) => {
  return (
    <div className="bg-rose-900/90 border border-rose-500/30 rounded-xl p-4 flex items-start gap-3 max-w-sm backdrop-blur-sm">
      <AlertTriangle size={18} className="text-rose-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-bold">鎿嶄綔澶辫触</p>
        <p className="text-rose-100 text-xs mt-1 break-words">{message}</p>
      </div>
      {toastId && (
        <button
          onClick={() => toast.dismiss(toastId)}
          className="text-slate-400 hover:text-white flex-shrink-0"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};

// 渚垮埄鍑芥暟
export const showError = (message: string) => {
  const id = `error-${Date.now()}`;
  toast.custom((t) => <ErrorToast message={message} toastId={t.id} />, {
    id,
    duration: 5000,
  });
};

export default ErrorToast;
