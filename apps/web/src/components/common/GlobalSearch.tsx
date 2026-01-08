"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Search, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

export function GlobalSearch() {
  const params = useParams();
  const router = useRouter();
  const planId = params.planId as string | undefined;
  
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ plan_matched?: boolean, events?: any[], properties?: any[] }>({});
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen || !query.trim() || !planId) {
      setResults({});
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data } = await api.get(`/plans/${planId}/search?q=${encodeURIComponent(query)}`);
        setResults(data);
      } catch (e) {
        console.error("Search failed", e);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query, isOpen, planId]);

  if (!planId) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="hidden w-[min(32vw,440px)] items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-normal text-[var(--text-muted)] shadow-sm transition hover:-translate-y-0.5 hover:text-[var(--text-primary)] md:flex"
      >
        <Search size={18} className="text-[var(--text-primary)]" strokeWidth={1.6} />
        <span className="flex-1 text-left">Search anything...</span>
        <kbd className="hidden rounded-full border bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-primary)] sm:inline-block">
          Cmd K
        </kbd>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[10vh] backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border bg-[var(--surface)] text-[var(--text-primary)] shadow-2xl">
            
            <div className="flex items-center gap-3 border-b p-4">
              <Search className="text-[var(--text-muted)]" size={18} strokeWidth={1.6} />
              <input
                autoFocus
                type="text"
                placeholder="Search events, properties, description..."
                className="flex-1 bg-transparent text-lg font-normal outline-none placeholder:text-[var(--text-muted)]"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {isSearching && <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />}
              <button 
                onClick={() => setIsOpen(false)}
                className="rounded-full border px-3 py-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ESC
              </button>
            </div>

            <div className="overflow-y-auto p-2">
              {!query.trim() && (
                <div className="p-8 text-center text-[var(--text-muted)]">
                  Type to search tracking plan events and properties.
                </div>
              )}
              
              {query.trim() && !isSearching && !results?.events?.length && !results?.properties?.length && !results?.plan_matched && (
                <div className="p-8 text-center text-[var(--text-muted)]">
                  No results found for &quot;{query}&quot;.
                </div>
              )}

              {/* Plan Results */}
              {results.plan_matched && (
                <div className="mb-4">
                  <div className="px-3 py-1 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Plan
                  </div>
                  <div
                    onClick={() => { setIsOpen(false); router.push(`/plans/${planId}`); }}
                    className="mx-2 flex cursor-pointer items-center justify-between rounded-2xl p-3 hover:bg-[var(--surface-sunken)]"
                  >
                    <div>
                      <div className="font-medium text-brand-500">Matches current plan details</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Event Results */}
              {results.events && results.events.length > 0 && (
                <div className="mb-4">
                  <div className="px-3 py-1 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Events
                  </div>
                  {results.events.map((e) => (
                    <div
                      key={e.id}
                      onClick={() => { setIsOpen(false); router.push(`/plans/${planId}#event-${e.id}`); }}
                      className="mx-2 cursor-pointer rounded-2xl p-3 hover:bg-[var(--surface-sunken)]"
                    >
                      <div className="font-medium">{e.event_name}</div>
                      {e.description && <div className="text-sm text-[var(--text-muted)] line-clamp-1">{e.description}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Property Results */}
              {results.properties && results.properties.length > 0 && (
                <div className="mb-4">
                  <div className="px-3 py-1 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Properties
                  </div>
                  {results.properties.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => { setIsOpen(false); router.push(`/plans/${planId}#event-${p.event_id}`); }}
                      className="mx-2 cursor-pointer rounded-2xl p-3 hover:bg-[var(--surface-sunken)]"
                    >
                      <div className="font-medium">{p.name} <span className="text-xs px-1.5 py-0.5 ml-2 bg-[var(--surface)] border rounded text-[var(--text-muted)]">{p.type}</span></div>
                      {p.description && <div className="text-sm text-[var(--text-muted)] line-clamp-1">{p.description}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
          </div>
        </div>
      )}
    </>
  );
}
