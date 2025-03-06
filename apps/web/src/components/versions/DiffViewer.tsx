"use client";

import { Plus, Minus, Edit3 } from "lucide-react";

interface DiffEvent {
  event_name: string;
  changes?: Array<{ property: string; field: string; old: unknown; new: unknown }>;
}

interface VersionDiff {
  added_events?: DiffEvent[];
  removed_events?: DiffEvent[];
  modified_events?: DiffEvent[];
  version_a?: number;
  version_b?: number;
}

interface DiffViewerProps {
  diff: VersionDiff;
  versionA?: number;
  versionB?: number;
}

export function DiffViewer({ diff, versionA, versionB }: DiffViewerProps) {
  const hasChanges =
    diff.added_events?.length ||
    diff.removed_events?.length ||
    diff.modified_events?.length;

  return (
    <div className="space-y-4">
      {typeof versionA === "number" && typeof versionB === "number" && (
        <p className="text-xs text-[var(--text-muted)]">
          Comparing <span className="font-medium">v{versionA}</span> →{" "}
          <span className="font-medium">v{versionB}</span>
        </p>
      )}

      {!hasChanges && (
        <p className="text-sm text-[var(--text-muted)] py-4 text-center">
          No differences between these versions.
        </p>
      )}

      {diff.added_events?.map((ev) => (
        <div key={ev.event_name} className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <Plus size={14} />
            <span>{ev.event_name}</span>
            <span className="text-xs font-normal text-emerald-600/80">added</span>
          </div>
        </div>
      ))}

      {diff.removed_events?.map((ev) => (
        <div key={ev.event_name} className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-red-700">
            <Minus size={14} />
            <span>{ev.event_name}</span>
            <span className="text-xs font-normal text-red-600/80">removed</span>
          </div>
        </div>
      ))}

      {diff.modified_events?.map((ev) => (
        <div key={ev.event_name} className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700 mb-3">
            <Edit3 size={14} />
            <span>{ev.event_name}</span>
            <span className="text-xs font-normal text-amber-600/80">modified</span>
          </div>
          {ev.changes?.map((c, i) => (
            <div key={i} className="mt-1 text-xs font-mono rounded-lg border border-amber-200 bg-white dark:bg-amber-900/10 p-2">
              <span className="text-amber-700 font-semibold">{c.property}</span>
              {c.field !== "added" && c.field !== "removed" && (
                <>
                  <span className="text-red-500"> - {String(c.old)}</span>
                  <span className="text-emerald-600"> + {String(c.new)}</span>
                </>
              )}
              {c.field === "added" && <span className="text-emerald-600"> + {String(c.new)}</span>}
              {c.field === "removed" && <span className="text-red-500"> - {String(c.old)}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
