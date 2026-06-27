import { join } from "node:path";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { validateEvent } from "../src/validate.js";
import type { TrackboardContract, TrackingEventPayload } from "../src/contract.js";

test("validateEvent accepts a valid fixture event", async () => {
  const contract = await fixture<TrackboardContract>("contract.v1.json");
  const event = await fixture<TrackingEventPayload>("event.valid.json");

  assert.deepEqual(validateEvent(contract, event), []);
});

test("validateEvent reports enum and unknown property violations", async () => {
  const contract = await fixture<TrackboardContract>("contract.v1.json");
  const event = await fixture<TrackingEventPayload>("event.invalid.json");

  const codes = validateEvent(contract, event).map((violation) => violation.code);

  assert.deepEqual(codes.sort(), ["enum_violation", "unknown_property"]);
});

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(process.cwd(), "fixtures", name), "utf8")) as T;
}
