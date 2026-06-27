import type { ContractProperty, TrackboardContract } from "./contract.js";
import { normalizeContract, propertyMap } from "./contract.js";

export interface ContractChange {
  severity: "breaking" | "safe" | "informational";
  code: string;
  event: string;
  property?: string;
  message: string;
}

export interface ContractDiff {
  breaking: boolean;
  summary: {
    breaking_count: number;
    safe_count: number;
    informational_count: number;
  };
  changes: ContractChange[];
}

export function diffContracts(beforeInput: TrackboardContract, afterInput: TrackboardContract): ContractDiff {
  const before = normalizeContract(beforeInput);
  const after = normalizeContract(afterInput);
  const changes: ContractChange[] = [];
  const beforeEvents = new Map(before.events.map((event) => [event.event_name, event]));
  const afterEvents = new Map(after.events.map((event) => [event.event_name, event]));

  for (const event of beforeEvents.keys()) {
    if (!afterEvents.has(event)) {
      changes.push(change("breaking", "event_removed", event, `Event ${event} was removed`));
    }
  }
  for (const event of afterEvents.keys()) {
    if (!beforeEvents.has(event)) {
      changes.push(change("safe", "event_added", event, `Event ${event} was added`));
    }
  }
  for (const [eventName, beforeEvent] of beforeEvents) {
    const afterEvent = afterEvents.get(eventName);
    if (!afterEvent) continue;
    const beforeProps = propertyMap(before, beforeEvent);
    const afterProps = propertyMap(after, afterEvent);
    for (const prop of beforeProps.keys()) {
      if (!afterProps.has(prop)) {
        changes.push(change("breaking", "property_removed", eventName, `${eventName}.${prop} was removed`, prop));
      }
    }
    for (const [prop, schema] of afterProps) {
      if (!beforeProps.has(prop)) {
        changes.push(
          change(
            schema.required ? "breaking" : "safe",
            schema.required ? "required_property_added" : "optional_property_added",
            eventName,
            `${eventName}.${prop} was added`,
            prop,
          ),
        );
      }
    }
    for (const [prop, beforeSchema] of beforeProps) {
      const afterSchema = afterProps.get(prop);
      if (afterSchema) changes.push(...diffProperty(eventName, prop, beforeSchema, afterSchema));
    }
  }

  const summary = {
    breaking_count: changes.filter((item) => item.severity === "breaking").length,
    safe_count: changes.filter((item) => item.severity === "safe").length,
    informational_count: changes.filter((item) => item.severity === "informational").length,
  };
  return { breaking: summary.breaking_count > 0, summary, changes };
}

function diffProperty(
  event: string,
  property: string,
  before: ContractProperty,
  after: ContractProperty,
): ContractChange[] {
  const changes: ContractChange[] = [];
  if (before.type !== after.type) {
    changes.push(change("breaking", "property_type_changed", event, `${event}.${property} changed type`, property));
  }
  if (!before.required && after.required) {
    changes.push(change("breaking", "property_became_required", event, `${event}.${property} became required`, property));
  }
  const removedEnums = enumValues(before).filter((value) => !enumValues(after).includes(value));
  if (removedEnums.length > 0) {
    changes.push(change("breaking", "enum_value_removed", event, `${event}.${property} removed enum values`, property));
  }
  const addedEnums = enumValues(after).filter((value) => !enumValues(before).includes(value));
  if (addedEnums.length > 0) {
    changes.push(change("safe", "enum_value_added", event, `${event}.${property} added enum values`, property));
  }
  if (before.description !== after.description) {
    changes.push(change("informational", "property_description_changed", event, `${event}.${property} changed docs`, property));
  }
  return changes;
}

function enumValues(prop: ContractProperty): unknown[] {
  const values = prop.constraints?.enum_values;
  return Array.isArray(values) ? values : [];
}

function change(
  severity: ContractChange["severity"],
  code: string,
  event: string,
  message: string,
  property?: string,
): ContractChange {
  return { severity, code, event, property, message };
}
