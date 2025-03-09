"use client";

import { cn } from "@/lib/utils";

type Status =
  | "active"
  | "deprecated"
  | "planned"
  | "draft"
  | "archived"
  | "open"
  | "merged"
  | "closed"
  | string;

const STATUS_STYLES: Record<string, string> = {
  active: "badge-active",
  deprecated: "badge-deprecated",
  planned: "badge bg-blue-50 text-blue-700 border-blue-200",
  draft: "badge-draft",
  archived: "badge-archived",
  open: "badge bg-blue-50 text-blue-700 border-blue-200",
  merged: "badge-active",
  closed: "badge-archived",
};

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? "badge bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={cn(style, className)}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
