"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  GitBranch,
  Search,
  ShieldCheck,
} from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";

const rows = [
  ["purchase_completed", "v4", "Received", "+ 200.00"],
  ["signup_started", "v4", "Sent", "- 20.00"],
  ["checkout_failed", "v3", "Blocked", "- 25.00"],
  ["trial_created", "v4", "Received", "+ 100.00"],
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--page)] text-[var(--text-primary)]">
      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-black/10 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-3">
            <BrandMark size="sm" />
            <span className="brand-word text-xl">trackboard</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost hidden sm:inline-flex">
              Sign in
            </Link>
            <Link href="/register" className="btn-primary inline-flex items-center gap-2">
              Start workspace <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-28">
        <section className="px-4 pb-16">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
            <div className="fade-in-up">
              <p className="section-label">Serious V1 analytics contracts</p>
              <h1 className="editorial-title mt-5 max-w-2xl text-6xl leading-[0.96] md:text-8xl">
                Tracking plans that feel like{" "}
                <span className="serif-italic whitespace-nowrap">product ops.</span>
              </h1>
              <p className="editorial-subtitle mt-7 max-w-xl text-lg">
                Import schemas, branch changes, publish immutable versions, validate live payloads, and triage DLQ without heavyweight enterprise tooling.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/register" className="btn-primary inline-flex items-center justify-center gap-2">
                  Open workspace <ArrowRight size={17} />
                </Link>
                <Link href="https://github.com/Astoriel/trackboard" className="btn-secondary inline-flex items-center justify-center">
                  View source
                </Link>
              </div>
            </div>

            <div className="app-frame min-h-[560px] border-[8px]">
              <aside className="hidden w-48 bg-[var(--sidebar)] p-4 text-white sm:block">
                <div className="mb-8 flex items-center gap-3">
                  <BrandMark tone="light" size="sm" />
                  <span className="brand-word text-lg">trackboard</span>
                </div>
                <div className="space-y-3 rounded-[2rem] bg-white/[0.07] p-2">
                  {["Dashboard", "Plans", "Review", "DLQ"].map((item, index) => (
                    <div
                      key={item}
                      className={`flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium ${
                        index === 1 ? "bg-white/20 text-white" : "text-white/60"
                      }`}
                    >
                      <span className="h-9 w-9 rounded-full bg-white/10" />
                      {item}
                    </div>
                  ))}
                </div>
              </aside>

              <div className="min-w-0 flex-1 overflow-hidden bg-[var(--surface-2)] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex w-80 max-w-[60%] items-center gap-3 rounded-full border bg-white px-4 py-3 text-sm font-semibold text-[var(--text-muted)] shadow-sm">
                    <Search size={18} className="text-[var(--text-primary)]" />
                    Search anything...
                  </div>
                  <div className="flex gap-2">
                    <span className="h-11 w-11 rounded-full bg-white shadow-sm" />
                    <span className="h-11 w-11 rounded-full bg-white shadow-sm" />
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-5">
                    <div className="brand-panel overflow-hidden rounded-[2rem] bg-[var(--brand)] p-4 text-white shadow-xl">
                      <div className="mb-5 flex items-center justify-between">
                        <div>
                          <p className="text-xl font-semibold">Published Version</p>
                          <p className="text-sm text-white/60">Available for validation</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium">v4</span>
                      </div>
                      <div className="rounded-[1.5rem] bg-white p-5 text-[var(--text-primary)]">
                        <p className="text-sm font-medium">Valid payload rate</p>
                        <p className="metric-number mt-2 text-5xl">
                          98<span className="text-[var(--text-muted)]">.4%</span>
                        </p>
                      </div>
                    </div>

                    <div className="card p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-semibold">Workflow</h3>
                          <p className="text-sm font-medium text-[var(--text-secondary)]">
                            Import to publish path
                          </p>
                        </div>
                        <ArrowRight size={18} />
                      </div>
                      <div className="flex -space-x-2">
                        {[GitBranch, Code2, ShieldCheck, CheckCircle2].map((Icon, index) => (
                          <span key={index} className="icon-disc h-12 w-12 border-4 border-white bg-[var(--surface-3)]">
                            <Icon size={18} />
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="card overflow-hidden p-0">
                    <div className="border-b px-6 py-5">
                      <h3 className="text-2xl font-semibold">Validation events</h3>
                      <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
                        Live contract history
                      </p>
                    </div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Version</th>
                          <th>Status</th>
                          <th>Delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(([name, version, status, delta]) => (
                          <tr key={name}>
                            <td className="font-mono font-semibold">{name}</td>
                            <td>{version}</td>
                            <td>
                              <span className="badge bg-[var(--surface-2)] text-[var(--text-primary)]">
                                {status}
                              </span>
                            </td>
                            <td className="font-mono">{delta}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-20">
          <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
            {[
              ["Branch safely", "Target main revision checks prevent silent overwrites and stale publishes."],
              ["Publish deliberately", "Compatibility reports are recorded with every immutable version."],
              ["Triage DLQ", "Invalid payloads aggregate by first seen, last seen, and occurrence count."],
            ].map(([title, body]) => (
              <div key={title} className="card oblique-card">
                <p className="text-xl font-semibold">{title}</p>
                <p className="mt-3 text-sm font-medium leading-6 text-[var(--text-secondary)]">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
