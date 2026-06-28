# CLI

The Trackboard CLI gives contracts a local workflow before they reach production.

## Install

```bash
cd apps/cli
npm ci
npm test
```

The executable is built to `dist/src/index.js`.

## Validate

```bash
node dist/src/index.js validate \
  --contract ../../examples/contracts/web-analytics.v1.json \
  --event ../../examples/events/signup.valid.json
```

Exit codes:

- `0`: event is valid.
- `1`: event has validation violations.
- `64`: CLI usage or parsing error.

## Diff

```bash
node dist/src/index.js diff \
  ../../examples/contracts/web-analytics.v1.json \
  ../../examples/contracts/web-analytics.breaking.json
```

Exit codes:

- `0`: no breaking changes.
- `2`: breaking changes detected.
- `64`: CLI usage or parsing error.

The diff classifies changes as breaking, safe, or informational.

## Codegen

```bash
node dist/src/index.js codegen typescript \
  --contract ../../examples/contracts/web-analytics.v1.json \
  --out ../../examples/generated/trackboard-events.ts
```

The generated TypeScript includes event payload types and small tracking helper functions.

## Semantic Consistency

```bash
node dist/src/index.js lint-consistency \
  --contract ../../examples/contracts/web-analytics.v1.json \
  --threshold 65
```

`lint-consistency` runs a deterministic audit over exported `trackboard.contract.v1` JSON and reports event pairs that look semantically similar. The human output includes the event pair, label, score, recommendation, and evidence for each scoring signal.

Use `--json` for stable machine-readable output:

```bash
node dist/src/index.js lint-consistency \
  --contract contract.json \
  --threshold 65 \
  --json
```

Labels:

- `duplicate_likely`: score `>= 82`.
- `possibly_related`: score `65-81`.
- `weak_signal`: score `50-64`, only shown when the threshold includes it.

Exit codes:

- `0`: audit completed. This is the default even when candidates are found.
- `2`: `--strict` was set and at least one `duplicate_likely` candidate was found.
- `64`: CLI usage or parsing error.

The checker is local and deterministic in V0. It does not call the Trackboard API, use AI, mutate contracts, or scan source files.
