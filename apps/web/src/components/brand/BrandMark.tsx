import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  tone?: "dark" | "light";
  size?: "sm" | "md" | "lg";
};

const sizeClasses = {
  sm: "h-10 w-10",
  md: "h-12 w-12",
  lg: "h-14 w-14",
};

export function BrandMark({ className, tone = "dark", size = "md" }: BrandMarkProps) {
  return (
    <span
      className={cn(
        "brand-mark",
        tone === "light" ? "brand-mark-light" : "brand-mark-dark",
        sizeClasses[size],
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" className="brand-mark-star">
        <path d="M24 5.5C25.7 16.4 31.6 22.3 42.5 24C31.6 25.7 25.7 31.6 24 42.5C22.3 31.6 16.4 25.7 5.5 24C16.4 22.3 22.3 16.4 24 5.5Z" />
        <path d="M24 14.5C25 20.1 27.9 23 33.5 24C27.9 25 25 27.9 24 33.5C23 27.9 20.1 25 14.5 24C20.1 23 23 20.1 24 14.5Z" opacity="0.24" />
      </svg>
    </span>
  );
}
