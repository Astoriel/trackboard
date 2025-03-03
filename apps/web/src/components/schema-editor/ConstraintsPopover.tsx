"use client";

import { useState, useRef, useEffect } from "react";
import { Settings2 } from "lucide-react";

type PropertyType = "string" | "integer" | "float" | "boolean" | "array" | "object";

interface Constraints {
  enum_values?: string[];
  min?: number;
  max?: number;
  min_length?: number;
  max_length?: number;
  pattern?: string;
  min_items?: number;
  max_items?: number;
}

interface ConstraintsPopoverProps {
  type: PropertyType;
  constraints: Constraints;
  onChange: (constraints: Constraints) => void;
}

export function ConstraintsPopover({ type, constraints, onChange }: ConstraintsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<Constraints>(constraints);
  const [enumInput, setEnumInput] = useState(
    (constraints.enum_values ?? []).join(", ")
  );
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const update = (field: keyof Constraints, val: unknown) => {
    setLocal((prev) => {
      const next = { ...prev, [field]: val };
      if (val === "" || val === undefined || val === null) delete next[field];
      return next;
    });
  };

  const save = () => {
    const next: Constraints = { ...local };
    if (enumInput.trim()) {
      next.enum_values = enumInput.split(",").map((v) => v.trim()).filter(Boolean);
    } else {
      delete next.enum_values;
    }
    onChange(next);
    setOpen(false);
  };

  const hasConstraints =
    Object.keys(constraints).length > 0 &&
    !(Object.keys(constraints).length === 1 && constraints.enum_values?.length === 0);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setLocal(constraints);
          setEnumInput((constraints.enum_values ?? []).join(", "));
          setOpen((v) => !v);
        }}
        title="Constraints"
        className={`btn-ghost p-1 ${hasConstraints ? "text-amber-500" : "text-[var(--text-muted)]"}`}
      >
        <Settings2 size={13} />
      </button>

      {open && (
        <div className="absolute z-50 right-0 top-8 w-72 rounded-xl border bg-[var(--surface)] p-4 shadow-xl space-y-3">
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Constraints
          </p>

          {/* Enum values — shown for all types */}
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">
              Allowed values (comma-separated)
            </label>
            <input
              className="input text-xs"
              placeholder="e.g. google, email, apple"
              value={enumInput}
              onChange={(e) => setEnumInput(e.target.value)}
            />
          </div>

          {/* String constraints */}
          {type === "string" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Min length</label>
                  <input
                    className="input text-xs"
                    type="number"
                    min={0}
                    value={local.min_length ?? ""}
                    onChange={(e) => update("min_length", e.target.value === "" ? undefined : Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Max length</label>
                  <input
                    className="input text-xs"
                    type="number"
                    min={0}
                    value={local.max_length ?? ""}
                    onChange={(e) => update("max_length", e.target.value === "" ? undefined : Number(e.target.value))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Pattern (regex)</label>
                <input
                  className="input text-xs font-mono"
                  placeholder="e.g. ^[a-z]+$"
                  value={local.pattern ?? ""}
                  onChange={(e) => update("pattern", e.target.value || undefined)}
                />
              </div>
            </>
          )}

          {/* Numeric constraints */}
          {(type === "integer" || type === "float") && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Min</label>
                <input
                  className="input text-xs"
                  type="number"
                  value={local.min ?? ""}
                  onChange={(e) => update("min", e.target.value === "" ? undefined : Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Max</label>
                <input
                  className="input text-xs"
                  type="number"
                  value={local.max ?? ""}
                  onChange={(e) => update("max", e.target.value === "" ? undefined : Number(e.target.value))}
                />
              </div>
            </div>
          )}

          {/* Array constraints */}
          {type === "array" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Min items</label>
                <input
                  className="input text-xs"
                  type="number"
                  min={0}
                  value={local.min_items ?? ""}
                  onChange={(e) => update("min_items", e.target.value === "" ? undefined : Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Max items</label>
                <input
                  className="input text-xs"
                  type="number"
                  min={0}
                  value={local.max_items ?? ""}
                  onChange={(e) => update("max_items", e.target.value === "" ? undefined : Number(e.target.value))}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={() => setOpen(false)} className="btn-ghost text-xs py-1 px-2">
              Cancel
            </button>
            <button onClick={save} className="btn-primary text-xs py-1 px-3">
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
