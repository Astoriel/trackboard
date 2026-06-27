import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdownSummary } from "../src/actionSummary.js";
import type { ContractDiff } from "../src/diff.js";

test("renderMarkdownSummary includes required GitHub Action sections", () => {
  const diff: ContractDiff = {
    breaking: true,
    summary: {
      breaking_count: 1,
      safe_count: 1,
      informational_count: 1,
    },
    changes: [
      {
        severity: "breaking",
        code: "property_type_changed",
        event: "signup_completed",
        property: "signup_method",
        message: "signup_completed.signup_method changed type",
      },
    ],
  };

  const output = renderMarkdownSummary(diff);

  assert.match(output, /Trackboard Contract Check/);
  assert.match(output, /Breaking changes: 1/);
  assert.match(output, /Safe changes: 1/);
  assert.match(output, /Informational changes: 1/);
  assert.match(output, /property_type_changed/);
});
