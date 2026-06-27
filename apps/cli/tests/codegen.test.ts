import { join } from "node:path";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { generateTypescript } from "../src/codegen.js";
import type { TrackboardContract } from "../src/contract.js";

test("generateTypescript emits event union and property interface", async () => {
  const contract = await fixture<TrackboardContract>("contract.v1.json");

  const output = generateTypescript(contract);

  assert.match(output, /export interface SignupCompletedProperties/);
  assert.match(output, /user_id: string;/);
  assert.match(output, /signup_method: "email" \| "github" \| "google";/);
  assert.match(output, /event: "signup_completed"/);
});

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(process.cwd(), "fixtures", name), "utf8")) as T;
}
