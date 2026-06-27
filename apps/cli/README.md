# Trackboard CLI

Local contract tools for Trackboard.

```bash
npm ci
npm test
```

Commands:

```bash
node dist/src/index.js validate --contract ../../examples/contracts/web-analytics.v1.json --event ../../examples/events/signup.valid.json
node dist/src/index.js diff ../../examples/contracts/web-analytics.v1.json ../../examples/contracts/web-analytics.breaking.json
node dist/src/index.js codegen typescript --contract ../../examples/contracts/web-analytics.v1.json --out ../../examples/generated/trackboard-events.ts
```

Exit codes:

- `0`: success or no breaking changes.
- `1`: validation failed.
- `2`: breaking contract changes detected.
- `64`: usage or parsing error.
