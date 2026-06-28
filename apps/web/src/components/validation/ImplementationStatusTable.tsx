"use client";

import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, CircleDashed, CircleSlash, Split } from "lucide-react";
import type { ImplementationStatusEvent } from "@/lib/api";

type Props = {
  events: ImplementationStatusEvent[];
  loading?: boolean;
  period: string;
};

const statusCopy = {
  never_seen: {
    label: "Never seen",
    className: "border-slate-400/20 bg-slate-400/10 text-slate-500",
    icon: CircleDashed,
  },
  seen_valid: {
    label: "Valid",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
    icon: CheckCircle2,
  },
  seen_invalid: {
    label: "Invalid",
    className: "border-red-500/20 bg-red-500/10 text-red-600",
    icon: CircleSlash,
  },
  mixed: {
    label: "Mixed",
    className: "border-amber-500/25 bg-amber-500/10 text-amber-700",
    icon: Split,
  },
};

function timeAgo(value?: string | null) {
  if (!value) return "Not seen";
  return `${formatDistanceToNow(new Date(value))} ago`;
}

function statusSortValue(event: ImplementationStatusEvent) {
  const order = {
    seen_invalid: 0,
    mixed: 1,
    never_seen: 2,
    seen_valid: 3,
  };
  return order[event.status] ?? 4;
}

export function ImplementationStatusTable({ events, loading, period }: Props) {
  const rows = [...events].sort((left, right) => {
    const statusDelta = statusSortValue(left) - statusSortValue(right);
    if (statusDelta !== 0) return statusDelta;
    return left.event_name.localeCompare(right.event_name);
  });

  return (
    <section className="mb-6 rounded-[1.25rem] border bg-[var(--surface)] p-4 shadow-sm" style={{ borderColor: "var(--border)" }}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-label mb-2">Implementation status</p>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Source coverage by event</h2>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          {period === "all" ? "All time" : period}
        </span>
      </div>

      {loading && rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-5 text-sm font-medium text-[var(--text-secondary)]">
          Loading implementation status...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-5 text-sm font-medium text-[var(--text-secondary)]">
          No planned events found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]" style={{ borderColor: "var(--border)" }}>
              <tr>
                <th className="py-2 pr-4">Event</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Valid</th>
                <th className="px-3 py-2 text-right">Invalid</th>
                <th className="px-3 py-2">Last seen</th>
                <th className="px-3 py-2">Sources</th>
                <th className="py-2 pl-3">Versions</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
              {rows.map((event) => {
                const config = statusCopy[event.status];
                const Icon = config.icon;
                return (
                  <tr key={event.event_name}>
                    <td className="max-w-[220px] py-3 pr-4">
                      <span className="block truncate font-mono font-semibold text-[var(--text-primary)]" title={event.event_name}>
                        {event.event_name}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${config.className}`}>
                        <Icon size={13} />
                        {config.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-[var(--text-primary)]">{event.valid_count}</td>
                    <td className="px-3 py-3 text-right font-semibold text-[var(--text-primary)]">{event.invalid_count}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-[var(--text-secondary)]">{timeAgo(event.last_seen_at)}</td>
                    <td className="max-w-[180px] px-3 py-3 font-medium text-[var(--text-secondary)]">
                      <span className="block truncate" title={event.source_labels.join(", ")}>
                        {event.source_labels.length ? event.source_labels.join(", ") : "-"}
                      </span>
                    </td>
                    <td className="max-w-[160px] py-3 pl-3 font-mono text-xs font-semibold text-[var(--text-secondary)]">
                      <span className="block truncate" title={event.version_ids.join(", ")}>
                        {event.version_ids.length ? event.version_ids.map((id) => id.slice(0, 8)).join(", ") : "-"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
