# Trackboard OSS Avo-Like Platform Design

Date: 2026-06-27

## Product Thesis

Trackboard should be positioned as an open-source, self-hosted tracking plan platform for teams that want Avo-like analytics governance without SaaS lock-in.

The product should not compete by being broader than Avo, Segment Protocols, PostHog, or Snowplow. It should compete by owning one complete workflow:

1. Define a product analytics contract.
2. Review changes before they reach production.
3. Generate typed instrumentation helpers.
4. Enforce the published contract at runtime.
5. Quarantine invalid events with clear reason codes.
6. Replay events after the contract or instrumentation is fixed.

This gives the market story a known paid analogue while giving the engineering story a real systems component.

## Market Position

Primary positioning:

> Open-source tracking plan management for teams that want Avo-like workflows, self-hosted.

Secondary positioning:

> A self-hosted alternative to SaaS tracking-plan tools, with runtime contract enforcement for Segment-compatible analytics events.

Avoid using "open-source Avo" as the main headline. It is useful shorthand in private planning, but public copy should name the category first and mention SaaS tracking-plan tools only as context.

Market references to keep in the README and docs:

- Avo pricing and product surface: paid tracking plan management, branches, codegen, Inspector, CLI, and governance.
- Segment Protocols: tracking plans and violation detection.
- RudderStack tracking plans: contract between teams, validation rules, CLI workflows.
- Amplitude event validation: missing properties, wrong types, and taxonomy drift.
- Snowplow schemas and failed events: runtime validation with separated invalid payloads.
- PostHog schema and event definitions: open-source analytics teams care about event/property quality.

## Target Users

Primary users:

- Startups that cannot justify a paid tracking-plan SaaS.
- Product analytics teams that want tracking plan governance but need self-hosting.
- Engineering-led teams already sending events to Segment, RudderStack, PostHog, or warehouse pipelines.
- Privacy-conscious companies that do not want product event metadata managed in another SaaS.

Secondary users:

- Data engineers who need a bridge between analytics instrumentation and warehouse contracts.
- Analytics engineers who want CI checks before tracking-plan changes ship.
- Founders and staff engineers evaluating open-source analytics infrastructure.

## Success Criteria

V1 is successful when a user can run this workflow locally and in CI:

1. Start Trackboard with Docker Compose.
2. Import or create a tracking plan.
3. Publish version 1.
4. Export the published contract as JSON.
5. Run `trackboard diff old.json new.json` and get breaking-change output.
6. Generate a TypeScript instrumentation package.
7. Add a GitHub Action that fails on breaking tracking-plan changes.
8. Run Trackboard Guard.
9. Send Segment-compatible `/v1/track` events through Guard.
10. See valid events forwarded and invalid events written to a DLQ with reason codes.
11. Replay fixed events from the DLQ.

Recruiter success criteria:

- The repository demonstrates product judgment, not just isolated tools.
- The backend shows versioning, validation, diffing, code generation, and integration boundaries.
- The Guard component shows HTTP networking, concurrency, durable queues, retries, idempotency, metrics, graceful shutdown, and load testing.
- The docs state what is real, what is planned, and what is explicitly out of scope.

## Current State

Already present in the repository:

- FastAPI backend with PostgreSQL/Alembic models.
- Next.js dashboard for plans, events, versions, merge requests, settings, validation, and DLQ-style views.
- Import/export-shaped snapshot logic in `SnapshotService`.
- Published versions and restore endpoints are wired through `app.api.versions`.
- TypeScript and JSON Schema generation endpoints exist.
- Validation API endpoints exist.
- Tests cover auth, API keys, validation, codegen, merge requests, tracking plans, versions, and health.

Known gaps in the current tree:

- `app.services.validation_engine` is imported and tested but the file is missing.
- `app.services.version_service` is imported and tested but the file is missing.
- Codegen currently produces types and JSON Schema, but not an ergonomic typed SDK.
- CLI and GitHub Action surfaces are missing.
- Runtime relay/Guard is missing.
- Public positioning does not yet explain the commercial analogue or the complete workflow.

