"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FileText, CheckCircle, Clock, Archive, ArrowUpRight } from "lucide-react";
import { plansApi } from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import { toast } from "@/store/toast";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  status: string;
  current_version: number;
  events_count: number;
  updated_at: string;
}

function NewPlanForm({ onCreated, onCancel }: { onCreated: (plan: Plan) => void; onCancel: () => void }) {
  const [creating, setCreating] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Plan name is required.");
      return;
    }

    setError("");
    setCreating(true);
    try {
      const response = await plansApi.create({
        name: trimmedName,
        description: description.trim() || undefined,
      });
      toast.success("Plan created", "Opening the new workspace.");
      onCreated(response.data);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message ?? "Could not create this plan.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <form method="post" onSubmit={onSubmit} className="grid gap-3 lg:grid-cols-[1fr_1.1fr_auto_auto] lg:items-start">
      <div>
        <label className="section-label mb-1 block">Plan name</label>
        <input
          autoFocus
          className={`input w-full ${error ? "border-red-500 focus:border-red-500" : ""}`}
          placeholder="Plan name, e.g. 'My SaaS App'"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError("");
          }}
          disabled={!isMounted || creating}
        />
        {error && <p className="mt-1 text-xs font-medium text-red-500">{error}</p>}
      </div>
      <div>
        <label className="section-label mb-1 block">Description</label>
        <input
          className="input w-full"
          placeholder="What this tracking plan governs..."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={!isMounted || creating}
        />
      </div>
      <button
        type="submit"
        className="btn-primary mt-0 lg:mt-6"
        disabled={!isMounted || creating || !name.trim()}
      >
        {creating ? "Creating..." : "Create"}
      </button>
      <button type="button" className="btn-secondary mt-0 lg:mt-6" onClick={onCancel} disabled={creating}>
        Cancel
      </button>
    </form>
  );
}

export default function PlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    plansApi
      .list()
      .then((r) => setPlans(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "active") return <CheckCircle size={14} className="text-emerald-400" />;
    if (status === "archived") return <Archive size={14} className="text-zinc-400" />;
    return <Clock size={14} className="text-amber-400" />;
  };

  return (
    <div className="page-pad fade-in-up">
      {/* Header */}
      <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="section-label mb-3">Workspace ledger</p>
          <h1 className="editorial-title text-4xl md:text-5xl">
            Tracking <span className="serif-italic">Plans</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--text-secondary)]">
            Create source-of-truth schemas, branch safely, publish versions, and validate real payloads from one calm workspace.
          </p>
        </div>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => setShowCreate(true)}
        >
          <Plus size={16} />
          New Plan
        </button>
      </div>

      {/* New plan dialog */}
      {showCreate && plans.length > 0 && (
        <div className="card mb-6">
          <NewPlanForm
            onCreated={(data) => {
              setPlans((p) => [data, ...p]);
              setShowCreate(false);
              router.push(`/plans/${data.id}`);
            }}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {/* Plans grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card h-36 animate-pulse" style={{ background: "var(--surface-2)" }} />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <FileText size={48} className="mb-4 opacity-20" />
          <p className="text-lg font-medium text-[var(--text-primary)]">No tracking plans yet</p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Create your first plan to start defining events.
          </p>
          {showCreate ? (
            <div className="mt-6 w-full max-w-4xl text-left">
              <NewPlanForm
                onCreated={(data) => {
                  setPlans((p) => [data, ...p]);
                  setShowCreate(false);
                  router.push(`/plans/${data.id}`);
                }}
                onCancel={() => setShowCreate(false)}
              />
            </div>
          ) : (
            <button className="btn-primary mt-4 flex items-center gap-2" onClick={() => setShowCreate(true)}>
              <Plus size={16} />
              Create first plan
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <Link
              key={plan.id}
              href={`/plans/${plan.id}`}
              className="card group block cursor-pointer overflow-hidden transition-all hover:-translate-y-1 hover:border-[var(--border-strong)]"
            >
              <div className="mb-6 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <StatusIcon status={plan.status} />
                  <span
                    className={`badge badge-${plan.status}`}
                  >
                    {plan.status}
                  </span>
                </div>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  v{plan.current_version}
                </span>
              </div>

              <h3 className="mb-2 text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-strong)]">
                {plan.name}
              </h3>
              {plan.description && (
                <p className="mb-3 text-sm line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                  {plan.description}
                </p>
              )}

              <div className="mt-8 flex items-center justify-between border-t pt-4" style={{ borderColor: "var(--border)" }}>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {plan.events_count} events
                </span>
                <span className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                  {formatRelative(plan.updated_at)}
                  <ArrowUpRight size={13} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
