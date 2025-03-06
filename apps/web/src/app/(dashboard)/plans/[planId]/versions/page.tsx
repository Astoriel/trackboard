"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  GitBranch,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { versionsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { toast } from "@/store/toast";

interface Version {
  id: string;
  version_number: number;
  author_name: string | null;
  change_summary: string | null;
  created_at: string;
  compatibility_report: {
    breaking: boolean;
    checks: Array<{ code: string; message: string }>;
  };
  publish_kind: string;
  published_from_revision: number;
  restored_from_version_id: string | null;
}

interface DiffResult {
  version_a: number;
  version_b: number;
  added_events: string[];
  removed_events: string[];
  modified_events: Array<{
    event_name: string;
    added_properties: string[];
    removed_properties: string[];
    changed_properties: Array<{ name: string; before: unknown; after: unknown }>;
  }>;
}

export default function VersionsPage() {
  const { planId } = useParams<{ planId: string }>();
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const loadVersions = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const response = await versionsApi.list(planId);
      setVersions(response.data);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    loadVersions().catch((error) => {
      console.error(error);
      toast.error("Failed to load versions", "Could not load version history.");
      setLoading(false);
    });
  }, [loadVersions]);

  const restoreVersion = async (versionId: string, versionNumber: number) => {
    if (
      !confirm(
        `Restore workspace from version ${versionNumber}? This updates the draft workspace and still requires a new publish.`,
      )
    ) {
      return;
    }

    setRestoringId(versionId);
    try {
      const response = await versionsApi.restore(versionId);
      toast.success(
        "Workspace restored",
        `Draft revision is now r${response.data.draft_revision}. Publish from main when ready.`,
      );
    } catch (error) {
      console.error(error);
      toast.error("Restore failed", "Could not restore this version.");
    } finally {
      setRestoringId(null);
    }
  };

  const compareVersions = async () => {
    if (!selectedA || !selectedB) return;

    setDiffLoading(true);
    try {
      const response = await versionsApi.diff(selectedA, selectedB);
      setDiff(response.data);
    } finally {
      setDiffLoading(false);
    }
  };

  const toggleSelection = (versionId: string) => {
    if (selectedA === versionId) {
      setSelectedA(null);
      setDiff(null);
      return;
    }

    if (selectedB === versionId) {
      setSelectedB(null);
      setDiff(null);
      return;
    }

    if (!selectedA) {
      setSelectedA(versionId);
      return;
    }

    if (!selectedB) {
      setSelectedB(versionId);
      return;
    }

    setSelectedA(versionId);
    setSelectedB(null);
    setDiff(null);
  };

  return (
    <div className="page-pad fade-in-up max-w-6xl">
      <div className="mb-6">
        <p className="section-label mb-3">Published ledger</p>
        <h2 className="editorial-title text-4xl">
          <span className="serif-italic">Published</span> versions
        </h2>
        <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--text-secondary)]">
          Published history for the main workspace, including compatibility reports and rollback
          publishes.
        </p>
      </div>

      {(selectedA || selectedB) && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <ArrowLeftRight size={16} className="text-brand-400" />
            <span>
              Compare{" "}
              <strong className="text-[var(--text-primary)]">
                v{versions.find((item) => item.id === selectedA)?.version_number ?? "?"}
              </strong>{" "}
              with{" "}
              <strong className="text-[var(--text-primary)]">
                {selectedB
                  ? `v${versions.find((item) => item.id === selectedB)?.version_number ?? "?"}`
                  : "another version"}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={compareVersions}
              disabled={!selectedA || !selectedB || diffLoading}
              className="btn-primary flex items-center gap-2 text-xs"
            >
              {diffLoading ? <RefreshCw size={13} className="animate-spin" /> : <ArrowLeftRight size={13} />}
              {diffLoading ? "Comparing..." : "Compare"}
            </button>
            <button
              onClick={() => {
                setSelectedA(null);
                setSelectedB(null);
                setDiff(null);
              }}
              className="btn-secondary text-xs"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {diff && (
        <div className="card mb-6">
          <h3 className="mb-4 text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">
            Diff summary: v{diff.version_a} → v{diff.version_b}
          </h3>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.5rem] border bg-[var(--surface-2)] p-4" style={{ borderColor: "var(--border)" }}>
              <p className="section-label text-emerald-600">Added events</p>
              <p className="metric-number mt-2 text-3xl text-[var(--text-primary)]">
                {diff.added_events.length}
              </p>
            </div>
            <div className="rounded-[1.5rem] border bg-[var(--surface-2)] p-4" style={{ borderColor: "var(--border)" }}>
              <p className="section-label text-red-600">Removed events</p>
              <p className="metric-number mt-2 text-3xl text-[var(--text-primary)]">
                {diff.removed_events.length}
              </p>
            </div>
            <div className="rounded-[1.5rem] border bg-[var(--surface-2)] p-4" style={{ borderColor: "var(--border)" }}>
              <p className="section-label text-amber-600">Modified events</p>
              <p className="metric-number mt-2 text-3xl text-[var(--text-primary)]">
                {diff.modified_events.length}
              </p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-xl" style={{ background: "var(--surface-2)" }} />
          ))}
        </div>
      ) : versions.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <GitBranch size={40} className="mb-3 opacity-20" />
          <p className="font-medium text-[var(--text-primary)]">No versions yet</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Publish from main to create the first immutable version.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {versions.map((version, index) => {
            const selected = selectedA === version.id || selectedB === version.id;
            const checkCount = version.compatibility_report?.checks?.length ?? 0;

            return (
              <div
                key={version.id}
                role="button"
                tabIndex={0}
                onClick={() => toggleSelection(version.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleSelection(version.id);
                  }
                }}
                className={`card block w-full text-left transition-all hover:-translate-y-0.5 ${
                  selected ? "ring-2 ring-black/10" : "hover:border-[var(--border-strong)]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white">
                        v{version.version_number}
                      </span>
                      <span
                        className="rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        {version.publish_kind}
                      </span>
                      <span
                        className="rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        revision r{version.published_from_revision}
                      </span>
                      {version.compatibility_report?.breaking && (
                        <span className="rounded-full border border-amber-400/30 px-2.5 py-1 text-[10px] uppercase tracking-wide text-amber-400">
                          breaking changes acknowledged
                        </span>
                      )}
                    </div>
                    <p className="mt-3 font-medium text-[var(--text-primary)]">
                      {version.change_summary || `Version ${version.version_number}`}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      by {version.author_name || "Unknown"} · {formatDate(version.created_at)}
                    </p>
                    {version.restored_from_version_id && (
                      <p className="mt-2 text-xs text-[var(--text-secondary)]">
                        This version was published from a restored snapshot.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <ShieldAlert size={13} />
                      {checkCount} compatibility check{checkCount === 1 ? "" : "s"}
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void restoreVersion(version.id, version.version_number);
                      }}
                      disabled={restoringId === version.id}
                      className="btn-secondary flex items-center gap-2 text-xs"
                    >
                      {restoringId === version.id ? (
                        <RefreshCw size={13} className="animate-spin" />
                      ) : (
                        <RotateCcw size={13} />
                      )}
                      {restoringId === version.id ? "Restoring..." : "Restore to draft"}
                    </button>
                    {index === 0 && (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                        <AlertTriangle size={12} />
                        latest published
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
