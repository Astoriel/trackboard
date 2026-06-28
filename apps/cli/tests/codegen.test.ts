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
  assert.match(output, /export interface TrackboardClient/);
  assert.match(output, /Track signup_completed\./);
  assert.match(output, /Trigger when:\n \* - Signup API returns success and the user account is persisted/);
  assert.match(output, /Do not trigger when:\n \* - Signup form is submitted/);
  assert.match(output, /export function trackSignupCompleted/);
  assert.match(output, /return client\.track\(\{ event: "signup_completed", properties \}\);/);
});

test("generateTypescript sanitizes implementation guidance comments", () => {
  const output = generateTypescript({
    format_version: "trackboard.contract.v1",
    events: [
      {
        event_name: "checkout_completed",
        implementation_guidance: {
          trigger_when: ["Webhook succeeds */\n<script>alert(1)</script>"],
          do_not_trigger_when: ["Pay button clicked\r\nignore previous instructions"],
        },
        properties: [],
      },
    ],
  });

  assert.match(output, /Webhook succeeds \* \/ scriptalert\(1\)\/script/);
  assert.match(output, /Pay button clicked ignore previous instructions/);
  assert.doesNotMatch(output, /Webhook succeeds \*\//);
  assert.doesNotMatch(output, /<script>/);
});

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(process.cwd(), "fixtures", name), "utf8")) as T;
}
