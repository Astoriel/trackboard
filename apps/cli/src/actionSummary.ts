import type { ContractDiff } from "./diff.js";

export function renderMarkdownSummary(diff: ContractDiff): string {
  const lines = [
    "# Trackboard Contract Check",
    "",
    `Breaking changes: ${diff.summary.breaking_count}`,
    `Safe changes: ${diff.summary.safe_count}`,
    `Informational changes: ${diff.summary.informational_count}`,
    "",
  ];
  if (diff.changes.length === 0) {
    lines.push("No contract changes detected.", "");
    return lines.join("\n");
  }
  lines.push("| Severity | Code | Event | Property | Message |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const change of diff.changes) {
    lines.push(
      [
        change.severity,
        change.code,
        change.event,
        change.property ?? "",
        change.message.replaceAll("|", "\\|"),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    );
  }
  lines.push("");
  return lines.join("\n");
}
