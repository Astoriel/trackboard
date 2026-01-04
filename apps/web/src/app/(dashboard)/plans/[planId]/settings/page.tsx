"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Key,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { apiKeysApi, plansApi } from "@/lib/api";
import { toast } from "@/store/toast";
import { formatRelative } from "@/lib/utils";

interface ApiKey {
  id: string;
  key_prefix: string;
  label: string;
  scope: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface CreatedKey extends ApiKey {
  full_key: string;
}

interface TrackingPlan {
  id: string;
  name: string;
  description: string | null;
  status: string;
  draft_revision: number;
  current_version: number;
}

export default function SettingsPage() {
  const { planId } = useParams<{ planId: string }>();

  const [plan, setPlan] = useState<TrackingPlan | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [planForm, setPlanForm] = useState({ name: "", description: "", status: "draft" });
  const [savingPlan, setSavingPlan] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [showFullKey, setShowFullKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  const loadData = useCallback(async () => {
    if (!planId) return;

    setLoading(true);
    try {
      const [planResponse, keysResponse] = await Promise.all([
        plansApi.get(planId),
        apiKeysApi.list(planId),
      ]);
      setPlan(planResponse.data);
      setPlanForm({
        name: planResponse.data.name ?? "",
        description: planResponse.data.description ?? "",
        status: planResponse.data.status ?? "draft",
      });
      setKeys(keysResponse.data);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    loadData().catch((error) => {
      console.error(error);
      toast.error("Failed to load settings", "Could not load plan settings.");
      setLoading(false);
    });
  }, [loadData]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const copyKey = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 1500);
  };

  const createKey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!planId || !newLabel.trim()) return;

    setCreating(true);
    try {
      const { data } = await apiKeysApi.create(planId, newLabel.trim());
      setCreatedKey(data);
      setNewLabel("");
      toast.success("API key created", "Copy the full key now and store it safely.");
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error("Key creation failed", "Could not create a new API key.");
    } finally {
      setCreating(false);
    }
  };

