"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { BrandMark } from "@/components/brand/BrandMark";

export default function LoginPage() {
  const router = useRouter();
  const { setTokens, setUser } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      setTokens(res.data.access_token, res.data.refresh_token);
      const me = await authApi.me();
      setUser(me.data.user, me.data.org_id, me.data.org_name, me.data.role);
      router.push("/plans");
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell flex items-center justify-center">
      <div className="app-frame min-h-[760px] max-w-5xl">
        <section className="hidden w-[42%] flex-col justify-between bg-[var(--sidebar)] p-7 text-white md:flex">
          <div>
            <div className="mb-12 flex items-center gap-3">
              <BrandMark tone="light" />
              <span className="brand-word text-2xl">trackboard</span>
            </div>
            <p className="section-label text-white/40">Serious V1</p>
            <h1 className="mt-4 max-w-xs text-5xl font-semibold leading-[1.05] tracking-[-0.045em]">
              Contract-first analytics, without the{" "}
              <span className="serif-italic">enterprise fog.</span>
            </h1>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.08] p-5">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-[var(--sidebar)]">
              <ShieldCheck size={22} />
            </div>
            <p className="text-sm font-semibold leading-6 text-white/70">
              Publish immutable versions, validate production payloads, and triage DLQ errors from one source-of-truth workspace.
            </p>
          </div>
        </section>

        <section className="flex flex-1 items-center justify-center bg-[var(--surface-2)] p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <p className="section-label">Welcome back</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                Sign in
              </h2>
              <p className="mt-2 text-sm font-medium text-[var(--text-secondary)]">
                Continue to your tracking plan workspace.
              </p>
            </div>

            <form method="post" onSubmit={handleSubmit} className="card space-y-4">
              {error && (
                <div className="rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="email" className="section-label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!isMounted || loading}
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="section-label">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!isMounted || loading}
                  required
                />
              </div>

              <button type="submit" className="btn-primary flex w-full items-center justify-center gap-2" disabled={!isMounted || loading}>
                {loading ? "Signing in..." : "Sign in"}
                <ArrowRight size={17} />
              </button>

              <p className="text-center text-xs font-semibold text-[var(--text-muted)]">
                No account?{" "}
                <Link href="/register" className="text-[var(--text-primary)] underline-offset-4 hover:underline">
                  Create account
                </Link>
              </p>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
