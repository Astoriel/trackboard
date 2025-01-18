"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand/BrandMark";

const nav = [
  { href: "/plans", label: "Tracking Plans", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const { user, orgName, logout } = useAuthStore();
  const activePath = pendingHref ?? pathname;

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return (
    <aside className="relative hidden w-[285px] flex-shrink-0 flex-col overflow-hidden bg-[var(--sidebar)] p-4 text-white md:flex">
      <div className="pointer-events-none absolute inset-y-8 left-8 w-48 rounded-full bg-white/10 blur-3xl" />

      {/* Logo */}
      <div className="relative flex items-center justify-between px-3 py-4">
        <div className="flex items-center gap-3">
          <BrandMark tone="light" />
          <span className="brand-word text-2xl text-white">trackboard</span>
        </div>
      </div>

      {/* Org badge */}
      {orgName && (
        <div className="relative mx-1 mb-5 mt-2 rounded-[2rem] border border-white/10 bg-white/[0.06] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/40">
            Organization
          </p>
          <p className="mt-1 truncate text-sm font-medium text-white">
            {orgName}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="relative flex-1 space-y-2 rounded-[2.25rem] bg-gradient-to-b from-white/[0.10] to-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setPendingHref(href)}
            className={cn(
              "sidebar-item",
              activePath.startsWith(href) && "active"
            )}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-white">
              <Icon size={17} strokeWidth={1.55} />
            </span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      {/* User + logout */}
      <div className="relative mt-4 rounded-[2rem] bg-white/[0.07] p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 text-sm font-medium text-white">
            {user?.name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium text-white">
              {user?.name}
            </p>
            <p className="truncate text-xs text-white/50">
              {user?.email}
            </p>
          </div>
          <button onClick={logout} className="rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white" aria-label="Sign out">
            <LogOut size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </aside>
  );
}
