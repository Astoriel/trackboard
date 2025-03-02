"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Activity, AlertTriangle, BookOpen, Code2, Edit3, GitBranch, Key, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { planId } = useParams<{ planId: string }>() || { planId: "" };
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const activePath = pendingHref ?? pathname;

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const tabs = [
    { href: `/plans/${planId}`, label: "Editor", icon: Edit3, exact: true },
    { href: `/plans/${planId}/dictionary`, label: "Dictionary", icon: BookOpen },
    { href: `/plans/${planId}/merge-requests`, label: "Review", icon: GitBranch },
    { href: `/plans/${planId}/generate`, label: "Generate", icon: Code2 },
    { href: `/plans/${planId}/playground`, label: "Validate", icon: Play },
    { href: `/plans/${planId}/live`, label: "Live", icon: Activity },
    { href: `/plans/${planId}/versions`, label: "Versions", icon: GitBranch },
    { href: `/plans/${planId}/observability`, label: "DLQ", icon: AlertTriangle },
    { href: `/plans/${planId}/settings`, label: "Settings", icon: Key },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="tab-rail mx-5 mb-1 flex items-center gap-2 overflow-x-auto rounded-[1.75rem] border bg-[var(--surface)] p-2 pl-5 shadow-sm lg:mx-8">
        {tabs.map(({ href, label, icon: Icon, exact }) => {
          const active = exact
            ? activePath === href
            : activePath.startsWith(href) && activePath !== `/plans/${planId}`;

          return (
            <Link
              key={href}
              href={href}
              onClick={() => setPendingHref(href)}
              className={cn(
                "tab-pill flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-xs font-medium transition-all",
                active
                  ? "active bg-[var(--brand)] pr-6 text-white shadow-md"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]",
              )}
            >
              <Icon size={13} strokeWidth={1.55} />
              {label}
            </Link>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
