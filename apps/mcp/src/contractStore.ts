import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ContractEvent, ContractProperty, TrackboardContract } from "./contract.js";
import { normalizeContract, propertyMap } from "./contract.js";
import { ToolError } from "./security.js";

export class ContractStore {
  private loaded?: { path: string; contract: TrackboardContract; hash: string };

  constructor(private readonly contractFile: string | undefined = process.env.TRACKBOARD_CONTRACT_FILE) {}

  async load(): Promise<{ contract: TrackboardContract; hash: string; path: string }> {
    if (!this.contractFile) {
      throw new ToolError("missing_contract_file", "TRACKBOARD_CONTRACT_FILE is required");
    }
    const path = resolve(this.contractFile);
    if (this.loaded?.path === path) return this.loaded;

    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      throw new ToolError("contract_file_unreadable", "Unable to read TRACKBOARD_CONTRACT_FILE", {
        path,
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const parsed = JSON.parse(raw) as TrackboardContract;
      const contract = normalizeContract(parsed);
      const hash = parsed.contract_hash ?? parsed.hash ?? `sha256:${sha256(stableStringify(withoutHash(contract)))}`;
      this.loaded = { path, contract, hash };
      return this.loaded;
    } catch (error) {
      throw new ToolError("contract_file_invalid", "TRACKBOARD_CONTRACT_FILE does not contain a valid Trackboard contract", {
        path,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async event(eventName: string): Promise<{ event: ContractEvent; contract: TrackboardContract; hash: string }> {
    const { contract, hash } = await this.load();
    const event = contract.events.find((candidate) => candidate.event_name === eventName);
    if (!event) {
      throw new ToolError("unknown_event", `Unknown event ${eventName}`, { event_name: eventName });
    }
    return { event, contract, hash };
  }

  mergedProperties(contract: TrackboardContract, event: ContractEvent): ContractProperty[] {
    return [...propertyMap(contract, event).values()];
  }
}

function withoutHash(contract: TrackboardContract): TrackboardContract {
  const copy = { ...contract };
  delete copy.hash;
  delete copy.contract_hash;
  return copy;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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
