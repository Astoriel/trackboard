#!/usr/bin/env node

import { readFile, appendFile, writeFile } from "node:fs/promises";
import { renderMarkdownSummary } from "./actionSummary.js";
import type { ContractDiff } from "./diff.js";

const [diffPath] = process.argv.slice(2);
if (!diffPath) {
  console.error("Usage: node dist/src/action.js <diff-json>");
  process.exit(64);
}

const diff = JSON.parse(await readFile(diffPath, "utf8")) as ContractDiff;
const summary = renderMarkdownSummary(diff);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
} else {
  console.log(summary);
}

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `breaking=${diff.breaking}`,
      `breaking-count=${diff.summary.breaking_count}`,
      `summary-json=${diffPath}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

if (process.env.TRACKBOARD_SUMMARY_OUT) {
  await writeFile(process.env.TRACKBOARD_SUMMARY_OUT, summary, "utf8");
}
