"use client";

import { useRef, useEffect, useCallback, useState } from "react";

/**
 * Debounced auto-save hook.
 * Calls `saveFn` after `delay` ms of inactivity.
 */
export function useAutoSave<T>(
  value: T,
  saveFn: (value: T) => Promise<void>,
  delay = 800
) {
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  const save = useCallback(
    async (v: T) => {
      setSaving(true);
      try {
        await saveFn(v);
        setLastSaved(new Date());
      } finally {
        setSaving(false);
      }
    },
    [saveFn]
  );

  useEffect(() => {
    // Skip first render
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(value), delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delay, save]);

  return { saving, lastSaved };
}
