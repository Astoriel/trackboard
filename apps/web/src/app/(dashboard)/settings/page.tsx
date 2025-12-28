"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { healthApi, orgApi } from "@/lib/api";
import { Activity, Bot, Building2, KeyRound, Save, ShieldAlert, Users } from "lucide-react";

interface HealthState {
  live: string;
  ready: string;
  release_marker?: string;
  render_git_commit?: string | null;
  render_service_name?: string | null;
}

interface AIProviderState {
  enabled: boolean;
  provider: string;
  base_url: string;
  model: string;
  has_api_key: boolean;
}

export default function OrgSettingsPage() {
  const { user, orgName, role } = useAuthStore();
  const [name, setName] = useState(orgName || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [aiProvider, setAiProvider] = useState<AIProviderState>({
    enabled: false,
    provider: "openai-compatible",
    base_url: "",
    model: "gpt-4o-mini",
    has_api_key: false,
  });
  const [aiApiKey, setAiApiKey] = useState("");
  const [savingAi, setSavingAi] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([healthApi.live(), healthApi.ready(), healthApi.version(), orgApi.getAiProvider()])
      .then(([live, ready, version, ai]) => {
        if (!mounted) return;
        setHealth({
          live: live.data.status,
          ready: ready.data.status,
          release_marker: version.data.release_marker,
          render_git_commit: version.data.render_git_commit,
          render_service_name: version.data.render_service_name,
        });
        setAiProvider({
          enabled: ai.data.enabled,
          provider: ai.data.provider,
          base_url: ai.data.base_url ?? "",
          model: ai.data.model,
          has_api_key: ai.data.has_api_key,
        });
      })
      .catch(() => {
        if (mounted) {
          setHealth({ live: "down", ready: "down" });
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Real API call to update org name
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await orgApi.update({ name });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert("Failed to update organization name");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAiProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAi(true);
    try {
      const response = await orgApi.updateAiProvider({
        enabled: aiProvider.enabled,
        provider: aiProvider.provider.trim() || "openai-compatible",
        base_url: aiProvider.base_url.trim() || null,
        model: aiProvider.model.trim() || "gpt-4o-mini",
        ...(aiApiKey.trim() ? { api_key: aiApiKey.trim() } : {}),
      });
      setAiProvider({
        enabled: response.data.enabled,
        provider: response.data.provider,
        base_url: response.data.base_url ?? "",
        model: response.data.model,
        has_api_key: response.data.has_api_key,
      });
      setAiApiKey("");
      setAiSaved(true);
      setTimeout(() => setAiSaved(false), 2000);
    } catch {
      alert("Failed to update AI provider settings");
    } finally {
      setSavingAi(false);
    }
  };

  const handleClearAiKey = async () => {
    if (!confirm("Remove the saved AI API key?")) return;
    setSavingAi(true);
    try {
      const response = await orgApi.updateAiProvider({ clear_api_key: true });
      setAiProvider((current) => ({
        ...current,
        has_api_key: response.data.has_api_key,
      }));
      setAiApiKey("");
    } finally {
      setSavingAi(false);
    }
  };

  const canManageOrg = role === "owner" || role === "admin";

  return (
    <div className="page-pad fade-in-up mx-auto h-full max-w-5xl overflow-y-auto">
      <div className="mb-8">
        <p className="section-label mb-3">Organization</p>
      <h1 className="editorial-title mb-3 text-4xl">
        Organization <span className="serif-italic">settings</span>
      </h1>
        <p className="max-w-2xl text-sm font-medium leading-6" style={{ color: "var(--text-secondary)" }}>
          Manage organization details and verify the backend this frontend is connected to.
        </p>
      </div>

      <div className="space-y-6">
        {/* General Settings */}
        <section className="card">
          <div className="flex items-center gap-3 mb-6">
             <div className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[var(--text-primary)]"><Building2 size={20} /></div>
        <h2 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">General Information</h2>
          </div>
          
          <form onSubmit={handleSave} className="max-w-md">
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Organization Name
              </label>
              <input
                type="text"
                className="input w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={!canManageOrg}
              />
              {!canManageOrg && (
                <p className="mt-1.5 text-xs text-yellow-500 flex items-center gap-1">
                  <ShieldAlert size={12}/> You do not have permission to change the organization name.
                </p>
              )}
            </div>
            
            <button 
              type="submit" 
              className="btn-primary flex items-center gap-2" 
              disabled={saving || !canManageOrg || name === orgName}
            >
              <Save size={16} />
              {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[var(--text-primary)]">
              <Bot size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">
                AI Provider
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Configure an OpenAI-compatible endpoint for schema generation and duplicate analysis.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveAiProvider} className="grid gap-4">
            <label className="flex items-center justify-between gap-3 rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <span>
                <span className="block text-sm font-medium text-[var(--text-primary)]">
                  Enable AI tools
                </span>
                <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                  When disabled, editor AI calls fail safely and never block manual schema work.
                </span>
              </span>
              <input
                type="checkbox"
                checked={aiProvider.enabled}
                onChange={(event) =>
                  setAiProvider((current) => ({ ...current, enabled: event.target.checked }))
                }
                disabled={!canManageOrg || savingAi}
                className="h-5 w-5 accent-brand-600"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-[180px_1fr_220px]">
              <div>
                <label className="section-label mb-1 block">Provider</label>
                <input
                  className="input"
                  value={aiProvider.provider}
                  onChange={(event) =>
                    setAiProvider((current) => ({ ...current, provider: event.target.value }))
                  }
                  disabled={!canManageOrg || savingAi}
                />
              </div>
              <div>
                <label className="section-label mb-1 block">Custom endpoint</label>
                <input
                  className="input"
                  placeholder="https://api.openai.com/v1 or http://localhost:1234/v1"
                  value={aiProvider.base_url}
                  onChange={(event) =>
                    setAiProvider((current) => ({ ...current, base_url: event.target.value }))
                  }
                  disabled={!canManageOrg || savingAi}
                />
              </div>
              <div>
                <label className="section-label mb-1 block">Model</label>
                <input
                  className="input font-mono"
                  placeholder="gpt-4o-mini"
                  value={aiProvider.model}
                  onChange={(event) =>
                    setAiProvider((current) => ({ ...current, model: event.target.value }))
                  }
                  disabled={!canManageOrg || savingAi}
                />
              </div>
            </div>

            <div>
              <label className="section-label mb-1 block">API key</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="password"
                  className="input flex-1 font-mono"
                  placeholder={
                    aiProvider.has_api_key
                      ? "Saved on backend. Leave blank to keep it."
                      : "Paste provider key"
                  }
                  value={aiApiKey}
                  onChange={(event) => setAiApiKey(event.target.value)}
                  disabled={!canManageOrg || savingAi}
                />
                {aiProvider.has_api_key && (
                  <button
                    type="button"
                    className="btn-secondary flex items-center gap-2"
                    onClick={handleClearAiKey}
                    disabled={!canManageOrg || savingAi}
                  >
                    <KeyRound size={14} />
                    Remove key
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                The backend stores the secret and only returns whether a key exists. The key is never
                echoed back to the browser.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--text-secondary)]">
                Status: {aiProvider.enabled ? "enabled" : "disabled"} / key{" "}
                {aiProvider.has_api_key ? "saved" : "not saved"}
              </p>
              <button
                type="submit"
                className="btn-primary flex items-center gap-2"
                disabled={!canManageOrg || savingAi}
              >
                <Save size={14} />
                {savingAi ? "Saving..." : aiSaved ? "Saved!" : "Save AI settings"}
              </button>
            </div>

            {!canManageOrg && (
              <p className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs font-medium text-amber-700">
                Only owners and admins can update provider endpoint and secret.
              </p>
            )}
          </form>
        </section>

        <section className="card">
          <div className="flex items-center gap-3 mb-6">
             <div className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[var(--text-primary)]"><Users size={20} /></div>
             <div>
        <h2 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">Team Members</h2>
               <p className="text-xs mt-0.5 text-[var(--text-secondary)]">Current authenticated membership from the backend session.</p>
             </div>
          </div>
          
          <div className="overflow-hidden rounded-[1.5rem] border" style={{ borderColor: "var(--border)" }}>
            <table className="data-table">
              <thead className="bg-[var(--surface-2)] border-b" style={{ borderColor: "var(--border)" }}>
                <tr>
                   <th className="px-4 py-3 font-semibold text-xs tracking-wider uppercase text-[var(--text-muted)]">User</th>
                   <th className="px-4 py-3 font-semibold text-xs tracking-wider uppercase text-[var(--text-muted)]">Role</th>
                   <th className="px-4 py-3 font-semibold text-xs tracking-wider uppercase text-[var(--text-muted)] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                <tr>
                   <td className="px-4 py-3">
                     <div className="font-semibold tracking-tight text-[var(--text-primary)]">{user?.name}</div>
                     <div className="text-xs text-[var(--text-secondary)]">{user?.email}</div>
                   </td>
                   <td className="px-4 py-3">
                     <span className="badge badge-active text-xs capitalize">{role}</span>
                   </td>
                   <td className="px-4 py-3 text-right">
                     <span className="text-xs text-[var(--text-muted)] italic font-medium">Current User</span>
                   </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[var(--text-primary)]">
              <Activity size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">Backend Health</h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Live, ready, and release marker from the connected API.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="hairline-card">
              <p className="section-label mb-2">Live</p>
              <p className="text-lg font-medium text-[var(--text-primary)]">{health?.live ?? "checking..."}</p>
            </div>
            <div className="hairline-card">
              <p className="section-label mb-2">Ready</p>
              <p className="text-lg font-medium text-[var(--text-primary)]">{health?.ready ?? "checking..."}</p>
            </div>
            <div className="hairline-card">
              <p className="section-label mb-2">Service</p>
              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                {health?.render_service_name || "local"}
              </p>
              {health?.render_git_commit && (
                <p className="mt-1 truncate font-mono text-xs text-[var(--text-muted)]">
                  {health.render_git_commit.slice(0, 12)}
                </p>
              )}
            </div>
          </div>

          {health?.release_marker && (
            <p className="mt-4 rounded-2xl border bg-[var(--surface-2)] px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
              {health.release_marker}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
