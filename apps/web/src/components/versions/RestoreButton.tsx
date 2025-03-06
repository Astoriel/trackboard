"use client";

import { useState } from "react";
import { RotateCcw, AlertTriangle } from "lucide-react";

interface RestoreButtonProps {
  versionNumber: number;
  onRestore: () => Promise<void>;
  disabled?: boolean;
}

export function RestoreButton({ versionNumber, onRestore, disabled }: RestoreButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRestore = async () => {
    setLoading(true);
    try {
      await onRestore();
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3">
        <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
        <p className="text-xs text-amber-700 flex-1">
          Restore to v{versionNumber}? Current state will be overwritten.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setConfirming(false)}
            className="btn-ghost text-xs py-1 px-2"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleRestore}
            className="btn-primary text-xs py-1 px-2"
            disabled={loading}
          >
            {loading ? "Restoring..." : "Confirm"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="btn-ghost text-xs py-1 px-2.5 flex items-center gap-1.5"
      disabled={disabled}
    >
      <RotateCcw size={12} />
      Restore
    </button>
  );
}
