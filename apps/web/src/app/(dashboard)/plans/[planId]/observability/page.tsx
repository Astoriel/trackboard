"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, Activity, CheckCircle, FileJson, Loader2, Search, XCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { dlqApi, validationApi } from "@/lib/api";

interface DlqItem {
  id: string;
  event_name: string;
  payload: Record<string, unknown>;
  error_reason: string;
  created_at: string;
  first_seen_at?: string;
  last_seen_at?: string;
  occurrence_count?: number;
  version_id?: string | null;
}

interface ValidationStats {
  total_events: number;
  valid_count: number;
  invalid_count: number;
  compliance_rate: number;
  top_failing_events?: Array<{
    event?: string;
    event_name?: string;
    count?: number;
    error_count?: number;
  }>;
}

export default function ObservabilityPage() {
  const params = useParams<{ planId: string }>();
  const planId = params?.planId;
  const [errors, setErrors] = useState<DlqItem[]>([]);
  const [stats, setStats] = useState<ValidationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState("");
  const [versionFilter, setVersionFilter] = useState("");
  const [timeWindow, setTimeWindow] = useState("all");

  const filteredErrors = useMemo(() => {
    const eventQuery = eventFilter.trim().toLowerCase();
    const versionQuery = versionFilter.trim().toLowerCase();
    const now = Date.now();
    const windowMs =
      timeWindow === "1h"
        ? 60 * 60 * 1000
        : timeWindow === "24h"
          ? 24 * 60 * 60 * 1000
          : timeWindow === "7d"
            ? 7 * 24 * 60 * 60 * 1000
            : null;

    return errors.filter((error) => {
      const eventMatches =
        !eventQuery ||
        error.event_name.toLowerCase().includes(eventQuery) ||
        error.error_reason.toLowerCase().includes(eventQuery);
      const versionMatches =
        !versionQuery || (error.version_id ?? "").toLowerCase().includes(versionQuery);
      const timestamp = new Date(error.last_seen_at ?? error.created_at).getTime();
      const timeMatches = !windowMs || now - timestamp <= windowMs;

      return eventMatches && versionMatches && timeMatches;
    });
  }, [errors, eventFilter, timeWindow, versionFilter]);

  useEffect(() => {
    if (!planId) return;

    let cancelled = false;

    const fetchData = async () => {
      try {
        const [dlqResponse, statsResponse] = await Promise.all([
          dlqApi.list(planId),
          validationApi.stats(planId),
        ]);

        if (cancelled) return;

        setErrors(dlqResponse.data);
        setStats(statsResponse.data);
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();
    const intervalId = window.setInterval(fetchData, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [planId]);

  return (
    <div className="page-pad fade-in-up mx-auto h-full max-w-6xl overflow-y-auto">
      <div className="mb-6">
        <p className="section-label mb-3">Invalid payload queue</p>
        <h1 className="editorial-title flex items-center gap-3 text-4xl">
          <AlertCircle strokeWidth={1.6} /> Observability <span className="serif-italic">DLQ</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--text-secondary)]">
          Payloads from production that failed schema validation.
          <br />
          Auto-refreshing every 10 seconds.
        </p>
      </div>

      {stats && (
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div
            className="flex flex-col items-center justify-center rounded-xl border p-4 text-center"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <Activity className="mb-2 text-[var(--accent-strong)]" size={24} />
            <div className="metric-number text-4xl text-[var(--text-primary)]">{stats.compliance_rate.toFixed(1)}%</div>
            <div className="section-label mt-2">
              Compliance Rate
            </div>
          </div>
          <div
            className="flex flex-col items-center justify-center rounded-xl border p-4 text-center"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <CheckCircle className="mb-2 text-green-600" size={24} />
            <div className="metric-number text-4xl text-[var(--text-primary)]">{stats.valid_count}</div>
            <div className="section-label mt-2">
              Valid Payloads
            </div>
          </div>
          <div
            className="flex flex-col items-center justify-center rounded-xl border p-4 text-center"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <XCircle className="mb-2 text-red-600" size={24} />
            <div className="metric-number text-4xl text-[var(--text-primary)]">{stats.invalid_count}</div>
            <div className="section-label mt-2">
              Invalid Payloads
            </div>
          </div>
          <div
            className="flex flex-col justify-center rounded-xl border p-4"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="section-label mb-2">
              Top Failing Events
            </div>
            {stats.top_failing_events?.length ? (
              <div className="flex flex-col gap-2">
                {stats.top_failing_events.slice(0, 3).map((item) => {
                  const eventName = item.event_name ?? item.event ?? "unknown";
                  const count = item.error_count ?? item.count ?? 0;
                  return (
                    <div key={eventName} className="flex items-center justify-between text-sm">
                      <span className="truncate font-mono text-[var(--text-primary)]" title={eventName}>
                        {eventName}
                      </span>
                      <span className="rounded bg-red-400/10 px-1.5 font-medium text-red-400">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm font-medium text-[var(--text-secondary)]">None</div>
            )}
          </div>
        </div>
      )}

      <div className="card mb-6">
        <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <p className="section-label mb-2">Triage filters</p>
            <h2 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">
              Find recurring payload failures
            </h2>
            <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
              Narrow the DLQ by event, reason, published version, and last-seen time window.
            </p>
          </div>
          <div className="text-sm font-medium text-[var(--text-secondary)]">
            Showing {filteredErrors.length} of {errors.length}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px]">
          <label className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              className="input pl-11"
              placeholder="Filter by event or reason..."
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
            />
          </label>
          <input
            className="input"
            placeholder="Version id"
            value={versionFilter}
            onChange={(event) => setVersionFilter(event.target.value)}
          />
          <select
            className="input"
            value={timeWindow}
            onChange={(event) => setTimeWindow(event.target.value)}
          >
            <option value="all">All time</option>
            <option value="1h">Last hour</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7 days</option>
          </select>
        </div>
      </div>

      {loading && errors.length === 0 ? (
        <div className="flex justify-center p-10">
          <Loader2 className="animate-spin text-[var(--text-muted)]" />
        </div>
      ) : errors.length === 0 ? (
        <div className="card border-dashed p-12 text-center text-[var(--text-secondary)]">
          <AlertCircle size={32} className="mx-auto mb-3 text-red-500 opacity-20" />
          No failed payloads found. Your tracking is 100% compliant.
        </div>
      ) : filteredErrors.length === 0 ? (
        <div className="card border-dashed p-12 text-center text-[var(--text-secondary)]">
          <Search size={32} className="mx-auto mb-3 opacity-20" />
          No failed payloads match these filters.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredErrors.map((error) => (
            <div
              key={error.id}
              className="rounded-[1.75rem] border bg-[var(--surface)] p-5 shadow-sm"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                    <h3 className="font-mono text-lg font-medium text-[var(--text-primary)]">{error.event_name}</h3>
                  <div className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
                    {formatDistanceToNow(new Date(error.last_seen_at ?? error.created_at))} ago
                  </div>
                </div>
                <div className="rounded-md border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-400">
                  Validation Failed
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-[var(--text-secondary)]">
                <span>Count: {error.occurrence_count ?? 1}</span>
                {error.version_id ? <span>Version: {error.version_id}</span> : null}
                {error.first_seen_at ? (
                  <span>First seen: {new Date(error.first_seen_at).toLocaleString()}</span>
                ) : null}
              </div>

              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/10 bg-red-500/5 p-3 font-mono text-sm text-red-400">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error.error_reason}</span>
              </div>

              <div className="overflow-x-auto rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div className="section-label mb-2 flex items-center gap-2">
                  <FileJson size={14} /> Received Payload
                </div>
                <pre className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {JSON.stringify(error.payload, null, 2)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
