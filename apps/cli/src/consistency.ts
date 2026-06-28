import type { ContractEvent, ContractProperty, ImplementationGuidance, TrackboardContract } from "./contract.js";
import { normalizeContract, propertyMap } from "./contract.js";

export type ConsistencyLabel = "duplicate_likely" | "possibly_related" | "weak_signal";

export interface ConsistencyEvidence {
  kind: string;
  detail: string;
  weight: number;
}

export interface ConsistencyCandidate {
  event_a: string;
  event_b: string;
  score: number;
  label: ConsistencyLabel;
  recommendation: "reuse_existing_event" | "review_taxonomy" | "monitor_only";
  score_breakdown: Record<string, number>;
  evidence: ConsistencyEvidence[];
}

export interface ConsistencyAudit {
  threshold: number;
  candidate_count: number;
  candidates: ConsistencyCandidate[];
}

interface EventProfile {
  event_name: string;
  status: string;
  category: string | null;
  name_tokens: string[];
  text_tokens: string[];
  properties: PropertyProfile[];
  guidance: ImplementationGuidance | null | undefined;
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

export function auditConsistency(contractInput: TrackboardContract, threshold = 65): ConsistencyAudit {
  const contract = normalizeContract(contractInput);
  const profiles = contract.events.map((event) => buildProfile(contract, event));
  const candidates: ConsistencyCandidate[] = [];

  for (let left = 0; left < profiles.length; left += 1) {
    for (let right = left + 1; right < profiles.length; right += 1) {
      const candidate = scoreProfiles(profiles[left], profiles[right]);
      if (candidate.score >= threshold) candidates.push(candidate);
    }
  }

  candidates.sort(compareCandidates);
  return { threshold, candidate_count: candidates.length, candidates };
}

function buildProfile(contract: TrackboardContract, event: ContractEvent): EventProfile {
  const properties = [...propertyMap(contract, event).values()].map((prop) => ({
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

function scoreProfiles(a: EventProfile, b: EventProfile): ConsistencyCandidate {
  const evidence: ConsistencyEvidence[] = [];
  const score_breakdown: Record<string, number> = {};

  const nameSimilarity = jaccard(a.name_tokens, b.name_tokens);
  score_breakdown.name_similarity = weighted(nameSimilarity, SIGNAL_WEIGHTS.name_similarity);
  addEvidence(evidence, "name_similarity", `${a.event_name} and ${b.event_name} share normalized name tokens: ${shared(a.name_tokens, b.name_tokens).join(", ")}`, score_breakdown.name_similarity);

  const textSimilarity = jaccard(a.text_tokens, b.text_tokens);
  score_breakdown.description_guidance_similarity = weighted(textSimilarity, SIGNAL_WEIGHTS.description_guidance_similarity);
  addEvidence(evidence, "description_guidance_similarity", `Descriptions or guidance share tokens: ${shared(a.text_tokens, b.text_tokens).slice(0, 8).join(", ")}`, score_breakdown.description_guidance_similarity);

  const propertyTokensA = a.properties.flatMap((prop) => prop.tokens);
  const propertyTokensB = b.properties.flatMap((prop) => prop.tokens);
  const propertySimilarity = jaccard(propertyTokensA, propertyTokensB);
  score_breakdown.property_overlap = weighted(propertySimilarity, SIGNAL_WEIGHTS.property_overlap);
  addEvidence(evidence, "property_overlap", propertyOverlapDetail(a.properties, b.properties, false), score_breakdown.property_overlap);

  const requiredA = a.properties.filter((prop) => prop.required);
  const requiredB = b.properties.filter((prop) => prop.required);
  const requiredSimilarity = jaccard(requiredA.map((prop) => prop.name), requiredB.map((prop) => prop.name));
  score_breakdown.required_property_overlap = weighted(requiredSimilarity, SIGNAL_WEIGHTS.required_property_overlap);
  addEvidence(evidence, "required_property_overlap", propertyOverlapDetail(requiredA, requiredB, true), score_breakdown.required_property_overlap);

  const sharedProperties = matchingProperties(a.properties, b.properties);
  const compatibleTypes = sharedProperties.filter(([left, right]) => left.type === right.type);
  score_breakdown.type_compatibility = sharedProperties.length === 0 ? 0 : weighted(compatibleTypes.length / sharedProperties.length, SIGNAL_WEIGHTS.type_compatibility);
  addEvidence(evidence, "type_compatibility", `${compatibleTypes.length} of ${sharedProperties.length} shared properties have compatible types`, score_breakdown.type_compatibility);

  const matchingConstraints = sharedProperties.filter(([left, right]) => stableStringify(left.constraints) === stableStringify(right.constraints));
  score_breakdown.constraint_overlap = sharedProperties.length === 0 ? 0 : weighted(matchingConstraints.length / sharedProperties.length, SIGNAL_WEIGHTS.constraint_overlap);
  addEvidence(evidence, "constraint_overlap", `${matchingConstraints.length} of ${sharedProperties.length} shared properties have matching constraints`, score_breakdown.constraint_overlap);

  const categoryStatus = (a.category && b.category && a.category === b.category ? 3 : 0) + (a.status === b.status ? 2 : 0);
  score_breakdown.category_status_match = categoryStatus;
  addEvidence(evidence, "category_status_match", `Category/status match weight: ${categoryStatus}`, categoryStatus);

  const lifecycleSource = lifecycleSourceScore(a, b);
  score_breakdown.lifecycle_source_match = lifecycleSource;
  addEvidence(evidence, "lifecycle_source_match", "Implementation guidance lifecycle, location, or source overlaps", lifecycleSource);

  const score = Math.min(100, Object.values(score_breakdown).reduce((sum, value) => sum + value, 0));
  return {
    event_a: a.event_name,
    event_b: b.event_name,
    score,
    label: labelFor(score),
    recommendation: recommendationFor(score),
    score_breakdown,
    evidence,
  };
}

function lifecycleSourceScore(a: EventProfile, b: EventProfile): number {
  const guidanceA = a.guidance;
  const guidanceB = b.guidance;
  if (!guidanceA || !guidanceB) return 0;
  let score = 0;
  if (guidanceA.lifecycle_stage && guidanceA.lifecycle_stage === guidanceB.lifecycle_stage) score += 4;
  if (guidanceA.required_source && guidanceA.required_source === guidanceB.required_source) score += 4;
  if (guidanceA.preferred_location && guidanceA.preferred_location === guidanceB.preferred_location) score += 2;
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

function addEvidence(evidence: ConsistencyEvidence[], kind: string, detail: string, weight: number): void {
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

function recommendationFor(score: number): ConsistencyCandidate["recommendation"] {
  if (score >= 82) return "reuse_existing_event";
  if (score >= 65) return "review_taxonomy";
  return "monitor_only";
}

function compareCandidates(a: ConsistencyCandidate, b: ConsistencyCandidate): number {
  return b.score - a.score || a.event_a.localeCompare(b.event_a) || a.event_b.localeCompare(b.event_b);
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
