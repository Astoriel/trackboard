"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, GitBranch } from "lucide-react";
import { plansApi, mergeRequestsApi } from "@/lib/api";

export default function NewMergeRequestPage() {
  const { planId } = useParams<{ planId: string }>();
  const searchParams = useSearchParams();
  const branchId = searchParams.get("branch");
  const router = useRouter();
  
  const [mainPlan, setMainPlan] = useState<any>(null);
  const [branchPlan, setBranchPlan] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!planId) return;
    plansApi.get(planId as string).then(r => setMainPlan(r.data));
    if (branchId) {
      plansApi.get(branchId as string).then(r => {
         setBranchPlan(r.data);
         setTitle(`Merge branch '${r.data.branch_name}' into main`);
      });
    }
  }, [planId, branchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchId || !title) return;
    setSubmitting(true);
    try {
      const res = await mergeRequestsApi.create(planId as string, {
        branch_plan_id: branchId,
        title,
        description: desc
      });
      router.push(`/plans/${planId}/merge-requests/${res.data.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!mainPlan || !branchPlan) return <div className="page-pad">Loading...</div>;

  return (
    <div className="page-pad fade-in-up mx-auto flex h-full w-full max-w-4xl flex-col">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.back()} className="btn-secondary p-3">
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="section-label mb-3">Open review</p>
        <h1 className="editorial-title text-4xl">
          Open merge <span className="serif-italic">request</span>
        </h1>
        </div>
      </div>

      <div className="card mb-6 flex items-center gap-3">
         <GitBranch className="text-[var(--accent-strong)]" />
         <div className="text-sm font-semibold text-[var(--text-secondary)]">
           Merging branch <strong className="text-[var(--text-primary)] bg-[var(--surface-2)] border border-[var(--border)] px-2 py-0.5 rounded shadow-sm">{branchPlan.branch_name}</strong> into 
           <strong className="text-[var(--text-primary)] bg-[var(--surface-2)] border border-[var(--border)] px-2 py-0.5 rounded ml-1 shadow-sm">main</strong>
         </div>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">Title</label>
          <input
            type="text"
            required
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="input w-full"
            placeholder="e.g. Added onboarding events"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">Description (Optional)</label>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            className="input w-full h-32 resize-none"
            placeholder="Describe the changes in this branch..."
          />
        </div>
        <div className="flex justify-end pt-4 border-t border-[var(--border)]">
           <button type="submit" disabled={submitting} className="btn-primary">
             Create Merge Request
           </button>
        </div>
      </form>
    </div>
  );
}