## Product Architecture

Trackboard has four layers:

```text
Trackboard UI/API
  - tracking plan authoring
  - branches, merge review, published versions
  - contract export
  - invalid event review

Trackboard Contract Core
  - canonical contract format
  - parser and normalizer
  - validation engine
  - compatibility diff
  - reason codes

Trackboard Developer Surfaces
  - CLI: validate, diff, codegen
  - GitHub Action: fail on breaking changes
  - TypeScript SDK/codegen

Trackboard Guard
  - Segment-compatible ingest
  - contract cache and hot reload
  - policy modes: observe, warn, block
  - outbox, DLQ, replay
  - destination forwarding
  - metrics, logs, graceful shutdown
```

The UI/API is the control plane. Guard is the data plane. The contract JSON is the stable boundary between them.

## Canonical Contract Format

The exported contract should be deterministic JSON:

```json
{
  "format_version": "trackboard.contract.v1",
  "plan_id": "uuid",
  "version_id": "uuid",
  "version_number": 1,
  "name": "Web Analytics",
  "description": "Core product events",
  "published_at": "2026-06-27T12:00:00Z",
  "hash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "global_properties": [
    {
      "name": "user_id",
      "type": "string",
      "required": true,
      "constraints": {},
      "description": "Stable user id",
      "examples": ["usr_123"]
    }
  ],
  "events": [
    {
      "event_name": "signup_completed",
      "status": "active",
      "description": "User completed signup",
      "category": "activation",
      "properties": [
        {
          "name": "signup_method",
          "type": "string",
          "required": true,
          "constraints": {
            "enum_values": ["email", "google", "github"]
          },
          "description": "Signup method",
          "examples": ["google"]
        }
      ],
      "global_properties": ["user_id"]
    }
  ]
}
```

Normalization rules:

- Sort events by `event_name`.
- Sort properties by `name`.
- Sort enum values lexicographically unless explicit order is later required.
- Include global properties in validation through `global_properties` links, but keep them separate in the JSON.
- Compute `hash` over the canonical contract without the `hash` field.
- Reject duplicate event names.
- Reject duplicate property names after local and global properties are merged for an event.

## Validation Rules

The validator returns stable reason codes and never returns vague strings as the primary API.

Required reason codes:

- `unknown_event`
- `inactive_event`
- `missing_required_property`
- `unknown_property`
- `type_mismatch`
- `enum_violation`
- `min_violation`
- `max_violation`
- `pattern_violation`
- `invalid_timestamp`
- `missing_identity`
- `invalid_payload_shape`

Default event shape for Guard ingest:

```json
{
  "event": "signup_completed",
  "userId": "usr_123",
  "anonymousId": "anon_123",
  "timestamp": "2026-06-27T12:00:00Z",
  "properties": {
    "user_id": "usr_123",
    "signup_method": "google"
  },
  "context": {
    "source": "web"
  },
  "messageId": "msg_123"
}
```

Identity rule:

- A track event must include at least one of `userId`, `anonymousId`, or a configured identity property.

Unknown property policy:

- Default V1 behavior is strict: unknown properties are violations.
- A config flag can allow unknown properties in `observe` mode only.

## Compatibility Diff

The diff engine classifies changes as `breaking`, `safe`, or `informational`.

Breaking changes:

- Event removed.
- Active event marked inactive or deprecated with blocking policy.
- Property removed.
- Property type changed.
- Optional property became required.
- Enum value removed.
- Numeric min increased.
- Numeric max decreased.
- Pattern became stricter.
- Identity requirement became stricter.

Safe changes:

- Event added.
- Optional property added.
- Required property became optional.
- Enum value added.
- Numeric min decreased.
- Numeric max increased.
- Description/category/examples changed.

Output shape:

```json
{
  "breaking": true,
  "summary": {
    "breaking_count": 2,
    "safe_count": 1,
    "informational_count": 1
  },
  "changes": [
    {
      "severity": "breaking",
      "code": "property_type_changed",
      "event": "signup_completed",
      "property": "signup_method",
      "before": "string",
      "after": "integer",
      "message": "signup_completed.signup_method changed from string to integer"
    }
  ]
}
```

