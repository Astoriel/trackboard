"use client";

import { Search, X } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  debounce?: number;
  className?: string;
}

export function SearchInput({
  value: controlled,
  onChange,
  placeholder = "Search...",
  debounce = 300,
  className,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(controlled ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (controlled !== undefined) setLocalValue(controlled);
  }, [controlled]);

  const handleChange = useCallback(
    (val: string) => {
      setLocalValue(val);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onChange?.(val), debounce);
    },
    [onChange, debounce]
  );

  return (
    <div className={cn("relative flex items-center", className)}>
      <Search
        size={14}
        className="absolute left-3 text-[var(--text-muted)] pointer-events-none"
      />
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="input pl-9 pr-8"
      />
      {localValue && (
        <button
          onClick={() => handleChange("")}
          className="absolute right-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