  const savePlanDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!planId || !plan || !planForm.name.trim()) return;

    setSavingPlan(true);
    try {
      const { data } = await plansApi.update(planId, {
        name: planForm.name.trim(),
        description: planForm.description.trim() || null,
        status: planForm.status,
        draft_revision: plan.draft_revision,
      });
      setPlan(data);
      setPlanForm({
        name: data.name ?? "",
        description: data.description ?? "",
        status: data.status ?? "draft",
      });
      toast.success("Workspace updated", "Plan metadata and draft revision were refreshed.");
      await loadData();
    } catch (error: any) {
      console.error(error);
      if (error?.response?.data?.code === "stale_revision") {
        toast.warning("Workspace changed", "Reloaded the latest draft revision before retrying.");
        await loadData();
      } else {
        toast.error("Update failed", error?.response?.data?.message ?? "Could not update plan details.");
      }
    } finally {
      setSavingPlan(false);
    }
  };

  const rotateKey = async (keyId: string) => {
    setBusyKeyId(keyId);
    try {
      const { data } = await apiKeysApi.rotate(keyId);
      setCreatedKey(data);
      toast.success("API key rotated", "The previous key was revoked and a replacement was created.");
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error("Rotate failed", "Could not rotate the selected API key.");
    } finally {
      setBusyKeyId(null);
    }
  };

  const revokeKey = async (keyId: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;

    setBusyKeyId(keyId);
    try {
      await apiKeysApi.revoke(keyId);
      toast.success("API key revoked");
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error("Revoke failed", "Could not revoke the selected API key.");
    } finally {
      setBusyKeyId(null);
    }
  };

  const handleExport = async () => {
    if (!planId) return;

    try {
      const { data } = await plansApi.export(planId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tracking-plan-${planId}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Export ready", "Downloaded the latest published snapshot when available.");
    } catch (error) {
      console.error(error);
      toast.error("Export failed", "Could not export the current plan.");
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!planId || !plan || !event.target.files?.length) return;

    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = async (loadEvent) => {
      try {
        setImporting(true);
        const parsed = JSON.parse(loadEvent.target?.result as string);
        const response = await plansApi.import(planId, {
          format: "json",
          data: parsed,
          draft_revision: plan.draft_revision,
        });
        setPlan((current) =>
          current ? { ...current, draft_revision: response.data.draft_revision } : current,
        );
        toast.success("Import successful", "Workspace snapshot was replaced and revision advanced.");
        await loadData();
      } catch (error: any) {
        console.error(error);
        if (error?.response?.data?.code === "stale_revision") {
          toast.warning("Workspace changed", "Reloaded the latest draft revision before retrying.");
          await loadData();
        } else {
          toast.error(
            "Import failed",
            error?.response?.data?.message ?? "Could not import the selected file.",
          );
        }
      } finally {
        setImporting(false);
        event.target.value = "";
      }
    };

    reader.readAsText(file);
  };

  return (
    <div className="page-pad fade-in-up max-w-5xl">
      <div className="mb-6">
        <p className="section-label mb-3">Control room</p>
        <h2 className="editorial-title text-4xl">
          Workspace <span className="serif-italic">settings</span>
        </h2>
        <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--text-secondary)]">
          Manage API key lifecycle and import or export the latest plan snapshot.
        </p>
        {plan && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
            <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--border)" }}>
              {plan.name}
            </span>
            <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--border)" }}>
              draft r{plan.draft_revision}
            </span>
            <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--border)" }}>
              latest published v{plan.current_version}
            </span>
          </div>
        )}
      </div>

      {createdKey && (
        <div
          className="mb-6 rounded-[1.75rem] border p-5"
          style={{ borderColor: "rgba(139,116,74,0.35)", background: "rgba(215,201,165,0.18)" }}
        >
          <p className="mb-2 text-sm font-medium text-[var(--text-primary)]">
            A new API key was created. Copy it now, it will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 rounded-2xl px-3 py-2 font-mono text-sm"
              style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}
            >
              {showFullKey
                ? createdKey.full_key
                : `${createdKey.full_key.slice(0, 12)}************************`}
            </code>
            <button onClick={() => setShowFullKey((current) => !current)} className="btn-ghost p-2">
              {showFullKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button
              onClick={() => copyKey(createdKey.full_key)}
              className="btn-primary flex items-center gap-1.5 text-xs"
            >
              {keyCopied ? <Check size={13} /> : <Copy size={13} />}
              {keyCopied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <div className="card mb-6">
        <div className="mb-4">
          <p className="section-label mb-2">Backend-backed metadata</p>
          <h3 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">
            Workspace details
          </h3>
          <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
            Updates call the canonical plan endpoint and include the current draft revision.
          </p>
        </div>

        <form method="post" onSubmit={savePlanDetails} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <div>
              <label className="section-label mb-1 block">Plan name</label>
              <input
                className="input"
                value={planForm.name}
                onChange={(event) =>
                  setPlanForm((current) => ({ ...current, name: event.target.value }))
                }
                disabled={!isMounted || savingPlan || loading}
                required
              />
            </div>
            <div>
              <label className="section-label mb-1 block">Status</label>
              <select
                className="input"
                value={planForm.status}
                onChange={(event) =>
                  setPlanForm((current) => ({ ...current, status: event.target.value }))
                }
                disabled={!isMounted || savingPlan || loading}
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="archived">archived</option>
              </select>
            </div>
          </div>

          <div>
            <label className="section-label mb-1 block">Description</label>
            <textarea
              className="input min-h-28 rounded-[1.5rem]"
              value={planForm.description}
              onChange={(event) =>
                setPlanForm((current) => ({ ...current, description: event.target.value }))
              }
              disabled={!isMounted || savingPlan || loading}
              placeholder="What this tracking plan governs..."
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--text-muted)]">
              Current draft revision: r{plan?.draft_revision ?? "-"}
            </p>
            <button
              type="submit"
              className="btn-primary flex items-center gap-2"
              disabled={!isMounted || savingPlan || loading || !planForm.name.trim()}
            >
              <Save size={14} />
              {savingPlan ? "Saving..." : "Save details"}
            </button>
          </div>
        </form>
      </div>

      <div className="card mb-6">
        <h3 className="mb-3 text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">Create API key</h3>
        <form method="post" onSubmit={createKey} className="flex flex-col gap-3 sm:flex-row">
          <input
            className="input flex-1"
            placeholder="Label, e.g. Production SDK"
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            disabled={!isMounted || creating}
            required
          />
          <button
            type="submit"
            className="btn-primary flex items-center gap-2"
            disabled={!isMounted || creating || !newLabel.trim()}
          >
            <Plus size={14} />
            {creating ? "Creating..." : "Create"}
          </button>
        </form>
      </div>

      <div className="card mb-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">API key lifecycle</h3>
            <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
              Rotate active keys when you need a replacement and revoke keys you no longer trust.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            [1, 2].map((item) => (
              <div
                key={item}
                className="h-16 animate-pulse rounded-xl"
                style={{ background: "var(--surface-2)" }}
              />
            ))
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Key size={32} className="mb-3 opacity-20" />
              <p className="text-[var(--text-secondary)]">No API keys yet.</p>
            </div>
          ) : (
            keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center gap-3 rounded-[1.5rem] border bg-[var(--surface-2)] p-4"
                style={{ borderColor: "var(--border)" }}
              >
                <Key size={16} className="text-brand-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-[var(--text-primary)]">{key.label}</p>
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {key.scope}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                        key.is_active ? "text-emerald-400" : "text-[var(--text-muted)]"
                      }`}
                      style={{ borderColor: "var(--border)" }}
                    >
                      {key.is_active ? "active" : "revoked"}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                    {key.key_prefix}***** / created {formatRelative(key.created_at)}
                  </p>
                  {key.last_used_at && (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Last used {formatRelative(key.last_used_at)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => rotateKey(key.id)}
                    disabled={busyKeyId === key.id || !key.is_active}
                    className="btn-secondary flex items-center gap-1.5 text-xs"
                  >
                    <RefreshCw size={13} />
                    Rotate
                  </button>
                  <button
                    onClick={() => revokeKey(key.id)}
                    disabled={busyKeyId === key.id || !key.is_active}
                    className="btn-ghost flex items-center gap-1.5 p-2 hover:text-red-400"
                    aria-label={`Revoke API key ${key.label}`}
                    title="Revoke API key"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="mb-3 text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">Import and export</h3>
        <p className="mb-4 text-sm font-medium leading-6 text-[var(--text-secondary)]">
          Export the latest published snapshot when available, or replace the current workspace by
          importing a JSON snapshot into the current draft revision.
        </p>

        <div className="flex flex-wrap gap-4">
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2">
            <Download size={16} />
            Export JSON
          </button>

          <div className="relative">
            <button
              className="btn-secondary flex items-center gap-2"
              disabled={!isMounted || loading || !plan || importing}
            >
              <Upload size={16} />
              {importing ? "Importing..." : "Import JSON"}
            </button>
            <input
              type="file"
              accept="application/json"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={handleImport}
              disabled={!isMounted || loading || !plan || importing}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
