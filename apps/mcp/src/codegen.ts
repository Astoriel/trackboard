import type { ContractEvent, ContractProperty, TrackboardContract } from "./contract.js";
import { propertyMap } from "./contract.js";
import { ToolError } from "./security.js";

export function generateTypescriptHelper(contract: TrackboardContract, event: ContractEvent): {
  helper_name: string;
  code: string;
  usage_notes: string[];
} {
  const name = toPascalCase(event.event_name);
  const interfaceName = `${name}Properties`;
  const helperName = `track${name}`;
  const chunks = [
    `export interface ${interfaceName} {`,
    ...[...propertyMap(contract, event).values()].map((prop) => `  ${propertyKey(prop.name)}${prop.required ? "" : "?"}: ${tsType(prop)};`),
    "}",
    "",
    "export interface TrackboardClient {",
    "  track(input: { event: string; properties: Record<string, unknown> }): Promise<void>;",
    "}",
    "",
    `export function ${helperName}(`,
    "  client: TrackboardClient,",
    `  properties: ${interfaceName},`,
    "): Promise<void> {",
    `  return client.track({ event: ${JSON.stringify(event.event_name)}, properties });`,
    "}",
  ];
  return {
    helper_name: helperName,
    code: `${chunks.join("\n")}\n`,
    usage_notes: ["TypeScript helper only in MCP V0.", "Validate payloads with validate_event_payload before relying on generated code."],
  };
}

export function assertSupportedLanguage(language: string): void {
  if (language.toLowerCase() !== "typescript") {
    throw new ToolError("unsupported_language", "Only TypeScript helpers are supported in MCP V0", { language });
  }
}

function tsType(prop: ContractProperty): string {
  const enumValues = prop.constraints?.enum_values;
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    return enumValues.map((value) => JSON.stringify(String(value))).join(" | ");
  }
  if (prop.type === "string") return "string";
  if (prop.type === "integer" || prop.type === "float") return "number";
  if (prop.type === "boolean") return "boolean";
  if (prop.type === "array") return "unknown[]";
  if (prop.type === "object") return "Record<string, unknown>";
  return "unknown";
}

function propertyKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function toPascalCase(value: string): string {
  const name = value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
  return /^[0-9]/.test(name) ? `Event${name}` : name || "EventSchema";
}
