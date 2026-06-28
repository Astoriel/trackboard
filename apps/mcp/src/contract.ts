export type PropertyType = "string" | "integer" | "float" | "boolean" | "array" | "object";

export interface ContractProperty {
  name: string;
  type: PropertyType;
  required?: boolean;
  constraints?: Record<string, unknown>;
  description?: string | null;
  examples?: unknown[];
}

export interface CodeExample {
  language: string;
  framework?: string | null;
  snippet: string;
}

export interface ImplementationGuidance {
  trigger_when: string[];
  do_not_trigger_when: string[];
  preferred_location: "client" | "server" | "edge" | "mobile" | "backend_job" | "unknown";
  required_source: string | null;
  lifecycle_stage: string | null;
  idempotency_key: string | null;
  privacy_notes: string[];
  code_examples: CodeExample[];
}

export interface ContractEvent {
  event_name: string;
  status?: string;
  description?: string | null;
  category?: string | null;
  properties?: ContractProperty[];
  global_properties?: string[];
  implementation_guidance?: Partial<ImplementationGuidance> | null;
}

export interface TrackboardContract {
  format_version: "trackboard.contract.v1";
  plan_id?: string;
  version_id?: string;
  version_number?: number;
  name?: string;
  description?: string | null;
  published_at?: string | null;
  hash?: string;
  contract_hash?: string;
  global_properties?: ContractProperty[];
  events: ContractEvent[];
}

export interface TrackingEventPayload {
  event: string;
  properties?: Record<string, unknown>;
}

export function normalizeContract(contract: TrackboardContract): TrackboardContract {
  if (contract.format_version !== "trackboard.contract.v1") {
    throw new Error("unsupported_format_version");
  }
  if (!Array.isArray(contract.events)) {
    throw new Error("invalid_contract_events");
  }
  return {
    ...contract,
    global_properties: normalizeProperties(contract.global_properties ?? []),
    events: [...contract.events]
      .map((event, index) => ({
        ...event,
        status: event.status ?? "active",
        properties: normalizeProperties(event.properties ?? []),
        global_properties: [...(event.global_properties ?? [])].sort(),
        implementation_guidance: event.implementation_guidance
          ? normalizeGuidance(event.implementation_guidance)
          : undefined,
        sort_order: (event as ContractEvent & { sort_order?: number }).sort_order ?? index,
      }))
      .sort((a, b) => a.event_name.localeCompare(b.event_name)),
  } as TrackboardContract;
}

export function propertyMap(contract: TrackboardContract, event: ContractEvent): Map<string, ContractProperty> {
  const properties = new Map<string, ContractProperty>();
  for (const prop of event.properties ?? []) {
    properties.set(prop.name, prop);
  }
  const globals = new Map((contract.global_properties ?? []).map((prop) => [prop.name, prop]));
  for (const name of event.global_properties ?? []) {
    const prop = globals.get(name);
    if (prop) properties.set(name, prop);
  }
  return properties;
}

export function emptyGuidance(): ImplementationGuidance {
  return {
    trigger_when: [],
    do_not_trigger_when: [],
    preferred_location: "unknown",
    required_source: null,
    lifecycle_stage: null,
    idempotency_key: null,
    privacy_notes: [],
    code_examples: [],
  };
}

export function normalizeGuidance(input: Partial<ImplementationGuidance>): ImplementationGuidance {
  return {
    ...emptyGuidance(),
    ...input,
    trigger_when: normalizeStringArray(input.trigger_when),
    do_not_trigger_when: normalizeStringArray(input.do_not_trigger_when),
    privacy_notes: normalizeStringArray(input.privacy_notes),
    code_examples: Array.isArray(input.code_examples)
      ? input.code_examples.map((example) => ({
          language: String(example.language ?? ""),
          framework: example.framework == null ? null : String(example.framework),
          snippet: String(example.snippet ?? ""),
        }))
      : [],
    preferred_location: input.preferred_location ?? "unknown",
    required_source: input.required_source ?? null,
    lifecycle_stage: input.lifecycle_stage ?? null,
    idempotency_key: input.idempotency_key ?? null,
  };
}

function normalizeProperties(properties: ContractProperty[]): ContractProperty[] {
  return [...properties]
    .map((prop) => ({
      ...prop,
      required: prop.required ?? false,
      constraints: normalizeConstraints(prop.constraints ?? {}),
      examples: prop.examples ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeConstraints(constraints: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...constraints };
  const enumValues = normalized.enum_values ?? normalized.enum;
  if (Array.isArray(enumValues)) {
    normalized.enum_values = [...enumValues].sort((a, b) => String(a).localeCompare(String(b)));
    delete normalized.enum;
  }
  return Object.fromEntries(Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b)));
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}