## CLI Design

CLI binary/package name:

- Local command: `trackboard`
- Repository subproject: `apps/cli`

Commands:

```bash
trackboard validate --contract contract.json --event event.json
trackboard diff old-contract.json new-contract.json
trackboard codegen typescript --contract contract.json --out ./generated/trackboard.ts
trackboard guard serve --config guard.yaml
trackboard guard replay --config guard.yaml --limit 100
```

V1 can implement `validate`, `diff`, and `codegen` before Guard exists. Guard commands are added when the Go data plane lands.

## GitHub Action Design

Action name:

```yaml
name: Trackboard Contract Check
```

Usage:

```yaml
- uses: Astoriel/trackboard/actions/contract-check@v1
  with:
    base-contract: tracking/contract.main.json
    head-contract: tracking/contract.pr.json
    fail-on-breaking: "true"
```

Behavior:

- Runs `trackboard diff`.
- Writes a Markdown summary to the GitHub Actions step summary.
- Exits with code 1 when breaking changes are found and `fail-on-breaking` is true.
- Uploads the diff JSON as an artifact.

## TypeScript SDK Codegen

Generated SDK should include:

- Event property interfaces.
- Discriminated union of valid events.
- `track<EventName>(client, properties, options)` helpers.
- A generic `track(client, event)` helper.
- Runtime development assertion function generated from JSON Schema.

Example output:

```ts
export interface SignupCompletedProperties {
  user_id: string;
  signup_method: "email" | "google" | "github";
}

export type TrackingEvent =
  | { event: "signup_completed"; properties: SignupCompletedProperties };

export function trackSignupCompleted(
  client: { track(input: TrackingEvent): Promise<void> },
  properties: SignupCompletedProperties,
): Promise<void> {
  return client.track({ event: "signup_completed", properties });
}
```

## Guard Design

Guard should be a Go component because it is the strongest systems signal and has a natural fit for HTTP servers, workers, channels, cancellation, benchmarks, race tests, and static binaries.

Guard can live in this repository under `apps/guard` for V1. A separate `trackboard-guard` repository can be created later if the component gains standalone adoption.

HTTP endpoints:

```text
POST /v1/track
POST /v1/identify
GET  /health/live
GET  /health/ready
GET  /metrics
```

Runtime architecture:

```text
HTTP server
  -> body limit and auth
  -> Segment event normalizer
  -> atomic contract cache
  -> validator
  -> policy engine
  -> SQLite outbox or DLQ
  -> worker pool
  -> destination adapter
```

Policy modes:

- `observe`: forward all events, record violations as warnings.
- `warn`: forward all events, write violations to DLQ with `warning` severity.
- `block`: do not forward invalid events; write them to DLQ.

Default HTTP behavior:

- Return `202 Accepted` when the event is accepted into the local outbox or DLQ.
- Return `400` for invalid JSON.
- Return `413` for body too large.
- Return `429` when queue/outbox admission is temporarily saturated.
- Return `503` when the service is not ready because no contract is loaded.

Strict mode:

- `strict_http_status: true` returns `422` for contract-invalid events.
- This should be off by default to avoid breaking production application requests.

Durability:

- Use SQLite for V1 outbox and DLQ.
- Use idempotency key from `messageId`; fallback to hash of destination, event name, timestamp, identity, and properties.
- Workers lease rows before forwarding to avoid double delivery.
- Retries use exponential backoff with jitter.
- Failed delivery after max attempts remains in outbox with terminal status and is visible in metrics.

Metrics:

- `trackboard_guard_events_accepted_total`
- `trackboard_guard_events_forwarded_total`
- `trackboard_guard_events_blocked_total`
- `trackboard_guard_events_warned_total`
- `trackboard_guard_events_retried_total`
- `trackboard_guard_events_failed_total`
- `trackboard_guard_queue_depth`
- `trackboard_guard_validation_duration_seconds`
- `trackboard_guard_forward_duration_seconds`
- `trackboard_guard_contract_version`

