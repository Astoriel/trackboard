"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, GitBranch } from "lucide-react";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { BrandMark } from "@/components/brand/BrandMark";

function formatRegisterError(err: any) {
  const detail = err?.response?.data?.detail ?? err?.response?.data?.message;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg ?? item?.message ?? JSON.stringify(item))
      .join(" ");
  }

  if (detail && typeof detail === "object") {
    return detail.message ?? JSON.stringify(detail);
  }

  return detail || "Registration failed";
}

export default function RegisterPage() {
  const router = useRouter();
  const { setTokens, setUser } = useAuthStore();
  const [form, setForm] = useState({ name: "", email: "", password: "", org_name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.register(form);
      setTokens(res.data.access_token, res.data.refresh_token);
      const me = await authApi.me();
      setUser(me.data.user, me.data.org_id, me.data.org_name, me.data.role);
      router.push("/plans");
    } catch (err: any) {
      setError(formatRegisterError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell flex items-center justify-center">
      <div className="app-frame min-h-[820px] max-w-5xl">
        <section className="hidden w-[42%] flex-col justify-between bg-[var(--sidebar)] p-7 text-white md:flex">
          <div>
            <div className="mb-12 flex items-center gap-3">
              <BrandMark tone="light" />
              <span className="brand-word text-2xl">trackboard</span>
            </div>
            <p className="section-label text-white/40">New workspace</p>
            <h1 className="mt-4 max-w-xs text-5xl font-semibold leading-[1.05] tracking-[-0.045em]">
              Ship tracking plans with{" "}
              <span className="serif-italic">branch, diff, publish.</span>
            </h1>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.08] p-5">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-[var(--sidebar)]">
              <GitBranch size={22} />
            </div>
            <p className="text-sm font-semibold leading-6 text-white/70">
              Start with a main workspace, publish v1, then let teams review changes like code.
            </p>
          </div>
        </section>

        <section className="flex flex-1 items-center justify-center bg-[var(--surface-2)] p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <p className="section-label">Create account</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                Get started
              </h2>
              <p className="mt-2 text-sm font-medium text-[var(--text-secondary)]">
                Create an organization and open the dashboard.
              </p>
            </div>

            <form method="post" onSubmit={handleSubmit} className="card space-y-4">
              {error && (
                <div className="rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                  {error}
                </div>
              )}

              {[
                { name: "name", label: "Your name", placeholder: "Alice", type: "text" },
                { name: "email", label: "Work email", placeholder: "alice@company.com", type: "email" },
                { name: "org_name", label: "Organization name", placeholder: "Acme Corp", type: "text" },
                { name: "password", label: "Password", placeholder: "Min 8 characters", type: "password" },
              ].map((f) => (
                <div key={f.name} className="space-y-2">
                  <label htmlFor={f.name} className="section-label">
                    {f.label}
                  </label>
                  <input
                    id={f.name}
                    name={f.name}
                    type={f.type}
                    className="input"
                    placeholder={f.placeholder}
                    value={form[f.name as keyof typeof form]}
                    onChange={handleChange}
                    disabled={!isMounted || loading}
                    required
                    minLength={f.name === "password" ? 8 : 1}
                  />
                </div>
              ))}

              <button type="submit" className="btn-primary flex w-full items-center justify-center gap-2" disabled={!isMounted || loading}>
                {loading ? "Creating account..." : "Get started"}
                <ArrowRight size={17} />
              </button>

              <p className="text-center text-xs font-semibold text-[var(--text-muted)]">
                Already have an account?{" "}
                <Link href="/login" className="text-[var(--text-primary)] underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
