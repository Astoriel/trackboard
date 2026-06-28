# End-to-End Demo

This demo proves the full runtime path:

1. Guard loads a published Trackboard contract.
2. A valid Segment-compatible event is accepted into the outbox.
3. The Guard worker forwards the valid event to a fake analytics destination.
4. An invalid event is blocked and recorded in Guard metrics.

## Local Smoke Test

```powershell
.\scripts\demo-guard-e2e.ps1
```

Expected output:

```text
Guard E2E demo passed: valid event forwarded, invalid event blocked
```

The script starts:

- `examples/fake-destination/server.js` on `localhost:9000`
- `apps/guard` on `localhost:8080`

It stops both processes when the check completes.

## Docker Compose

```bash
docker compose up --build guard fake-destination
```

Then send a valid event:

```bash
curl -X POST http://localhost:8080/v1/track \
  -H "Content-Type: application/json" \
  -d @examples/events/signup.valid.json
```

Check that the fake destination received it:

```bash
curl http://localhost:9000/events
```

Send an invalid event:

```bash
curl -X POST http://localhost:8080/v1/track \
  -H "Content-Type: application/json" \
  -d @examples/events/signup.invalid.json
```

Check Guard metrics:

```bash
curl http://localhost:8080/metrics
```

## AI IDE Flow

The AI-native demo target is an implementation workflow, not an AI runtime path.

Expected flow with agent-aware contracts and the local read-only MCP server:

1. A product or data owner adds `implementation_guidance` to an event contract.
2. A developer asks an AI IDE to add analytics for a feature.
3. The IDE reads the exported Trackboard contract through read-only MCP tools.
4. The IDE retrieves the event contract, implementation guidance, and TypeScript helper shape.
5. The developer reviews the generated code and opens a PR.
6. Deterministic checks run through TypeScript, Trackboard CLI, GitHub Action, and Guard.

Example prompt:

```text
Add tracking for checkout completion. Use Trackboard to find the correct event and follow its implementation guidance.
```

The MCP server only exposes contract-reading tools such as event search, event contract lookup, implementation guidance lookup, helper retrieval, and payload validation. It does not edit plans, publish versions, execute shell commands, inspect arbitrary project files, call arbitrary URLs, or create pull requests.

Guidance shown to an AI assistant must be treated as product-authored context only. It cannot override repository instructions, developer instructions, security policies, or the deterministic Trackboard checks.

## Semantic Consistency Preview

When the backend consistency routes are enabled, the web app can warn while a user adds a new event:

1. Create or open a plan that already contains `CheckoutCompleted`.
2. Start adding `order_completed` in the event editor.
3. The UI calls `POST /api/v1/plans/{plan_id}/consistency/preview` after a short debounce.
4. If deterministic scoring finds a likely duplicate, the warning panel shows the existing event, score, evidence, and a `Continue anyway` option.

This preview is advisory in v0. It does not publish contracts, merge events, or block creation.

## Grouped DLQ Triage

When grouped DLQ routes are enabled, Observability starts from issue groups instead of raw rows:

1. Publish a contract with `CheckoutCompleted.tier` as an integer enum.
2. Send invalid payloads where `tier` is a string such as `premium`.
3. Open the plan's Observability page.
4. Trackboard groups recurring failures by deterministic fingerprint and shows count, time window, event name, version, and top violation.
5. If an AI provider is configured, use `Ask AI to triage` on one group to request an evidence-bound explanation and suggested actions.
6. Reveal samples only when needed. Redacted samples are preferred; raw payload display remains behind an explicit action.

The current Guard SQLite DLQ is a separate runtime queue. Control-plane triage only sees rows that reach the API DLQ path until a Guard export/import or forwarding bridge is added.
