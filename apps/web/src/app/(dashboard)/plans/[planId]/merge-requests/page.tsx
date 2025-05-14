"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
    modified_events: Array<{ event_name: string }>;
  };
}

interface PlanReference {
  id: string;
  name: string;
  branch_name: string | null;
  is_main: boolean;
}

export default function MergeRequestsPage() {
  const { planId } = useParams<{ planId: string }>();
  const router = useRouter();

  const [plan, setPlan] = useState<PlanReference | null>(null);
  const [mergeRequests, setMergeRequests] = useState<MergeRequest[]>([]);
  const [planMap, setPlanMap] = useState<Record<string, PlanReference>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!planId) return;

    const load = async () => {
      setLoading(true);
      try {
        const planResponse = await plansApi.get(planId);
        setPlan(planResponse.data);

        const mergeRequestsResponse = await mergeRequestsApi.list(planId);
        const requests = mergeRequestsResponse.data;
        setMergeRequests(requests);

        const uniquePlanIds = Array.from(
          new Set<string>(
            requests.flatMap((mergeRequest: MergeRequest) => [
              mergeRequest.main_plan_id,
              mergeRequest.branch_plan_id,
            ]),
          ),
        );

        const references = await Promise.all(
          uniquePlanIds.map(async (id) => {
            const response = await plansApi.get(id);
            return response.data as PlanReference;
          }),
        );

        setPlanMap(
          references.reduce<Record<string, PlanReference>>((accumulator, reference) => {
            accumulator[reference.id] = reference;
            return accumulator;
          }, {}),
        );
      } catch (error) {
        console.error(error);
        toast.error("Failed to load review queue", "Could not load merge requests.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [planId]);

  return (
    <div className="page-pad fade-in-up mx-auto flex h-full w-full max-w-6xl flex-col">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.push(`/plans/${planId}`)} className="btn-secondary p-3">
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="section-label mb-3">Merge review</p>
        <h1 className="editorial-title text-4xl">
          Merge <span className="serif-italic">review</span>
        </h1>
          <p className="mt-3 text-sm font-medium text-[var(--text-secondary)]">
            Merge requests for {plan?.name || "this plan"}.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-xl" style={{ background: "var(--surface-2)" }} />
          ))}
        </div>
      ) : mergeRequests.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <GitMerge size={40} className="mb-3 opacity-20" />
          <p className="font-semibold text-[var(--text-primary)]">No merge requests</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Create a branch, make changes there, and open a merge request when it is ready.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {mergeRequests.map((mergeRequest) => {
            const source = planMap[mergeRequest.branch_plan_id];
            const target = planMap[mergeRequest.main_plan_id];
            const added = mergeRequest.diff_summary?.added_events?.length ?? 0;
            const removed = mergeRequest.diff_summary?.removed_events?.length ?? 0;
            const modified = mergeRequest.diff_summary?.modified_events?.length ?? 0;

            return (
              <Link
                key={mergeRequest.id}
                href={`/plans/${planId}/merge-requests/${mergeRequest.id}`}
                className="card block transition-all hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">{mergeRequest.title}</h2>
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
                    <p className="mt-2 text-sm font-medium italic text-[var(--text-secondary)]">
                      {source?.branch_name || "branch"} -&gt; {target?.branch_name || "main"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      source r{mergeRequest.source_revision} / target r{mergeRequest.target_revision}
                    </p>
                    {mergeRequest.description && (
                      <p className="mt-3 max-w-3xl text-sm text-[var(--text-secondary)]">
                        {mergeRequest.description}
                      </p>
                    )}
                  </div>

                  <div className="grid min-w-[220px] grid-cols-3 gap-2">
                    <div className="rounded-[1.25rem] border bg-[var(--surface-2)] p-3 text-center" style={{ borderColor: "var(--border)" }}>
                      <p className="text-[10px] uppercase tracking-wide text-emerald-400">Added</p>
                      <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{added}</p>
                    </div>
                    <div className="rounded-[1.25rem] border bg-[var(--surface-2)] p-3 text-center" style={{ borderColor: "var(--border)" }}>
                      <p className="text-[10px] uppercase tracking-wide text-red-400">Removed</p>
                      <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{removed}</p>
                    </div>
                    <div className="rounded-[1.25rem] border bg-[var(--surface-2)] p-3 text-center" style={{ borderColor: "var(--border)" }}>
                      <p className="text-[10px] uppercase tracking-wide text-amber-400">Modified</p>
                      <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{modified}</p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
