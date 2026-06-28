import type { ContractEvent, ContractProperty, ImplementationGuidance } from "./contract.js";
import { emptyGuidance, normalizeGuidance } from "./contract.js";
import type { ContractStore } from "./contractStore.js";
import { assertSupportedLanguage, generateTypescriptHelper } from "./codegen.js";
import { GUIDANCE_SAFETY_PREAMBLE } from "./security.js";
import { validateEvent } from "./validate.js";

export interface SearchEventsInput {
  query: string;
  limit?: number;
}

export async function searchEvents(store: ContractStore, input: SearchEventsInput): Promise<Record<string, unknown>> {
  const { contract } = await store.load();
  const tokens = tokenize(input.query);
  const limit = Math.max(1, Math.min(input.limit ?? 10, 25));
  const matches = contract.events
    .map((event) => {
      const score = scoreEvent(event, store.mergedProperties(contract, event), tokens);
      return {
        event_name: event.event_name,
        score,
        description: event.description ?? null,
        category: event.category ?? null,
      };
    })
    .filter((match) => match.score > 0 || tokens.length === 0)
    .sort((a, b) => b.score - a.score || a.event_name.localeCompare(b.event_name))
    .slice(0, limit);
  return { matches };
}

export async function getEventContract(store: ContractStore, input: { event_name: string }): Promise<Record<string, unknown>> {
  const { contract, event, hash } = await store.event(input.event_name);
  return {
    event,
    merged_properties: store.mergedProperties(contract, event),
    contract_hash: hash,
  };
}

export async function getImplementationGuidance(store: ContractStore, input: { event_name: string }): Promise<Record<string, unknown>> {
  const { event } = await store.event(input.event_name);
  return {
    event_name: event.event_name,
    guidance: event.implementation_guidance ? normalizeGuidance(event.implementation_guidance) : emptyGuidance(),
    safety_preamble: GUIDANCE_SAFETY_PREAMBLE,
  };
}

export async function getTrackingHelper(
  store: ContractStore,
  input: { event_name: string; language?: string },
): Promise<Record<string, unknown>> {
  const language = input.language ?? "typescript";
  assertSupportedLanguage(language);
  const { contract, event } = await store.event(input.event_name);
  return {
    language: "typescript",
    ...generateTypescriptHelper(contract, event),
  };
}

export async function validateEventPayload(
  store: ContractStore,
  input: { event_name: string; properties?: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const { contract } = await store.event(input.event_name);
  const violations = validateEvent(contract, { event: input.event_name, properties: input.properties ?? {} });
  return {
    valid: violations.length === 0,
    violations,
  };
}

function scoreEvent(event: ContractEvent, properties: ContractProperty[], tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const haystack = [
    event.event_name,
    event.description ?? "",
    event.category ?? "",
    ...properties.flatMap((prop) => [prop.name, prop.description ?? ""]),
    ...guidanceText(event.implementation_guidance),
  ]
    .join(" ")
    .toLowerCase();
  const exactName = event.event_name.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (exactName.includes(token)) score += 3;
    if (haystack.includes(token)) score += 1;
  }
  return Number((score / Math.max(tokens.length * 4, 1)).toFixed(4));
}

function guidanceText(guidance: Partial<ImplementationGuidance> | null | undefined): string[] {
  if (!guidance) return [];
  return [
    ...(guidance.trigger_when ?? []),
    ...(guidance.do_not_trigger_when ?? []),
    guidance.preferred_location ?? "",
    guidance.required_source ?? "",
    guidance.lifecycle_stage ?? "",
    guidance.idempotency_key ?? "",
    ...(guidance.privacy_notes ?? []),
    ...(guidance.code_examples ?? []).flatMap((example) => [example.language, example.framework ?? "", example.snippet]),
  ];
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}