## Integrations

V1 required:

- Trackboard published contract JSON export.
- Local JSON contract file.
- Segment-compatible `/v1/track` ingest.
- Segment/RudderStack-compatible HTTP forwarding.
- GitHub Actions contract check.
- TypeScript SDK generation.
- Docker Compose self-hosting.
- Prometheus metrics endpoint.

V1.1:

- PostHog `/capture` adapter.
- `/v1/batch` ingest.
- Remote contract polling with ETag/hash.
- DLQ NDJSON export.
- Slack/webhook alert for repeated validation failures.

Later:

- Amplitude adapter.
- Snowplow adapter.
- dbt-doctor mapping from analytics contracts to warehouse expectations.
- OpenTelemetry tracing.
- Hosted demo.

Explicit non-goals:

- Billing.
- Multi-tenant SaaS.
- Enterprise SSO.
- Generic API gateway behavior.
- Kubernetes-first deployment.
- Kafka-first architecture.
- Visual lineage graph.
- Full policy language.
- Fake users, fake incident reports, or fake production claims.

## Testing Strategy

Backend tests:

- Unit tests for validation reason codes.
- Unit tests for compatibility diff classification.
- API tests for publish/export/restore/diff.
- API tests for codegen output.
- Regression tests for duplicate event and duplicate property rejection.

CLI tests:

- Golden-file tests for `diff`.
- Golden-file tests for TypeScript SDK output.
- JSON fixture tests for `validate`.
- Exit-code tests for breaking vs non-breaking diffs.

Guard tests:

- Go unit tests for normalizer, validator, policy, idempotency key generation, retry schedule, and destination adapters.
- SQLite integration tests with temporary DB files.
- Fake destination HTTP server tests.
- Concurrent ingest tests with `go test -race`.
- Hot contract reload tests while requests are being validated.
- Graceful shutdown tests that stop new requests and drain leased work.
- Benchmarks for validation and ingest admission.

End-to-end tests:

- Docker Compose starts API, web, Guard, and fake destination.
- Create/publish/export a contract.
- Start Guard with that contract.
- Send valid and invalid events.
- Assert valid events reach fake destination.
- Assert invalid events are in DLQ.
- Run replay after changing the contract or payload fixture.

Quality gates:

```bash
cd apps/api && python -m pytest
cd apps/web && npm run lint && npm run build
cd apps/guard && go test ./... && go test -race ./... && go vet ./...
docker compose build
```

## Documentation Requirements

README should show:

- Category positioning in the first paragraph.
- Clear comparison table against SaaS tracking-plan tools without hostile naming.
- One local quickstart.
- One CI example.
- One Guard runtime example.
- One screenshot row for UI.
- Status section that distinguishes working, planned, and non-goals.

Docs to add:

- `docs/contracts.md`
- `docs/cli.md`
- `docs/github-action.md`
- `docs/codegen.md`
- `docs/guard.md`
- `docs/guard-operations.md`
- `docs/comparison.md`

## Milestones

Milestone 0: Stabilize current repo.

- Restore missing `validation_engine` and `version_service`.
- Make existing backend tests pass.
- Document current limitations honestly.

Milestone 1: Canonical contract core.

- Export deterministic published contract JSON.
- Add parser/normalizer tests.
- Add compatibility diff with stable reason codes.

Milestone 2: Developer workflow.

- Add CLI validate/diff/codegen.
- Add GitHub Action.
- Upgrade TypeScript codegen from types to ergonomic SDK helpers.

Milestone 3: Guard data plane.

- Build Go Guard with local contract file, `/v1/track`, validation, outbox, DLQ, worker pool, Segment/RudderStack forwarding, metrics, and graceful shutdown.

Milestone 4: Product packaging.

- Update README positioning.
- Add examples, fixtures, Compose demo, and end-to-end test.
- Add release checklist and `v0.1.0` notes.
