"use client";

interface ComplianceGaugeProps {
  rate: number; // 0-100
  size?: number;
}

export function ComplianceGauge({ rate, size = 160 }: ComplianceGaugeProps) {
  const clamped = Math.max(0, Math.min(100, rate));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - clamped / 100);

  const color =
    clamped >= 90 ? "#10b981" : clamped >= 70 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        className="rotate-[-90deg]"
      >
        {/* Track */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth="10"
        />
        {/* Progress */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {/* Label in center */}
      <div
              className="metric-number text-2xl tabular-nums"
        style={{
          color,
          marginTop: -(size / 2 + 20),
          lineHeight: `${size}px`,
          position: "absolute",
        }}
      >
        {clamped.toFixed(1)}%
      </div>
      <p className="text-xs text-[var(--text-muted)] -mt-2">Compliance Rate</p>
    </div>
  );
}
