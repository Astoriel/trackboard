#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { diffContracts } from "./diff.js";
import { generateTypescript } from "./codegen.js";
import { validateEvent } from "./validate.js";
import type { TrackboardContract, TrackingEventPayload } from "./contract.js";

const EXIT_USAGE = 64;

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  try {
    if (command === "validate") return await validateCommand(args);
    if (command === "diff") return await diffCommand(args);
    if (command === "codegen") return await codegenCommand(args);
    usage();
    return EXIT_USAGE;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return EXIT_USAGE;
  }
}

async function validateCommand(args: string[]): Promise<number> {
  const contractPath = flag(args, "--contract");
  const eventPath = flag(args, "--event");
  if (!contractPath || !eventPath) throw new Error("validate requires --contract and --event");
  const contract = await readJson<TrackboardContract>(contractPath);
  const event = await readJson<TrackingEventPayload>(eventPath);
  const violations = validateEvent(contract, event);
  console.log(JSON.stringify({ valid: violations.length === 0, violations }, null, 2));
  return violations.length === 0 ? 0 : 1;
}

async function diffCommand(args: string[]): Promise<number> {
  const [beforePath, afterPath] = args;
  if (!beforePath || !afterPath) throw new Error("diff requires old-contract.json new-contract.json");
  const before = await readJson<TrackboardContract>(beforePath);
  const after = await readJson<TrackboardContract>(afterPath);
  const diff = diffContracts(before, after);
  console.log(JSON.stringify(diff, null, 2));
  return diff.breaking ? 2 : 0;
}

async function codegenCommand(args: string[]): Promise<number> {
  const [target] = args;
  const contractPath = flag(args, "--contract");
  const outPath = flag(args, "--out");
  if (target !== "typescript") throw new Error("Only codegen typescript is supported");
  if (!contractPath || !outPath) throw new Error("codegen typescript requires --contract and --out");
  const contract = await readJson<TrackboardContract>(contractPath);
  await writeFile(outPath, generateTypescript(contract), "utf8");
  console.log(`Generated ${outPath}`);
  return 0;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage(): void {
  console.error("Usage: trackboard validate|diff|codegen ...");
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
