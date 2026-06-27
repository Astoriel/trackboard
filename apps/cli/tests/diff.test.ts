import { join } from "node:path";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { diffContracts } from "../src/diff.js";
import type { TrackboardContract } from "../src/contract.js";

test("diffContracts reports breaking schema changes", async () => {
  const before = await fixture<TrackboardContract>("contract.v1.json");
  const after = await fixture<TrackboardContract>("contract.v2.breaking.json");

  const diff = diffContracts(before, after);
  const codes = diff.changes.map((change) => change.code);

  assert.equal(diff.breaking, true);
  assert.equal(diff.summary.breaking_count, 2);
  assert.ok(codes.includes("property_type_changed"));
  assert.ok(codes.includes("enum_value_removed"));
});

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(process.cwd(), "fixtures", name), "utf8")) as T;
}
