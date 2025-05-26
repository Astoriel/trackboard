"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { validationApi } from "@/lib/api";
import {
  CheckCircle2,
  XCircle,
  Activity,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { formatRelative } from "@/lib/utils";

interface ValidationEvent {
  event: string;
  valid: boolean;
  errors: Array<{ property: string; error: string; type: string }>;
  validated_at: string;
}

interface Stats {
  total_events: number;
  valid_count: number;
  invalid_count: number;
  compliance_rate: number;
  top_failing_events: Array<{ event: string; count: number }>;
  top_failing_properties: Array<{ property: string; count: number }>;
  period: string;
}

export default function LivePage() {
  const { planId } = useParams<{ planId: string }>();
  const [feed, setFeed] = useState<ValidationEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [period, setPeriod] = useState("24h");
  const [connected, setConnected] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // Load stats
  useEffect(() => {
    if (!planId) return;
    validationApi.stats(planId, period).then((r) => setStats(r.data));
  }, [planId, period]);

  // WebSocket connection
  useEffect(() => {
    if (!planId) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const wsBase = apiBase.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsBase}/api/v1/ws/live/${planId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (msg) => {
      try {
        const data: ValidationEvent = JSON.parse(msg.data);
        setFeed((prev) => [data, ...prev].slice(0, 100));
        // Auto-refresh stats every 10 events
        setFeed((prev) => {
          if (prev.length % 10 === 0) {
            validationApi.stats(planId, period).then((r) => setStats(r.data));
          }
          return prev;
        });
      } catch {}
    };

    // Keepalive ping
    const interval = setInterval(() => ws.readyState === 1 && ws.send("ping"), 30000);
    return () => {
      clearInterval(interval);
      ws.close();
    };
  }, [planId, period]);

  const complianceColor =
    !stats ? "var(--text-muted)" :
    stats.compliance_rate >= 95 ? "var(--success)" :
    stats.compliance_rate >= 80 ? "var(--warning)" : "var(--danger)";

  return (
    <div className="page-pad fade-in-up">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="section-label mb-3">Realtime feed</p>
          <h2 className="editorial-title text-4xl">
            Live <span className="serif-italic">validation</span>
          </h2>
          <p className="mt-3 text-sm font-medium leading-6" style={{ color: "var(--text-secondary)" }}>
            Real-time feed of events validated against this tracking plan.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <select
            className="input w-28 py-1.5 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="24h">24 hours</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
          </select>
          {/* Connection badge */}
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            style={{
              background: connected ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
              color: connected ? "var(--success)" : "var(--danger)",
            }}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
            {connected ? "Live" : "Disconnected"}
          </div>
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total Events", value: stats.total_events.toLocaleString(), icon: Activity },
            { label: "Valid", value: stats.valid_count.toLocaleString(), icon: CheckCircle2, color: "var(--success)" },
            { label: "Invalid", value: stats.invalid_count.toLocaleString(), icon: XCircle, color: "var(--danger)" },
            { label: "Compliance", value: `${stats.compliance_rate}%`, icon: TrendingUp, color: complianceColor },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card flex items-center gap-3">
              <Icon size={20} strokeWidth={1.6} style={{ color: color || "var(--text-secondary)" }} />
              <div>
                <p className="metric-number text-lg text-[var(--text-primary)]">{value}</p>
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Live feed */}
        <div className="lg:col-span-2">
          <h3 className="mb-3 text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">Event Stream</h3>
          <div
            ref={feedRef}
            className="overflow-hidden rounded-[2rem] border"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            {feed.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <Activity size={32} className="mb-3 opacity-20" />
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Waiting for events...
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  Send a POST to <code className="text-[var(--brand)] font-medium">/api/v1/validate</code>
                </p>
              </div>
            ) : (
              <div className="divide-y max-h-[500px] overflow-y-auto" style={{ borderColor: "var(--border)" }}>
                {feed.map((item, i) => (
                  <div
                    key={i}
                    className="cursor-pointer px-4 py-3 hover:bg-[var(--surface-2)] transition-colors"
                    onClick={() => setExpanded(expanded === `${i}` ? null : `${i}`)}
                  >
                    <div className="flex items-center gap-3">
                      {item.valid
                        ? <CheckCircle2 size={15} className="flex-shrink-0 text-emerald-500" />
                        : <XCircle size={15} className="flex-shrink-0 text-red-500" />}
                      <code className="flex-1 font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                        {item.event}
                      </code>
                      {!item.valid && (
                        <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-medium text-red-600">
                          {item.errors.length} error{item.errors.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {formatRelative(item.validated_at)}
                      </span>
                    </div>
                    {expanded === `${i}` && !item.valid && (
                      <div className="mt-2 ml-6 space-y-1">
                        {item.errors.map((err, j) => (
                          <div key={j} className="flex gap-2 text-xs">
                            <span className="font-mono text-red-600 font-medium">{err.property}</span>
                            <span style={{ color: "var(--text-secondary)" }}>{err.error}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top failures */}
        {stats && (stats.top_failing_events?.length ?? 0) > 0 && (
          <div>
            <h3 className="mb-3 text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">Top Failures</h3>
            <div className="card space-y-3">
              {stats.top_failing_events?.map((item) => (
                <div key={item.event} className="flex items-center gap-3">
                  <AlertTriangle size={13} className="flex-shrink-0 text-amber-500" />
                  <span className="flex-1 font-mono text-xs text-[var(--text-primary)] font-medium truncate">{item.event}</span>
                  <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-medium text-red-600">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>

            {(stats.top_failing_properties?.length ?? 0) > 0 && (
              <div className="mt-4 card space-y-3">
                <p className="mb-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  FAILING PROPERTIES
                </p>
                {stats.top_failing_properties?.map((item) => (
                  <div key={item.property} className="flex items-center gap-3">
                    <span className="flex-1 font-mono text-xs text-[var(--text-primary)] font-medium truncate">{item.property}</span>
                    <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-600">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
