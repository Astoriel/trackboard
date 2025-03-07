"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle, XCircle } from "lucide-react";
import type { ValidationEvent } from "@/hooks/useWebSocket";

interface EventLogTableProps {
  events: ValidationEvent[];
  maxRows?: number;
}

export function EventLogTable({ events, maxRows = 100 }: EventLogTableProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const visible = events.slice(0, maxRows);

  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-[var(--surface-2)]">
            <th className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)] text-xs w-8" />
            <th className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)] text-xs">Timestamp</th>
            <th className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)] text-xs">Event</th>
            <th className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)] text-xs">Status</th>
            <th className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)] text-xs">Source</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((ev, i) => (
            <>
              <tr
                key={i}
                className="border-b last:border-0 hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
                onClick={() => toggle(i)}
              >
                <td className="pl-3 py-2.5 text-[var(--text-muted)]">
                  {expanded.has(i) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </td>
                <td className="px-4 py-2.5 text-[var(--text-muted)] font-mono text-xs whitespace-nowrap">
                  {new Date(ev.validated_at).toLocaleTimeString()}
                </td>
                <td className="px-4 py-2.5 font-medium">{ev.event}</td>
                <td className="px-4 py-2.5">
                  {ev.is_valid ? (
                    <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                      <CheckCircle size={13} /> Valid
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-red-500 text-xs font-medium">
                      <XCircle size={13} /> {ev.errors.length} error{ev.errors.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[var(--text-muted)] text-xs">
                  {ev.source_label ?? "—"}
                </td>
              </tr>
              {expanded.has(i) && (
                <tr key={`${i}-detail`} className="bg-[var(--surface-2)] border-b last:border-0">
                  <td colSpan={5} className="px-6 py-3">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-[var(--text-muted)]">Payload</p>
                      <pre className="rounded-lg border bg-[var(--surface)] p-3 font-mono text-xs overflow-x-auto">
                        {JSON.stringify(ev.payload, null, 2)}
                      </pre>
                      {ev.errors.length > 0 && (
                        <>
                          <p className="text-xs font-semibold text-red-500 mt-2">Errors</p>
                          {ev.errors.map((e, j) => (
                            <div key={j} className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-2.5 text-xs">
                              <span className="font-medium">{e.property}</span>:{" "}
                              <span className="text-red-600">{e.error}</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
          {events.length === 0 && (
            <tr>
              <td colSpan={5} className="py-10 text-center text-sm text-[var(--text-muted)]">
                Waiting for events...
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
