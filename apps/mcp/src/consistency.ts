import type { ContractEvent, ContractProperty, ImplementationGuidance, TrackboardContract } from "./contract.js";
import { normalizeContract, propertyMap } from "./contract.js";

export type ConsistencyLabel = "duplicate_likely" | "possibly_related" | "weak_signal";

export interface ProposedEvent {
  event_name: string;
  description?: string | null;
  category?: string | null;
  status?: string;
  properties?: ContractProperty[];
  implementation_guidance?: Partial<ImplementationGuidance> | null;
}

export interface SimilarEventCandidate {
  candidate_event: string;
  score: number;
  label: ConsistencyLabel;
  recommendation: "reuse_existing_event" | "review_taxonomy" | "monitor_only";
  score_breakdown: Record<string, number>;
  evidence: Array<{ kind: string; detail: string; weight: number }>;
}

interface EventProfile {
  event_name: string;
  status: string;
  category: string | null;
  name_tokens: string[];
  text_tokens: string[];
  properties: PropertyProfile[];
  guidance: Partial<ImplementationGuidance> | null | undefined;
}

interface PropertyProfile {
  name: string;
  type: string;
  required: boolean;
  constraints: Record<string, unknown>;
  tokens: string[];
}

const SIGNAL_WEIGHTS = {
  name_similarity: 25,
  description_guidance_similarity: 15,
  property_overlap: 20,
  required_property_overlap: 10,
  type_compatibility: 10,
  constraint_overlap: 5,
  category_status_match: 5,
  lifecycle_source_match: 10,
} as const;

const SYNONYMS: Record<string, string> = {
  account: "signup",
  accountcreated: "signup",
  basket: "cart",
  checkout: "order",
  complete: "completed",
  completed: "completed",
  completion: "completed",
  finish: "completed",
  finished: "completed",
  purchase: "order",
  purchased: "order",
  registration: "signup",
  registered: "signup",
  revenue: "total",
  success: "completed",
  successful: "completed",
};

const LOW_SIGNAL = new Set(["a", "an", "and", "event", "the", "user", "users", "is", "when"]);

export function searchSimilarEvents(
  contractInput: TrackboardContract,
  proposed: ProposedEvent,
  options: { threshold?: number; limit?: number } = {},
): { proposed_event: string; threshold: number; candidate_count: number; candidates: SimilarEventCandidate[] } {
  const threshold = options.threshold ?? 65;
  const limit = Math.max(1, Math.min(options.limit ?? 5, 25));
  const contract = normalizeContract(contractInput);
  const proposedProfile = buildProposedProfile(proposed);
  const candidates = contract.events
    .map((event) => scoreProfiles(proposedProfile, buildContractProfile(contract, event)))
    .filter((candidate) => candidate.score >= threshold)
    .sort((a, b) => b.score - a.score || a.candidate_event.localeCompare(b.candidate_event))
    .slice(0, limit);

  return {
    proposed_event: proposed.event_name,
    threshold,
    candidate_count: candidates.length,
    candidates,
  };
}

function buildContractProfile(contract: TrackboardContract, event: ContractEvent): EventProfile {
  return buildProfile({
    ...event,
    properties: [...propertyMap(contract, event).values()],
  });
}

function buildProposedProfile(event: ProposedEvent): EventProfile {
  return buildProfile(event);
}

function buildProfile(event: ProposedEvent): EventProfile {
  const properties = (event.properties ?? []).map((prop) => ({
    name: prop.name,
    type: prop.type,
    required: prop.required ?? false,
    constraints: prop.constraints ?? {},
    tokens: tokenize(prop.name),
  }));
  const guidance = event.implementation_guidance;
  return {
    event_name: event.event_name,
    status: event.status ?? "active",
    category: event.category ?? null,
    name_tokens: tokenize(event.event_name),
    text_tokens: tokenize(
      [
        event.description ?? "",
        event.category ?? "",
        ...(guidance?.trigger_when ?? []),
        ...(guidance?.do_not_trigger_when ?? []),
        guidance?.preferred_location ?? "",
        guidance?.required_source ?? "",
        guidance?.lifecycle_stage ?? "",
      ].join(" "),
    ),
    properties,
    guidance,
  };
}

