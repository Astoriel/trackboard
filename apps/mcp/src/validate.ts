import type { TrackboardContract, TrackingEventPayload } from "./contract.js";
import { normalizeContract, propertyMap } from "./contract.js";

export interface Violation {
  code: string;
  event: string;
  property?: string;
  message: string;
}

export function validateEvent(contractInput: TrackboardContract, payload: TrackingEventPayload): Violation[] {
  const contract = normalizeContract(contractInput);
  const event = contract.events.find((candidate) => candidate.event_name === payload.event);
  if (!event) {
    return [{ code: "unknown_event", event: payload.event, message: `Unknown event ${payload.event}` }];
  }
  const properties = payload.properties ?? {};
  const expected = propertyMap(contract, event);
  const violations: Violation[] = [];

  for (const [name, prop] of expected) {
    if (prop.required && properties[name] == null) {
      violations.push({
        code: "missing_required_property",
        event: payload.event,
        property: name,
        message: `${payload.event}.${name} is required`,
      });
    }
  }

  for (const [name, value] of Object.entries(properties)) {
    const prop = expected.get(name);
    if (!prop) {
      violations.push({
        code: "unknown_property",
        event: payload.event,
        property: name,
        message: `${payload.event}.${name} is not defined`,
      });
      continue;
    }
    if (!matchesType(value, prop.type)) {
      violations.push({
        code: "type_mismatch",
        event: payload.event,
        property: name,
        message: `${payload.event}.${name} must be ${prop.type}`,
      });
      continue;
    }
    const enumValues = prop.constraints?.enum_values;
    if (Array.isArray(enumValues) && !enumValues.includes(value)) {
      violations.push({
        code: "enum_violation",
        event: payload.event,
        property: name,
        message: `${payload.event}.${name} must be one of ${enumValues.join(", ")}`,
      });
    }
  }
  return violations;
}

function matchesType(value: unknown, type: string): boolean {
  if (type === "string") return typeof value === "string";
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "float") return typeof value === "number";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "array") return Array.isArray(value);
  if (type === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
  return true;
}
