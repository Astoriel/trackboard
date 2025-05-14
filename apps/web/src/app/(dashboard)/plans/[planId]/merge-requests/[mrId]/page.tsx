"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, GitMerge, RefreshCw } from "lucide-react";
import { mergeRequestsApi, plansApi } from "@/lib/api";
import { toast } from "@/store/toast";

interface MergeRequest {
  id: string;
  title: string;
  description: string | null;
  status: string;
  main_plan_id: string;
  branch_plan_id: string;
  source_revision: number;
  target_revision: number;
  diff_summary: {
    added_events: string[];
    removed_events: string[];
    modified_events: Array<{
      event_name: string;
      added_properties: string[];
      removed_properties: string[];
      changed_properties: Array<{ name: string }>;
    }>;
  };
}

interface PlanReference {
  id: string;
  name: string;
  branch_name: string | null;
}

export default function MergeRequestReviewPage() {
  const { planId, mrId } = useParams<{ planId: string; mrId: string }>();
  const router = useRouter();

  const [mergeRequest, setMergeRequest] = useState<MergeRequest | null>(null);
  const [mainPlan, setMainPlan] = useState<PlanReference | null>(null);
  const [branchPlan, setBranchPlan] = useState<PlanReference | null>(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (!mrId) return;

    const load = async () => {
      try {
        const response = await mergeRequestsApi.get(mrId);
        const request = response.data as MergeRequest;
        setMergeRequest(request);

        const [mainResponse, branchResponse] = await Promise.all([
          plansApi.get(request.main_plan_id),
          plansApi.get(request.branch_plan_id),
        ]);
        setMainPlan(mainResponse.data);
        setBranchPlan(branchResponse.data);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load merge request", "Could not load review details.");
      }
    };

    void load();
  }, [mrId]);

  const handleMerge = async () => {
    if (!mrId) return;

    setMerging(true);
    try {
      await mergeRequestsApi.merge(mrId);
      toast.success("Merged", "Changes are now in main. Publish from main when ready.");
      router.push(`/plans/${planId}`);
    } catch (error: any) {
      console.error(error);
      toast.error("Merge failed", error?.response?.data?.message ?? "Please refresh and try again.");
      setMerging(false);
    }
  };

  if (!mergeRequest || !mainPlan || !branchPlan) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="page-pad fade-in-up mx-auto flex h-full w-full max-w-6xl flex-col">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push(`/plans/${planId}/merge-requests`)} className="btn-secondary p-3">
            <ArrowLeft size={16} />
          </button>
          <div>
            <p className="section-label mb-3">Merge request</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="editorial-title text-4xl">
                {mergeRequest.title}
              </h1>
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide ${
                  mergeRequest.status === "merged"
                    ? "border-purple-400/30 text-purple-400"
                    : "border-emerald-400/30 text-emerald-400"
                }`}
              >
                {mergeRequest.status}
              </span>
            </div>
            <p className="mt-3 text-sm font-medium italic text-[var(--text-secondary)]">
              {branchPlan.branch_name || "branch"} -&gt; {mainPlan.branch_name || "main"}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              source r{mergeRequest.source_revision} / target r{mergeRequest.target_revision}
            </p>
          </div>
        </div>

        {mergeRequest.status === "open" && (
          <button onClick={handleMerge} disabled={merging} className="btn-primary flex items-center gap-2">
            {merging ? <RefreshCw size={14} className="animate-spin" /> : <GitMerge size={14} />}
            {merging ? "Merging..." : "Merge into main"}
          </button>
        )}
      </div>

      {mergeRequest.description && (
        <div className="card mb-6">
          <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
            {mergeRequest.description}
          </p>
        </div>
      )}

      <div className="card mb-6">
        <h2 className="mb-4 text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">Diff summary</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[1.5rem] border bg-[var(--surface-2)] p-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-[10px] uppercase tracking-wide text-emerald-400">Added events</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
              {mergeRequest.diff_summary.added_events.length}
            </p>
          </div>
          <div className="rounded-[1.5rem] border bg-[var(--surface-2)] p-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-[10px] uppercase tracking-wide text-red-400">Removed events</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
              {mergeRequest.diff_summary.removed_events.length}
            </p>
          </div>
          <div className="rounded-[1.5rem] border bg-[var(--surface-2)] p-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-[10px] uppercase tracking-wide text-amber-400">Modified events</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
              {mergeRequest.diff_summary.modified_events.length}
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">Changed events</h2>
        <div className="space-y-3">
          {mergeRequest.diff_summary.modified_events.map((event) => (
            <div
              key={event.event_name}
              className="rounded-[1.5rem] border p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            >
              <p className="font-mono text-sm font-medium text-[var(--text-primary)]">
                {event.event_name}
              </p>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                +{event.added_properties.length} added / -{event.removed_properties.length} removed /{" "}
                {event.changed_properties.length} changed
              </p>
            </div>
          ))}
          {mergeRequest.diff_summary.modified_events.length === 0 && (
            <p className="text-sm text-[var(--text-secondary)]">No modified events in this merge request.</p>
          )}
        </div>
      </div>
    </div>
  );
}
