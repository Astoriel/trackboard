"use client";

import { GitBranch, User, Clock } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";

interface Version {
  id: string;
  version_number: number;
  change_summary?: string;
  created_at: string;
  author?: { name: string };
}

interface VersionTimelineProps {
  versions: Version[];
  currentVersion?: number;
  onViewDiff?: (versionId: string) => void;
  onRestore?: (versionId: string, versionNumber: number) => void;
}

export function VersionTimeline({
  versions,
  currentVersion,
  onViewDiff,
  onRestore,
}: VersionTimelineProps) {
  return (
    <div className="relative space-y-4">
      {/* Vertical line */}
      <div className="absolute left-5 top-6 bottom-0 w-px bg-[var(--border)]" />

      {versions.map((v, i) => {
        const isCurrent = v.version_number === currentVersion;
        return (
          <div key={v.id} className="relative pl-12">
            {/* Dot */}
            <div
              className={`absolute left-3.5 top-3.5 h-3 w-3 rounded-full border-2 ${
                isCurrent
                  ? "border-emerald-500 bg-emerald-500"
                  : "border-[var(--border)] bg-[var(--surface)]"
              }`}
            />

            <div className="rounded-xl border bg-[var(--surface)] p-4 hover:border-[var(--border-focus)] transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">
                      v{v.version_number}
                    </span>
                    {isCurrent && <StatusBadge status="active" />}
                  </div>
                  {v.change_summary && (
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {v.change_summary}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                    {v.author && (
                      <span className="flex items-center gap-1">
                        <User size={11} />
                        {v.author.name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {new Date(v.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onViewDiff && !isCurrent && (
                    <button
                      onClick={() => onViewDiff(v.id)}
                      className="btn-secondary text-xs py-1 px-2.5"
                    >
                      View Diff
                    </button>
                  )}
                  {onRestore && !isCurrent && (
                    <button
                      onClick={() => onRestore(v.id, v.version_number)}
                      className="btn-ghost text-xs py-1 px-2.5"
                    >
                      Restore
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {versions.length === 0 && (
        <div className="flex items-center gap-2 pl-4 text-sm text-[var(--text-muted)] py-8">
          <GitBranch size={16} />
          No versions yet. Publish your plan to create the first snapshot.
        </div>
      )}
    </div>
  );
}
