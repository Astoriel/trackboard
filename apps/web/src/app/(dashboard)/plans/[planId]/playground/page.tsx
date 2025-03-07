"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Loader2, Play, XCircle } from "lucide-react";
import { validationApi, type ValidatePayload, type ValidationMode } from "@/lib/api";

interface Violation {
  code: string;
  message: string;
  path: string;
  event_name: string;
  property_name: string | null;
  expected: unknown;
  actual: unknown;
}

interface ValidationResult {
  valid: boolean;
  mode: ValidationMode;
  version_id: string | null;
  event: string;
  violations: Violation[];
  validated_at: string;
}

const SINGLE_EXAMPLE = JSON.stringify(
  {
    event: "signup_completed",
    properties: {
      user_id: "usr_123",
      signup_method: "google",
    },
  },
  null,
  2,
);

const BATCH_EXAMPLE = JSON.stringify(
  {
    events: [
      {
        event: "signup_completed",
        properties: { user_id: "usr_123", signup_method: "google" },
      },
      {
        event: "purchase_completed",
        properties: { order_id: "ord_123", amount: 42 },
      },
    ],
  },
  null,
  2,
);

function normalizePayload(input: unknown, mode: ValidationMode, source: string): ValidatePayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Each validation payload must be an object with an event field.");
  }

  const candidate = input as Record<string, unknown>;
  if (typeof candidate.event !== "string" || !candidate.event.trim()) {
    throw new Error("Each validation payload needs an event string.");
  }

  const properties =
    candidate.properties && typeof candidate.properties === "object" && !Array.isArray(candidate.properties)
      ? (candidate.properties as Record<string, unknown>)
      : {};

  return {
    ...candidate,
    event: candidate.event.trim(),
    properties,
    mode,
    source: source.trim() || "trackboard-ui",
  } as ValidatePayload;
}

export default function PlaygroundPage() {
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<HTMLInputElement>(null);
  const payloadRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<ValidationMode>("warn");
  const [batchMode, setBatchMode] = useState(false);
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const switchBatchMode = (enabled: boolean) => {
    setBatchMode(enabled);
    if (payloadRef.current) {
      payloadRef.current.value = enabled ? BATCH_EXAMPLE : SINGLE_EXAMPLE;
    }
    setResults([]);
    setError("");
  };

  const validate = async () => {
    const apiKeyValue = apiKeyRef.current?.value ?? "";
    const sourceValue = sourceRef.current?.value ?? "trackboard-ui";
    const payloadValue = payloadRef.current?.value ?? SINGLE_EXAMPLE;

    if (!apiKeyValue.trim()) {
      setError("Enter an API key from the Settings tab.");
      return;
    }

    setError("");
    setLoading(true);
    setResults([]);

    try {
      const parsed = JSON.parse(payloadValue);

      if (batchMode) {
        const rawEvents = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.events)
            ? parsed.events
            : null;
        if (!rawEvents?.length) {
          throw new Error("Batch mode expects an array or an object with events[].");
        }

        const normalized = rawEvents.map((item: unknown) => normalizePayload(item, mode, sourceValue));
        const { data } = await validationApi.batch(apiKeyValue.trim(), normalized);
        setResults(data);
      } else {
        if (Array.isArray(parsed)) {
          throw new Error("Single mode expects one validation object, not an array.");
        }
        const normalized = normalizePayload(parsed, mode, sourceValue);
        const { data } = await validationApi.validate(apiKeyValue.trim(), normalized);
        setResults([data]);
      }
    } catch (err: any) {
      if (err?.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err?.response?.data?.detail) {
        setError(
          typeof err.response.data.detail === "string"
            ? err.response.data.detail
            : JSON.stringify(err.response.data.detail),
        );
      } else if (err instanceof SyntaxError) {
        setError("Invalid JSON in payload.");
      } else {
        setError(err?.message ?? "Request failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-pad fade-in-up">
      <p className="section-label mb-3">Request lab</p>
      <h2 className="editorial-title text-4xl">
        Validation <span className="serif-italic">playground</span>
      </h2>
      <p className="mb-6 mt-3 text-sm font-medium leading-6 text-[var(--text-secondary)]">
        Send single or batch payloads through the same validation endpoints used by production SDKs.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              API Key
            </label>
            <input
              ref={apiKeyRef}
              type="password"
              className="input font-mono"
              placeholder="tb_live_..."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                Validation mode
              </label>
              <select
                className="input"
                value={mode}
                onChange={(event) => setMode(event.target.value as ValidationMode)}
              >
                <option value="warn">warn</option>
                <option value="block">block</option>
                <option value="quarantine">quarantine</option>
              </select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm font-medium text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={batchMode}
                onChange={(event) => switchBatchMode(event.target.checked)}
                className="h-4 w-4 accent-brand-600"
              />
              Batch endpoint
            </label>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              Source
            </label>
            <input
              ref={sourceRef}
              className="input"
              defaultValue="trackboard-ui"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              Event payload JSON
            </label>
            <textarea
              ref={payloadRef}
              className="input min-h-[320px] rounded-[1.75rem] font-mono text-sm"
              defaultValue={SINGLE_EXAMPLE}
              spellCheck={false}
            />
          </div>

          {error && (
            <div className="rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {error}
            </div>
          )}

          <button
            onClick={validate}
            disabled={loading}
            className="btn-primary flex w-full items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {loading ? "Validating..." : batchMode ? "Run Batch Validation" : "Run Validation"}
          </button>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
            Result
          </label>
          <div className="min-h-64 rounded-[1.75rem] border bg-[var(--surface)] p-5" style={{ borderColor: "var(--border)" }}>
            {!results.length && !loading && (
              <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                <Play size={32} className="mb-3 opacity-20" />
                <p className="text-sm text-[var(--text-secondary)]">
                  Run validation to see structured results here.
                </p>
              </div>
            )}

            {loading && (
              <div className="flex h-full items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-brand-400" />
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-4">
                {results.map((result, index) => (
                  <div key={`${result.event}-${index}`} className="rounded-[1.5rem] border bg-[var(--surface-2)] p-4" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-start gap-3">
                      {result.valid ? (
                        <CheckCircle2 size={22} className="mt-0.5 text-emerald-500" />
                      ) : (
                        <XCircle size={22} className="mt-0.5 text-red-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={`font-medium ${result.valid ? "text-emerald-600" : "text-red-600"}`}>
                            {result.valid ? "Valid" : "Invalid"}
                          </p>
                          <span className="outline-pill">{result.mode}</span>
                          {result.version_id && <span className="outline-pill">version {result.version_id.slice(0, 8)}</span>}
                        </div>
                        <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">{result.event}</p>
                      </div>
                    </div>

                    {result.violations.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="section-label">Violations</p>
                        {result.violations.map((violation, violationIndex) => (
                          <div key={`${violation.code}-${violationIndex}`} className="rounded-2xl border border-red-200 bg-red-50 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-medium text-red-700">{violation.code}</span>
                              <span className="text-xs text-red-500">{violation.path}</span>
                            </div>
                            <p className="mt-1 text-sm text-red-700">{violation.message}</p>
                            {(violation.expected !== null || violation.actual !== null) && (
                              <p className="mt-1 font-mono text-xs text-red-500">
                                expected {JSON.stringify(violation.expected)} / actual {JSON.stringify(violation.actual)}
                              </p>
                            )}
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
      </div>
    </div>
  );
}
