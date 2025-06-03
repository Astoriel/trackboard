"use client";
import React, { useCallback, useEffect, useState } from "react";
import { globalPropertiesApi, plansApi } from "@/lib/api";
import { Plus, Trash2, Loader2, BookOpen } from "lucide-react";
import { useParams } from "next/navigation";
import { PROPERTY_TYPES } from "@/lib/utils";

interface GlobalProperty {
  id: string;
  name: string;
  description: string | null;
  type: string;
  required: boolean;
}

export default function DictionaryPage() {
  const params = useParams<{ planId: string }>();
  const planId = params?.planId;

  const [properties, setProperties] = useState<GlobalProperty[]>([]);
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newType, setNewType] = useState("string");
  const [newRequired, setNewRequired] = useState(false);

  const fetchProps = useCallback(async () => {
    if (!planId) return;
    try {
      const [planResponse, propertiesResponse] = await Promise.all([
        plansApi.get(planId),
        globalPropertiesApi.list(planId),
      ]);
      setDraftRevision(planResponse.data.draft_revision);
      const res = propertiesResponse;
      setProperties(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void fetchProps();
  }, [fetchProps]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this global property?")) return;
    try {
      if (draftRevision == null) return;
      await globalPropertiesApi.delete(id, draftRevision);
      void fetchProps();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planId || !newName.trim()) return;
    try {
      await globalPropertiesApi.create(planId, {
        name: newName,
        description: newDescription.trim() || null,
        type: newType,
        required: newRequired,
        draft_revision: draftRevision ?? undefined,
      });
      setNewName("");
      setNewDescription("");
      setNewRequired(false);
      setAdding(false);
      void fetchProps();
    } catch(e) {
      console.error(e);
    }
  };

  const handleUpdate = async (
    property: GlobalProperty,
    payload: Partial<Pick<GlobalProperty, "name" | "description" | "type" | "required">>,
  ) => {
    if (draftRevision == null) return;
    setUpdatingId(property.id);
    try {
      await globalPropertiesApi.update(property.id, {
        ...payload,
        draft_revision: draftRevision,
      });
      void fetchProps();
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="page-pad fade-in-up mx-auto h-full max-w-6xl overflow-y-auto">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="section-label mb-3">Shared schema fragments</p>
          <h1 className="editorial-title flex items-center gap-3 text-4xl">
            <BookOpen className="text-[var(--accent-strong)]" strokeWidth={1.6} />
            Data <span className="serif-italic">dictionary</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--text-secondary)]">
            Define properties that can be shared across multiple events in the tracking plan.
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New Global Property
        </button>
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="card mb-6 grid gap-3 lg:grid-cols-[1fr_1.2fr_160px_140px_auto_auto] lg:items-end">
          <div className="flex-1">
            <label className="section-label mb-1 block">Property Name</label>
            <input 
              autoFocus
              className="input font-mono"
              placeholder="e.g. device_os" 
              value={newName} 
              onChange={e => setNewName(e.target.value)} 
              required 
            />
          </div>
          <div>
            <label className="section-label mb-1 block">Description</label>
            <input
              className="input"
              placeholder="Reusable device operating system"
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="section-label mb-1 block">Type</label>
            <select 
              className="input w-40 font-mono"
              value={newType}
              onChange={e => setNewType(e.target.value)}
            >
              {PROPERTY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 rounded-[1.25rem] border border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={newRequired}
              onChange={e => setNewRequired(e.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
            Required
          </label>
          <button type="submit" className="btn-primary">
            Save
          </button>
          <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
            Cancel
          </button>
        </form>
      )}
      
      {loading ? (
        <div className="flex justify-center p-10"><Loader2 className="animate-spin text-[var(--text-muted)]" /></div>
      ) : properties.length === 0 ? (
        <div className="card border-dashed p-12 text-center text-[var(--text-secondary)]">
          <BookOpen size={32} className="mx-auto mb-3 opacity-20" />
          No global properties defined yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[2rem] border shadow-sm" style={{borderColor: "var(--border)"}}>
          <table className="data-table" style={{background: "var(--surface)"}}>
            <thead className="border-b text-sm" style={{borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-muted)"}}>
              <tr>
                <th className="py-3 px-4 font-medium">Name</th>
                <th className="py-3 px-4 font-medium">Description</th>
                <th className="py-3 px-4 font-medium">Type</th>
                <th className="py-3 px-4 font-medium">Required by Default</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm" style={{borderColor: "var(--border)"}}>
              {properties.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-[var(--surface-2)]">
                  <td className="py-3 px-4">
                    <input
                      className="input font-mono text-sm"
                      defaultValue={p.name}
                      disabled={updatingId === p.id}
                      onBlur={(event) => {
                        const nextValue = event.target.value.trim();
                        if (nextValue && nextValue !== p.name) {
                          void handleUpdate(p, { name: nextValue });
                        } else {
                          event.target.value = p.name;
                        }
                      }}
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      className="input text-sm"
                      placeholder="description"
                      defaultValue={p.description ?? ""}
                      disabled={updatingId === p.id}
                      onBlur={(event) => {
                        const nextValue = event.target.value.trim();
                        const currentValue = p.description ?? "";
                        if (nextValue !== currentValue) {
                          void handleUpdate(p, { description: nextValue || null });
                        }
                      }}
                    />
                  </td>
                  <td className="py-3 px-4">
                    <select
                      className="input w-36 font-mono text-sm"
                      value={p.type}
                      disabled={updatingId === p.id}
                      onChange={(event) => void handleUpdate(p, { type: event.target.value })}
                    >
                      {PROPERTY_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4 text-[var(--text-secondary)]">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={p.required}
                        disabled={updatingId === p.id}
                        onChange={(event) => void handleUpdate(p, { required: event.target.checked })}
                        className="h-4 w-4 accent-brand-600"
                      />
                      {p.required ? "Yes" : "No"}
                    </label>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-red-500 hover:text-red-600 p-2 rounded hover:bg-red-500/10 transition-colors"
                      title="Delete global property"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
