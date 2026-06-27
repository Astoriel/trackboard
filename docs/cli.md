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
