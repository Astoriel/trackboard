"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { codegenApi } from "@/lib/api";
import { Copy, Check } from "lucide-react";
import Editor from "@monaco-editor/react";

const TABS = [
  { key: "typescript", label: "TypeScript", lang: "typescript" },
  { key: "jsonSchema", label: "JSON Schema", lang: "json" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default function GeneratePage() {
  const { planId } = useParams<{ planId: string }>();
  const [tab, setTab] = useState<Tab>("typescript");
  const [content, setContent] = useState<Record<Tab, string>>({
    typescript: "",
    jsonSchema: "",
  });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!planId || content[tab]) return;
    setLoading(true);
    const fetcher = codegenApi[tab];

    fetcher(planId as string)
      .then((response) => {
        const text =
          typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data, null, 2);
        setContent((c) => ({ ...c, [tab]: text }));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tab, planId, content]);

  const copy = () => {
    navigator.clipboard.writeText(content[tab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const currentLang = TABS.find((t) => t.key === tab)?.lang || "plaintext";

  return (
    <div className="page-pad fade-in-up flex h-full flex-col">
      <p className="section-label mb-3">Generated contracts</p>
      <h2 className="editorial-title text-4xl">
        Code <span className="serif-italic">generation</span>
      </h2>
      <p className="mb-6 mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--text-secondary)]">
        Auto-generated typed code from your tracking plan. Copy and use in your project.
      </p>

      {/* Tabs */}
      <div className="mb-4 flex w-fit flex-wrap gap-1 rounded-full border bg-[var(--surface)] p-1 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
              tab === t.key
                ? "bg-[var(--brand)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Code area */}
      <div className="relative flex min-h-[400px] flex-1 flex-col overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3">
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {tab === "typescript" && "tracking-events.ts"}
            {tab === "jsonSchema" && "tracking-events.schema.json"}
          </span>
          <button onClick={copy} className="flex items-center gap-1.5 text-xs btn-ghost py-1">
            {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <div className="relative flex-1 bg-[var(--surface)]">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--text-muted)] border-t-transparent" />
            </div>
          ) : (
            <Editor
              height="100%"
              language={currentLang}
              theme="light"
              value={content[tab] || "No events in this plan yet."}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 13,
                fontFamily: "JetBrains Mono, monospace",
                wordWrap: "on",
                padding: { top: 16, bottom: 16 },
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
