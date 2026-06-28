#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ContractStore } from "./contractStore.js";
import {
  getEventContract,
  getImplementationGuidance,
  getTrackingHelper,
  searchEvents,
  validateEventPayload,
} from "./tools.js";
import { structuredError } from "./security.js";

const store = new ContractStore();
const server = new McpServer({
  name: "trackboard-local-contract",
  version: "0.1.0",
});

server.tool(
  "search_events",
  "Search read-only Trackboard event contracts from the configured local contract file.",
  {
    query: z.string(),
    limit: z.number().int().min(1).max(25).optional(),
  },
  async (input) => jsonResponse(await safeTool(() => searchEvents(store, input))),
);

server.tool(
  "get_event_contract",
  "Return one event contract, merged global properties, and contract hash.",
  {
    event_name: z.string().min(1),
  },
  async (input) => jsonResponse(await safeTool(() => getEventContract(store, input))),
);

server.tool(
  "get_implementation_guidance",
  "Return product-authored implementation guidance as data with a safety preamble.",
  {
    event_name: z.string().min(1),
  },
  async (input) => jsonResponse(await safeTool(() => getImplementationGuidance(store, input))),
);

server.tool(
  "get_tracking_helper",
  "Generate a read-only TypeScript tracking helper for one event.",
  {
    event_name: z.string().min(1),
    language: z.literal("typescript").optional(),
  },
  async (input) => jsonResponse(await safeTool(() => getTrackingHelper(store, input))),
);

server.tool(
  "validate_event_payload",
  "Validate a proposed event payload against the configured local contract.",
  {
    event_name: z.string().min(1),
    properties: z.record(z.unknown()).optional(),
  },
  async (input) => jsonResponse(await safeTool(() => validateEventPayload(store, input))),
);

await server.connect(new StdioServerTransport());

async function safeTool(fn: () => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> {
  try {
    return await fn();
  } catch (error) {
    return structuredError(error);
  }
}

function jsonResponse(payload: Record<string, unknown>) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}