function scoreProfiles(proposed: EventProfile, existing: EventProfile): SimilarEventCandidate {
  const evidence: SimilarEventCandidate["evidence"] = [];
  const score_breakdown: Record<string, number> = {};

  score_breakdown.name_similarity = weighted(jaccard(proposed.name_tokens, existing.name_tokens), SIGNAL_WEIGHTS.name_similarity);
  addEvidence(evidence, "name_similarity", `${proposed.event_name} and ${existing.event_name} share normalized name tokens: ${shared(proposed.name_tokens, existing.name_tokens).join(", ")}`, score_breakdown.name_similarity);

  score_breakdown.description_guidance_similarity = weighted(jaccard(proposed.text_tokens, existing.text_tokens), SIGNAL_WEIGHTS.description_guidance_similarity);
  addEvidence(evidence, "description_guidance_similarity", `Descriptions or guidance share tokens: ${shared(proposed.text_tokens, existing.text_tokens).slice(0, 8).join(", ")}`, score_breakdown.description_guidance_similarity);

  score_breakdown.property_overlap = weighted(jaccard(proposed.properties.flatMap((prop) => prop.tokens), existing.properties.flatMap((prop) => prop.tokens)), SIGNAL_WEIGHTS.property_overlap);
  addEvidence(evidence, "property_overlap", propertyOverlapDetail(proposed.properties, existing.properties, false), score_breakdown.property_overlap);

  const proposedRequired = proposed.properties.filter((prop) => prop.required);
  const existingRequired = existing.properties.filter((prop) => prop.required);
  score_breakdown.required_property_overlap = weighted(jaccard(proposedRequired.map((prop) => prop.name), existingRequired.map((prop) => prop.name)), SIGNAL_WEIGHTS.required_property_overlap);
  addEvidence(evidence, "required_property_overlap", propertyOverlapDetail(proposedRequired, existingRequired, true), score_breakdown.required_property_overlap);

  const sharedProperties = matchingProperties(proposed.properties, existing.properties);
  const compatibleTypes = sharedProperties.filter(([left, right]) => left.type === right.type);
  score_breakdown.type_compatibility = sharedProperties.length === 0 ? 0 : weighted(compatibleTypes.length / sharedProperties.length, SIGNAL_WEIGHTS.type_compatibility);
  addEvidence(evidence, "type_compatibility", `${compatibleTypes.length} of ${sharedProperties.length} shared properties have compatible types`, score_breakdown.type_compatibility);

  const matchingConstraints = sharedProperties.filter(([left, right]) => stableStringify(left.constraints) === stableStringify(right.constraints));
  score_breakdown.constraint_overlap = sharedProperties.length === 0 ? 0 : weighted(matchingConstraints.length / sharedProperties.length, SIGNAL_WEIGHTS.constraint_overlap);
  addEvidence(evidence, "constraint_overlap", `${matchingConstraints.length} of ${sharedProperties.length} shared properties have matching constraints`, score_breakdown.constraint_overlap);

  const categoryStatus = (proposed.category && existing.category && proposed.category === existing.category ? 3 : 0) + (proposed.status === existing.status ? 2 : 0);
  score_breakdown.category_status_match = categoryStatus;
  addEvidence(evidence, "category_status_match", `Category/status match weight: ${categoryStatus}`, categoryStatus);

  score_breakdown.lifecycle_source_match = lifecycleSourceScore(proposed, existing);
  addEvidence(evidence, "lifecycle_source_match", "Implementation guidance lifecycle, location, or source overlaps", score_breakdown.lifecycle_source_match);

  const score = Math.min(100, Object.values(score_breakdown).reduce((sum, value) => sum + value, 0));
  return {
    candidate_event: existing.event_name,
    score,
    label: labelFor(score),
    recommendation: recommendationFor(score),
    score_breakdown,
    evidence,
  };
}

function lifecycleSourceScore(a: EventProfile, b: EventProfile): number {
  if (!a.guidance || !b.guidance) return 0;
  let score = 0;
  if (a.guidance.lifecycle_stage && a.guidance.lifecycle_stage === b.guidance.lifecycle_stage) score += 4;
  if (a.guidance.required_source && a.guidance.required_source === b.guidance.required_source) score += 4;
  if (a.guidance.preferred_location && a.guidance.preferred_location === b.guidance.preferred_location) score += 2;
  return score;
}

function tokenize(value: string): string[] {
  return unique(
    value
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => SYNONYMS[token] ?? token)
      .filter((token) => token.length > 1 && !LOW_SIGNAL.has(token)),
  );
}

function matchingProperties(a: PropertyProfile[], b: PropertyProfile[]): Array<[PropertyProfile, PropertyProfile]> {
  const byName = new Map(b.map((prop) => [prop.name, prop]));
  return a.flatMap((prop) => {
    const match = byName.get(prop.name);
    return match ? [[prop, match] as [PropertyProfile, PropertyProfile]] : [];
  });
}

function propertyOverlapDetail(a: PropertyProfile[], b: PropertyProfile[], requiredOnly: boolean): string {
  const names = shared(a.map((prop) => prop.name), b.map((prop) => prop.name));
  const prefix = requiredOnly ? "required properties" : "properties";
  return `${names.length} shared ${prefix}: ${names.join(", ")}`;
}

function addEvidence(evidence: SimilarEventCandidate["evidence"], kind: string, detail: string, weight: number): void {
  if (weight > 0) evidence.push({ kind, detail, weight });
}

function jaccard(a: string[], b: string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 && right.size === 0) return 0;
  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function shared(a: string[], b: string[]): string[] {
  const right = new Set(b);
  return unique(a.filter((item) => right.has(item))).sort((left, rightItem) => left.localeCompare(rightItem));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function weighted(value: number, weight: number): number {
  return Number((value * weight).toFixed(2));
}

function labelFor(score: number): ConsistencyLabel {
  if (score >= 82) return "duplicate_likely";
  if (score >= 65) return "possibly_related";
  return "weak_signal";
}

function recommendationFor(score: number): SimilarEventCandidate["recommendation"] {
  if (score >= 82) return "reuse_existing_event";
  if (score >= 65) return "review_taxonomy";
  return "monitor_only";
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
