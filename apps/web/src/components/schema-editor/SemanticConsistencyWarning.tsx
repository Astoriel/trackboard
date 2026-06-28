"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, Loader2 } from "lucide-react";
import {
  consistencyApi,
  type ConsistencyCandidate,
  type ConsistencyPreviewPayload,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  planId: string;
  eventId?: string;
  eventName: string;
  description?: string | null;
  category?: string | null;
  properties?: ConsistencyPreviewPayload["properties"];
  disabled?: boolean;
  compact?: boolean;
  className?: string;
};

const labelText: Record<string, string> = {
  duplicate_likely: "Duplicate likely",
  possibly_related: "Possibly related",
  weak_signal: "Weak signal",
};

function formatRecommendation(value?: string | null) {
  if (!value) return "Needs human review";
  return value.replace(/_/g, " ");
}

export function SemanticConsistencyWarning({
  planId,
  eventId,
  eventName,
  description,
  category,
  properties,
  disabled = false,
  compact = false,
  className,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<ConsistencyCandidate[]>([]);
  const [dismissedName, setDismissedName] = useState("");

  const normalizedName = eventName.trim();
  const visibleCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.score >= 50).slice(0, compact ? 1 : 3),
    [candidates, compact],
  );

  useEffect(() => {
    if (disabled || !planId || normalizedName.length < 3 || dismissedName === normalizedName) {
      setCandidates([]);
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = eventId
          ? await consistencyApi.event(eventId)
          : await consistencyApi.preview(planId, {
              event_name: normalizedName,
              description: description ?? null,
              category: category ?? null,
              properties: properties ?? [],
            });

        if (!cancelled) {
          setCandidates(data.candidates ?? []);
        }
      } catch (requestError: any) {
        if (!cancelled) {
          setCandidates([]);
          const status = requestError?.response?.status;
          setError(
            status === 404
              ? "Semantic consistency preview is not available from this backend yet."
              : "Could not check semantic consistency right now.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [category, description, disabled, dismissedName, eventId, normalizedName, planId, properties]);

  if (!normalizedName || dismissedName === normalizedName) {
    return null;
  }

  if (loading) {
    return (
      <div
        className={cn(
          "rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)]",
          className,
        )}
      >
        <span className="inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          Checking for similar events...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-[1.25rem] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-700",
          className,
        )}
      >
        {error}
      </div>
    );
  }

  if (visibleCandidates.length === 0) {
    return null;
  }

  const topCandidate = visibleCandidates[0];

  return (
    <div className={cn("rounded-[1.25rem] border border-amber-500/25 bg-amber-500/10 p-4", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Deterministic finding: {labelText[topCandidate.label] ?? topCandidate.label}
            </p>
            <p className="mt-1 text-xs font-medium leading-5 text-[var(--text-secondary)]">
              {normalizedName} is similar to{" "}
              <span className="font-mono text-[var(--text-primary)]">
                {topCandidate.event_name}
              </span>{" "}
              with score {topCandidate.score}. Recommendation:{" "}
              {formatRecommendation(topCandidate.recommendation)}. This is advisory and will not
              block the current edit.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          onClick={() => setDismissedName(normalizedName)}
        >
          Continue anyway
        </button>
      </div>

      <div className="space-y-2">
        {visibleCandidates.map((candidate) => (
          <div
            key={`${candidate.event_id ?? candidate.event_name}-${candidate.score}`}
            className="rounded-2xl border bg-[var(--surface)] p-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                {candidate.event_name}
              </span>
              <span className="rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700">
                {candidate.score}
              </span>
            </div>
            {candidate.evidence?.length ? (
              <ul className="mt-2 space-y-1 text-xs font-medium leading-5 text-[var(--text-secondary)]">
                {candidate.evidence.slice(0, 2).map((item, index) => (
                  <li key={`${item.kind ?? "evidence"}-${index}`}>{item.detail}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
        <Bot size={13} />
        Ask AI explanation is available after the backend explanation route is enabled.
      </div>
    </div>
  );
}
