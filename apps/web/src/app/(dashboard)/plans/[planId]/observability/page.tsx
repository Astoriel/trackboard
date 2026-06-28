"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  FileJson,
  Loader2,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useParams } from "next/navigation";
import { ImplementationStatusTable } from "@/components/validation/ImplementationStatusTable";
import {
  dlqApi,
  validationApi,
  type DlqGroup,
  type DlqGroupDetail,
  type DlqTriageReport,
  type ImplementationStatusEvent,
} from "@/lib/api";

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

type TriageState = {
  loading?: boolean;
  error?: string;
  report?: DlqTriageReport;
};

type DlqSample = {
  id?: string;
  payload?: Record<string, unknown>;
  redacted_payload?: Record<string, unknown>;
  error_reason?: string;
  created_at?: string;
};

const fallbackFingerprint = (item: DlqItem) =>
  `fallback:${item.version_id ?? "draft"}:${item.event_name}:${item.error_reason}`;

function buildFallbackGroups(items: DlqItem[]): DlqGroup[] {
  const byFingerprint = new Map<string, DlqGroup>();

  items.forEach((item) => {
    const fingerprint = fallbackFingerprint(item);
    const current = byFingerprint.get(fingerprint);
    const count = item.occurrence_count ?? 1;
    const firstSeen = item.first_seen_at ?? item.created_at;
    const lastSeen = item.last_seen_at ?? item.created_at;

    if (!current) {
      byFingerprint.set(fingerprint, {
        fingerprint,
        event_name: item.event_name,
        version_id: item.version_id,
        count,
        first_seen_at: firstSeen,
        last_seen_at: lastSeen,
        top_violation: {
          code: "validation_failed",
          path: null,
          expected: item.error_reason,
          actual: null,
        },
        sample_count: 1,
        has_triage_report: false,
        deterministic_summary: item.error_reason,
      });
      return;
    }

    current.count += count;
    current.sample_count = (current.sample_count ?? 0) + 1;
    if (firstSeen && (!current.first_seen_at || new Date(firstSeen) < new Date(current.first_seen_at))) {
      current.first_seen_at = firstSeen;
    }
    if (lastSeen && (!current.last_seen_at || new Date(lastSeen) > new Date(current.last_seen_at))) {
      current.last_seen_at = lastSeen;
    }
  });

  return [...byFingerprint.values()].sort((left, right) => right.count - left.count);
}

function deterministicSummary(group: DlqGroup) {
  if (group.deterministic_summary) return group.deterministic_summary;

  const violation = group.top_violation;
  const expectedActual =
    violation?.expected || violation?.actual
      ? ` Expected ${violation.expected ?? "contract value"}; received ${violation.actual ?? "payload value"}.`
      : "";
  const path = violation?.path ? ` at ${violation.path}` : "";

  return `${group.count} rejected ${group.event_name} payload${group.count === 1 ? "" : "s"}${path}.${expectedActual}`;
}

function statusMessage(error: unknown, fallback: string) {
  const response = (error as any)?.response;
  const detail = response?.data?.detail ?? response?.data?.message;
  if (typeof detail === "string") return detail;
  if (response?.status === 404) return "This backend does not expose grouped DLQ triage yet.";
  if (response?.status === 409 || response?.status === 503) {
    return "AI provider is not configured. Deterministic issue summary is still available.";
  }
  return fallback;
}

