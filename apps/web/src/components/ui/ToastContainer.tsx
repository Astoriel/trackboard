"use client";

import { useEffect } from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { useToastStore, ToastType } from "@/store/toast";

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />,
  error: <AlertCircle size={16} className="text-red-500 flex-shrink-0" />,
  warning: <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />,
  info: <Info size={16} className="text-blue-500 flex-shrink-0" />,
};

const barColors: Record<ToastType, string> = {
  success: "bg-emerald-500",
  error: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="
            pointer-events-auto relative flex items-start gap-3 overflow-hidden
            rounded-xl border bg-[var(--surface)] px-4 py-3 shadow-lg
            animate-in slide-in-from-right-4 fade-in duration-300
            min-w-[300px] max-w-[400px]
          "
          role="alert"
        >
          {/* Colored left bar */}
          <div
            className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${barColors[t.type]}`}
          />
          <div className="ml-1 mt-0.5">{icons[t.type]}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">{t.title}</p>
            {t.message && (
              <p className="mt-0.5 text-xs text-[var(--text-muted)] break-words">{t.message}</p>
            )}
          </div>
          <button
            onClick={() => removeToast(t.id)}
            className="flex-shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
