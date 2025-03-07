"use client";

interface TopFailuresProps {
  failures: Array<{ event_name?: string; property?: string; count: number }>;
  title?: string;
}

export function TopFailures({ failures, title = "Top Failures" }: TopFailuresProps) {
  if (!failures.length) {
    return (
      <div className="rounded-xl border bg-[var(--surface)] p-4">
        <p className="text-xs font-semibold text-[var(--text-muted)] mb-3">{title}</p>
        <p className="text-sm text-[var(--text-muted)] py-4 text-center">No failures 🎉</p>
      </div>
    );
  }

  const max = Math.max(...failures.map((f) => f.count), 1);

  return (
    <div className="rounded-xl border bg-[var(--surface)] p-4">
      <p className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">
        {title}
      </p>
      <div className="space-y-2">
        {failures.map((f, i) => {
          const pct = (f.count / max) * 100;
          const label = f.event_name ?? f.property ?? "unknown";
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium truncate max-w-[70%]">{label}</span>
                <span className="text-[var(--text-muted)] tabular-nums">{f.count}×</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-1.5 rounded-full bg-red-400 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
