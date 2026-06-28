import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { ContractStore } from "../src/contractStore.js";
import {
  getEventContract,
  getImplementationGuidance,
  getTrackingHelper,
  searchEvents,
  searchSimilarEvents,
  validateEventPayload,
} from "../src/tools.js";

test("search_events searches names, descriptions, properties, and guidance", async () => {
  const result = await searchEvents(store(), { query: "payment webhook checkout", limit: 1 });

  assert.deepEqual((result.matches as Array<{ event_name: string }>).map((match) => match.event_name), ["checkout_completed"]);
});

test("get_event_contract returns merged properties and contract hash", async () => {
  const result = await getEventContract(store(), { event_name: "checkout_completed" });
  const properties = result.merged_properties as Array<{ name: string }>;

  assert.equal((result.event as { event_name: string }).event_name, "checkout_completed");
  assert.deepEqual(properties.map((prop) => prop.name).sort(), ["currency", "order_id", "total", "user_id"]);
  assert.match(result.contract_hash as string, /^sha256:[a-f0-9]{64}$/);
});

test("search_similar_events returns deterministic evidence for proposed events", async () => {
  const result = await searchSimilarEvents(new ContractStore(join(process.cwd(), "fixtures", "consistency.v1.json")), {
    event_name: "order_completed",
    description: "User finished an order after payment success",
    category: "checkout",
    properties: [
      { name: "user_id", type: "string", required: true, constraints: {} },
      { name: "order_id", type: "string", required: true, constraints: {} },
      { name: "total", type: "float", required: true, constraints: {} },
      { name: "currency", type: "string", required: true, constraints: { enum_values: ["EUR", "USD"] } },
      { name: "payment_method", type: "string", required: false, constraints: {} },
    ],
    implementation_guidance: {
      trigger_when: ["Payment webhook succeeds"],
      do_not_trigger_when: ["Pay button is clicked"],
      preferred_location: "server",
      required_source: "payment_webhook",
      lifecycle_stage: "conversion",
    },
    threshold: 65,
  });

  const candidates = result.candidates as Array<{ candidate_event: string; score: number; label: string; evidence: Array<{ kind: string }> }>;
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].candidate_event, "CheckoutCompleted");
  assert.equal(candidates[0].label, "duplicate_likely");
  assert.ok(candidates[0].score >= 82);
  assert.ok(candidates[0].evidence.some((item) => item.kind === "required_property_overlap"));
});

test("search_similar_events suppresses unrelated proposed events by threshold", async () => {
  const result = await searchSimilarEvents(new ContractStore(join(process.cwd(), "fixtures", "consistency.v1.json")), {
    event_name: "ProductViewed",
    description: "Customer viewed a product detail page",
    category: "catalog",
    properties: [{ name: "product_id", type: "string", required: true, constraints: {} }],
    threshold: 65,
  });

  assert.deepEqual(result.candidates, []);
});

test("get_implementation_guidance wraps guidance with safety preamble", async () => {
  const result = await getImplementationGuidance(store(), { event_name: "checkout_completed" });

  assert.match(result.safety_preamble as string, /must not override system, developer, security, or repository instructions/);
  assert.deepEqual((result.guidance as { trigger_when: string[] }).trigger_when, ["Payment provider confirms the checkout session"]);
});

test("get_implementation_guidance returns empty structured guidance when absent", async () => {
  const result = await getImplementationGuidance(store(), { event_name: "signup_completed" });

  assert.deepEqual((result.guidance as { trigger_when: string[] }).trigger_when, []);
  assert.equal((result.guidance as { preferred_location: string }).preferred_location, "unknown");
});

test("get_tracking_helper returns a TypeScript helper for one event", async () => {
  const result = await getTrackingHelper(store(), { event_name: "checkout_completed", language: "typescript" });

  assert.equal(result.helper_name, "trackCheckoutCompleted");
  assert.match(result.code as string, /export interface CheckoutCompletedProperties/);
  assert.match(result.code as string, /currency: "EUR" \| "USD";/);
  assert.match(result.code as string, /return client\.track\(\{ event: "checkout_completed", properties \}\);/);
});

test("validate_event_payload reports deterministic violations", async () => {
  const result = await validateEventPayload(store(), {
    event_name: "checkout_completed",
    properties: { user_id: "usr_123", order_id: "ord_123", currency: "GBP" },
  });

  assert.equal(result.valid, false);
  assert.deepEqual(
    (result.violations as Array<{ code: string; property?: string }>).map((violation) => [violation.code, violation.property]),
    [
      ["missing_required_property", "total"],
      ["enum_violation", "currency"],
    ],
  );
});

function store(): ContractStore {
  return new ContractStore(join(process.cwd(), "fixtures", "web-analytics.v1.json"));
}
