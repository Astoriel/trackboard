"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

const SEGMENT_LABELS: Record<string, string> = {
  plans: "Tracking Plans",
  dictionary: "Dictionary",
  versions: "Versions",
  generate: "Code Generation",
  playground: "Validate",
  live: "Live",
  settings: "Settings",
  observability: "DLQ",
  "merge-requests": "Review",
};

export function BreadcrumbNav() {
  const pathname = usePathname();

  // Remove leading slash and split
  const segments = pathname.replace(/^\//, "").split("/").filter(Boolean);

  // Build cumulative hrefs
  const crumbs = segments.map((seg, i) => ({
    label: SEGMENT_LABELS[seg] ?? (seg.length === 36 ? "..." : seg),
    href: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));

  if (crumbs.length === 0) return null;

  return (
    <nav className="flex min-w-0 items-center gap-1 text-sm" aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {i > 0 && (
            <ChevronRight size={13} className="text-[var(--text-muted)]" strokeWidth={1.6} />
          )}
          {crumb.isLast ? (
            <span className="truncate rounded-full border bg-[var(--surface)] px-4 py-2 font-medium text-[var(--text-primary)] shadow-sm">
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="rounded-full px-2 py-1 font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