export default function ObservabilityPage() {
  const params = useParams<{ planId: string }>();
  const planId = params?.planId;
  const [rawRows, setRawRows] = useState<DlqItem[]>([]);
  const [groups, setGroups] = useState<DlqGroup[]>([]);
  const [implementationStatus, setImplementationStatus] = useState<ImplementationStatusEvent[]>([]);
  const [stats, setStats] = useState<ValidationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupsUnavailable, setGroupsUnavailable] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [versionFilter, setVersionFilter] = useState("");
  const [timeWindow, setTimeWindow] = useState("all");
  const [expandedFingerprint, setExpandedFingerprint] = useState("");
  const [groupDetails, setGroupDetails] = useState<Record<string, DlqGroupDetail>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [triageByFingerprint, setTriageByFingerprint] = useState<Record<string, TriageState>>({});
  const [revealedSamples, setRevealedSamples] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    if (!planId) return;

    try {
      const [statsResponse, implementationResponse, groupedResponse] = await Promise.allSettled([
        validationApi.stats(planId),
        validationApi.implementationStatus(planId, timeWindow),
        dlqApi.groups(planId),
      ]);

      if (statsResponse.status === "fulfilled") {
        setStats(statsResponse.value.data);
      }

      if (implementationResponse.status === "fulfilled") {
        setImplementationStatus(implementationResponse.value.data.events ?? []);
      }

      if (groupedResponse.status === "fulfilled") {
        setGroups(groupedResponse.value.data.groups ?? []);
        setGroupsUnavailable("");
      } else {
        const rowsResponse = await dlqApi.list(planId);
        setRawRows(rowsResponse.data);
        setGroups(buildFallbackGroups(rowsResponse.data));
        setGroupsUnavailable(statusMessage(groupedResponse.reason, "Grouped DLQ triage is not available yet."));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [planId, timeWindow]);

  useEffect(() => {
    if (!planId) return;

    let cancelled = false;
    const refresh = async () => {
      if (!cancelled) {
        await loadData();
      }
    };

    void refresh();
    const intervalId = window.setInterval(refresh, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [loadData, planId]);

  const filteredGroups = useMemo(() => {
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

    return groups.filter((group) => {
      const summary = deterministicSummary(group).toLowerCase();
      const eventMatches =
        !eventQuery ||
        group.event_name.toLowerCase().includes(eventQuery) ||
        summary.includes(eventQuery) ||
        group.fingerprint.toLowerCase().includes(eventQuery);
      const versionMatches =
        !versionQuery || (group.version_id ?? "").toLowerCase().includes(versionQuery);
      const timestamp = group.last_seen_at ? new Date(group.last_seen_at).getTime() : Date.now();
      const timeMatches = !windowMs || now - timestamp <= windowMs;

      return eventMatches && versionMatches && timeMatches;
    });
  }, [eventFilter, groups, timeWindow, versionFilter]);

  const rawRowsByFingerprint = useMemo(() => {
    const map = new Map<string, DlqItem[]>();
    rawRows.forEach((row) => {
      const fingerprint = fallbackFingerprint(row);
      map.set(fingerprint, [...(map.get(fingerprint) ?? []), row]);
    });
    return map;
  }, [rawRows]);

  const loadGroupDetail = async (fingerprint: string) => {
    if (!planId || groupDetails[fingerprint] || fingerprint.startsWith("fallback:")) return;

    setDetailLoading((current) => ({ ...current, [fingerprint]: true }));
    setDetailErrors((current) => ({ ...current, [fingerprint]: "" }));
    try {
      const { data } = await dlqApi.group(planId, fingerprint);
      setGroupDetails((current) => ({ ...current, [fingerprint]: data }));
    } catch (error) {
      setDetailErrors((current) => ({
        ...current,
        [fingerprint]: statusMessage(error, "Could not load grouped issue details."),
      }));
    } finally {
      setDetailLoading((current) => ({ ...current, [fingerprint]: false }));
    }
  };

  const toggleGroup = async (fingerprint: string) => {
    const next = expandedFingerprint === fingerprint ? "" : fingerprint;
    setExpandedFingerprint(next);
    if (next) {
      await loadGroupDetail(next);
    }
  };

  const askAiToTriage = async (fingerprint: string) => {
    if (!planId) return;

    setTriageByFingerprint((current) => ({
      ...current,
      [fingerprint]: { loading: true },
    }));

    try {
      const { data } = await dlqApi.triage(planId, fingerprint);
      setTriageByFingerprint((current) => ({
        ...current,
        [fingerprint]: { report: data },
      }));
    } catch (error) {
      setTriageByFingerprint((current) => ({
        ...current,
        [fingerprint]: {
          error: statusMessage(error, "AI triage failed. Deterministic issue summary is still available."),
        },
      }));
    }
  };

  return (
    <div className="page-pad fade-in-up mx-auto h-full max-w-6xl overflow-y-auto">
      <div className="mb-6">
        <p className="section-label mb-3">Invalid payload queue</p>
        <h1 className="editorial-title flex items-center gap-3 text-4xl">
          <AlertCircle strokeWidth={1.6} /> Observability <span className="serif-italic">DLQ</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--text-secondary)]">
          Recurring validation failures grouped into deterministic issues. AI triage is optional and
          never changes contracts or replays events.
        </p>
      </div>

      {stats && (
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="flex flex-col items-center justify-center rounded-xl border bg-[var(--surface)] p-4 text-center" style={{ borderColor: "var(--border)" }}>
            <Activity className="mb-2 text-[var(--accent-strong)]" size={24} />
            <div className="metric-number text-4xl text-[var(--text-primary)]">{stats.compliance_rate.toFixed(1)}%</div>
            <div className="section-label mt-2">Compliance Rate</div>
          </div>
          <div className="flex flex-col items-center justify-center rounded-xl border bg-[var(--surface)] p-4 text-center" style={{ borderColor: "var(--border)" }}>
            <CheckCircle className="mb-2 text-green-600" size={24} />
            <div className="metric-number text-4xl text-[var(--text-primary)]">{stats.valid_count}</div>
            <div className="section-label mt-2">Valid Payloads</div>
          </div>
          <div className="flex flex-col items-center justify-center rounded-xl border bg-[var(--surface)] p-4 text-center" style={{ borderColor: "var(--border)" }}>
            <XCircle className="mb-2 text-red-600" size={24} />
            <div className="metric-number text-4xl text-[var(--text-primary)]">{stats.invalid_count}</div>
            <div className="section-label mt-2">Invalid Payloads</div>
          </div>
          <div className="flex flex-col justify-center rounded-xl border bg-[var(--surface)] p-4" style={{ borderColor: "var(--border)" }}>
            <div className="section-label mb-2">Top Failing Events</div>
            {stats.top_failing_events?.length ? (
              <div className="flex flex-col gap-2">
                {stats.top_failing_events.slice(0, 3).map((item) => {
                  const eventName = item.event_name ?? item.event ?? "unknown";
                  const count = item.error_count ?? item.count ?? 0;
                  return (
                    <div key={eventName} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-mono text-[var(--text-primary)]" title={eventName}>
                        {eventName}
                      </span>
                      <span className="rounded bg-red-400/10 px-1.5 font-medium text-red-400">{count}</span>
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

      <ImplementationStatusTable events={implementationStatus} loading={loading} period={timeWindow} />

      <div className="card mb-6">
        <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <p className="section-label mb-2">Issue filters</p>
            <h2 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">
              Grouped validation issues
            </h2>
            <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
          Grouping is deterministic. AI can enrich a selected report when a provider is configured.
            </p>
          </div>
          <div className="text-sm font-medium text-[var(--text-secondary)]">
            Showing {filteredGroups.length} of {groups.length}
          </div>
        </div>

        {groupsUnavailable && (
          <div className="mb-4 rounded-[1.25rem] border border-amber-500/25 bg-amber-500/10 p-3 text-sm font-medium text-amber-700">
            {groupsUnavailable} Falling back to local grouping from raw DLQ rows.
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px]">
          <label className="relative">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              className="input pl-11"
              placeholder="Filter by event, reason, or fingerprint..."
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
          <select className="input" value={timeWindow} onChange={(event) => setTimeWindow(event.target.value)}>
            <option value="all">All time</option>
            <option value="1h">Last hour</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7 days</option>
          </select>
        </div>
      </div>

      {loading && groups.length === 0 ? (
        <div className="flex justify-center p-10">
          <Loader2 className="animate-spin text-[var(--text-muted)]" />
        </div>
      ) : groups.length === 0 ? (
        <div className="card border-dashed p-12 text-center text-[var(--text-secondary)]">
          <ShieldCheck size={32} className="mx-auto mb-3 text-green-500 opacity-30" />
          No failed payload groups found.
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="card border-dashed p-12 text-center text-[var(--text-secondary)]">
          <Search size={32} className="mx-auto mb-3 opacity-20" />
          No DLQ groups match these filters.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredGroups.map((group) => {
            const expanded = expandedFingerprint === group.fingerprint;
            const triage = triageByFingerprint[group.fingerprint];
            const detail = groupDetails[group.fingerprint];
            const fallbackRows = rawRowsByFingerprint.get(group.fingerprint) ?? [];
            const samples: DlqSample[] = detail?.redacted_samples?.map((sample, index) => ({
              id: `${group.fingerprint}-${index}`,
              redacted_payload: sample,
            })) ?? fallbackRows.map((row) => ({
              id: row.id,
              payload: row.payload,
              redacted_payload: undefined,
              error_reason: row.error_reason,
              created_at: row.created_at,
            }));
            const contractExpectation = detail?.fingerprint_material?.contract_expectation;
            const sourceSummary = [
              group.source_summary?.source_label,
              ...(group.source_summary?.platforms ?? []),
              ...(group.source_summary?.app_versions ?? []).map((version) => `app ${version}`),
            ].filter(Boolean);

            return (
              <div key={group.fingerprint} className="rounded-[1.5rem] border bg-[var(--surface)] p-5 shadow-sm" style={{ borderColor: "var(--border)" }}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <button
                    type="button"
                    onClick={() => void toggleGroup(group.fingerprint)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <h3 className="truncate font-mono text-lg font-medium text-[var(--text-primary)]">
                        {group.event_name}
                      </h3>
                      <span className="rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-red-500">
                        {group.count} rejected
                      </span>
                    </div>
                    <p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">
                      {deterministicSummary(group)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                      {group.version_id ? <span>Version: {group.version_id}</span> : null}
                      {group.last_seen_at ? (
                        <span>Last seen {formatDistanceToNow(new Date(group.last_seen_at))} ago</span>
                      ) : null}
                      {sourceSummary.length ? <span>Source: {sourceSummary.join(", ")}</span> : null}
                      <span>Fingerprint: {group.fingerprint.slice(0, 18)}...</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => void askAiToTriage(group.fingerprint)}
                    disabled={triage?.loading || group.fingerprint.startsWith("fallback:")}
                    className="btn-primary flex items-center justify-center gap-2"
                    title={
                      group.fingerprint.startsWith("fallback:")
                        ? "Grouped triage route is required before report generation can run."
                        : "Generate an evidence-bound triage report for this grouped issue"
                    }
                  >
                    {triage?.loading ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                    {triage?.loading ? "Triaging..." : "Generate triage report"}
                  </button>
                </div>

                {triage?.error && (
                  <div className="mt-4 rounded-[1.25rem] border border-amber-500/25 bg-amber-500/10 p-3 text-sm font-medium text-amber-700">
                    {triage.error}
                  </div>
                )}

                {triage?.report && (
                  <div className="mt-4 rounded-[1.25rem] border bg-[var(--surface-2)] p-4" style={{ borderColor: "var(--border)" }}>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="section-label">
                        {triage.report.status === "deterministic_only" ? "Deterministic triage" : "AI explanation"}
                      </span>
                      {triage.report.confidence ? (
                        <span className="outline-pill">{triage.report.confidence} confidence</span>
                      ) : null}
                    </div>
                    <p className="text-sm font-medium leading-6 text-[var(--text-primary)]">
                      {triage.report.summary ?? triage.report.message ?? "AI triage completed without a summary."}
                    </p>
                    {triage.report.likely_root_cause && (
                      <p className="mt-2 text-sm font-medium leading-6 text-[var(--text-secondary)]">
                        Likely root cause: {triage.report.likely_root_cause}
                      </p>
                    )}
                    {triage.report.evidence?.length ? (
                      <div className="mt-3">
                        <p className="section-label mb-2">Evidence</p>
                        <ul className="space-y-1 text-sm font-medium text-[var(--text-secondary)]">
                          {triage.report.evidence.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {triage.report.recommended_actions?.length ? (
                      <div className="mt-3">
                        <p className="section-label mb-2">Suggested actions</p>
                        <div className="grid gap-2 md:grid-cols-2">
                          {triage.report.recommended_actions.map((action) => (
                            <div key={`${action.kind ?? "action"}-${action.title}`} className="rounded-2xl border bg-[var(--surface)] p-3" style={{ borderColor: "var(--border)" }}>
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-[var(--text-primary)]">{action.title}</p>
                                {action.risk ? <span className="outline-pill">{action.risk} risk</span> : null}
                              </div>
                              {action.rationale && (
                                <p className="mt-2 text-xs font-medium leading-5 text-[var(--text-secondary)]">
                                  {action.rationale}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {triage.report.redaction && (
                      <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-700">
                        Redaction report: {(triage.report.redaction.payload_fields_redacted ?? []).join(", ") || "no named fields reported"}; sample values redacted: {triage.report.redaction.sample_values_redacted ?? 0}.
                      </div>
                    )}
                  </div>
                )}

                {expanded && (
                  <div className="mt-4 rounded-[1.25rem] border bg-[var(--surface-2)] p-4" style={{ borderColor: "var(--border)" }}>
                    {detailLoading[group.fingerprint] ? (
                      <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
                        <Loader2 size={14} className="animate-spin" />
                        Loading issue details...
                      </div>
                    ) : detailErrors[group.fingerprint] ? (
                      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm font-medium text-amber-700">
                        {detailErrors[group.fingerprint]}
                      </div>
                    ) : (
                      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                        <div>
                          <p className="section-label mb-2">Deterministic finding</p>
                          <div className="rounded-2xl border bg-[var(--surface)] p-3 text-sm font-medium leading-6 text-[var(--text-secondary)]" style={{ borderColor: "var(--border)" }}>
                            <p>{deterministicSummary(group)}</p>
                            {group.top_violation?.code ? <p>Code: {group.top_violation.code}</p> : null}
                            {group.top_violation?.path ? <p>Path: {group.top_violation.path}</p> : null}
                          </div>
                        </div>
                        <div>
                          <p className="section-label mb-2">Contract expectation</p>
                          <div className="rounded-2xl border bg-[var(--surface)] p-3 text-sm font-medium leading-6 text-[var(--text-secondary)]" style={{ borderColor: "var(--border)" }}>
                            {contractExpectation ? (
                              <pre className="whitespace-pre-wrap font-mono text-xs">
                                {typeof contractExpectation === "string"
                                  ? contractExpectation
                                  : JSON.stringify(contractExpectation, null, 2)}
                              </pre>
                            ) : (
                              <p>{group.top_violation?.expected ?? "No contract expectation returned for this group."}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-4">
                      <button
                        type="button"
                        className="btn-secondary flex items-center gap-2"
                        onClick={() =>
                          setRevealedSamples((current) => ({
                            ...current,
                            [group.fingerprint]: !current[group.fingerprint],
                          }))
                        }
                      >
                        <FileJson size={14} />
                        {revealedSamples[group.fingerprint] ? "Hide samples" : "View samples"}
                      </button>

                      {revealedSamples[group.fingerprint] && (
                        <div className="mt-3 space-y-3">
                          {samples.length ? (
                            samples.slice(0, 3).map((sample, index) => (
                              <div key={sample.id ?? index} className="rounded-2xl border bg-[var(--surface)] p-3" style={{ borderColor: "var(--border)" }}>
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                  <p className="section-label">
                                    {sample.redacted_payload ? "Redacted sample" : "Raw sample"}
                                  </p>
                                  {sample.created_at ? (
                                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                                      {new Date(sample.created_at).toLocaleString()}
                                    </span>
                                  ) : null}
                                </div>
                                <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-xs font-semibold text-[var(--text-primary)]">
                                  {JSON.stringify(sample.redacted_payload ?? sample.payload ?? {}, null, 2)}
                                </pre>
                                {!sample.redacted_payload && (
                                  <p className="mt-2 text-xs font-semibold text-amber-700">
                                    Raw payload shown after explicit reveal. Prefer redacted samples once the grouped DLQ route returns them.
                                  </p>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="rounded-2xl border border-dashed p-4 text-sm font-medium text-[var(--text-secondary)]">
                              No samples returned for this group.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
