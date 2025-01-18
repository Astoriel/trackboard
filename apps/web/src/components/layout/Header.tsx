"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { BreadcrumbNav } from "./BreadcrumbNav";
import { GlobalSearch } from "../common/GlobalSearch";

export function Header() {
  return (
    <header className="flex items-center justify-between gap-4 bg-[var(--surface-2)] px-5 py-5 lg:px-8">
      <div className="flex min-w-0 items-center gap-4">
        <Link
          href="/plans"
          className="rounded-full bg-[var(--surface)] p-3 text-[var(--text-primary)] shadow-sm md:hidden"
          aria-label="Tracking plans"
        >
          <FileText size={18} strokeWidth={1.6} />
        </Link>
        <BreadcrumbNav />
      </div>

      <div className="flex items-center gap-3">
        <GlobalSearch />
      </div>
    </header>
  );
}
