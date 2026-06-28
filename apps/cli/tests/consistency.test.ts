import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

test("lint-consistency emits stable JSON candidates", async () => {
  const result = await runCli(["lint-consistency", "--contract", fixture("contract.consistency.json"), "--threshold", "65", "--json"]);

  assert.equal(result.code, 0);
  const body = JSON.parse(result.stdout) as {
    candidate_count: number;
    candidates: Array<{ event_a: string; event_b: string; score: number; label: string; evidence: Array<{ kind: string }> }>;
  };

  assert.equal(body.candidate_count, 1);
  assert.equal(body.candidates[0].event_a, "CheckoutCompleted");
  assert.equal(body.candidates[0].event_b, "order_completed");
  assert.equal(body.candidates[0].label, "duplicate_likely");
  assert.ok(body.candidates[0].score >= 82);
  assert.ok(body.candidates[0].evidence.some((item) => item.kind === "property_overlap"));
});

test("lint-consistency human output includes pairs, labels, scores, and evidence", async () => {
  const result = await runCli(["lint-consistency", "--contract", fixture("contract.consistency.json"), "--threshold", "65"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /CheckoutCompleted <-> order_completed/);
  assert.match(result.stdout, /label: duplicate_likely/);
  assert.match(result.stdout, /score: /);
  assert.match(result.stdout, /evidence: \[name_similarity\]/);
});

test("lint-consistency strict exits 2 only for likely duplicates", async () => {
  const strictDuplicate = await runCli(["lint-consistency", "--contract", fixture("contract.consistency.json"), "--threshold", "65", "--strict"]);
  const strictClean = await runCli(["lint-consistency", "--contract", fixture("contract.v1.json"), "--threshold", "65", "--strict"]);

  assert.equal(strictDuplicate.code, 2);
  assert.equal(strictClean.code, 0);
});

function fixture(name: string): string {
  return join(process.cwd(), "fixtures", name);
}

function runCli(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(process.cwd(), "dist", "src", "index.js"), ...args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
