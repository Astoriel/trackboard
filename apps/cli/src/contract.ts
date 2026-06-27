export type PropertyType = "string" | "integer" | "float" | "boolean" | "array" | "object";

export interface ContractProperty {
  name: string;
  type: PropertyType;
  required?: boolean;
  constraints?: Record<string, unknown>;
  description?: string | null;
  examples?: unknown[];
}

export interface ContractEvent {
  event_name: string;
  status?: string;
  description?: string | null;
  category?: string | null;
  properties?: ContractProperty[];
  global_properties?: string[];
}

export interface TrackboardContract {
  format_version: "trackboard.contract.v1";
  plan_id?: string;
  version_id?: string;
  version_number?: number;
  name?: string;
  description?: string | null;
  published_at?: string | null;
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
  return {
    ...contract,
    global_properties: normalizeProperties(contract.global_properties ?? []),
    events: [...contract.events]
      .map((event, index) => ({
        ...event,
        status: event.status ?? "active",
        properties: normalizeProperties(event.properties ?? []),
        global_properties: [...(event.global_properties ?? [])].sort(),
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
