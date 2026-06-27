# Trackboard OSS Avo-Like Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Trackboard into a self-hosted, open-source tracking plan platform with CI/codegen workflows and a runtime Guard for Segment-compatible event enforcement.

**Architecture:** The existing FastAPI/Next.js app remains the control plane. A canonical contract core powers export, validation, diff, CLI, GitHub Action, and TypeScript SDK generation. A Go Guard under `apps/guard` acts as the data plane with HTTP ingest, contract cache, SQLite outbox/DLQ, workers, forwarding, and metrics.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2, PostgreSQL, pytest, Next.js/TypeScript, Node.js CLI wrapper, Go 1.22+, SQLite, Prometheus metrics, GitHub Actions, Docker Compose.

---

## Phase 0: Baseline Stabilization

### Task 0.1: Confirm Current Failure Surface

**Files:**
- Read: `apps/api/tests/test_validation_engine.py`
- Read: `apps/api/tests/test_version_compatibility.py`
- Read: `apps/api/app/api/versions.py`
- Read: `apps/api/app/services/validation_service.py`

- [ ] Run backend tests:

```powershell
cd apps/api
python -m pytest tests/test_validation_engine.py tests/test_version_compatibility.py -q
```

Expected current failure:

```text
ModuleNotFoundError: No module named 'app.services.validation_engine'
ModuleNotFoundError: No module named 'app.services.version_service'
```

- [ ] Record the actual failures in the implementation notes before coding.

### Task 0.2: Restore Validation Engine

**Files:**
- Create: `apps/api/app/services/validation_engine.py`
- Test: `apps/api/tests/test_validation_engine.py`

- [ ] Add tests for every V1 reason code in `apps/api/tests/test_validation_engine.py`:

```python
def test_validation_engine_reports_missing_required_property():
    result = validate_payload(
        _snapshot(),
        event_name="signup_completed",
        payload={"age": 21},
        mode="block",
    )
    codes = [violation.code for violation in result["violations"]]
    assert result["valid"] is False
    assert "missing_required_property" in codes
```

- [ ] Implement `validate_payload(snapshot, event_name, payload, mode)` in `validation_engine.py`.

Required behavior:

- Find event by `event_name`.
- Build merged property map from local and linked global properties.
- Report `unknown_event` when event is absent.
- Report `missing_required_property`.
- Report `unknown_property`.
- Report `type_mismatch`.
- Report `enum_violation`.
- Report `min_violation`.
- Report `max_violation`.
- Return `{"valid": bool, "violations": list[ViolationResponse]}`.

- [ ] Run:

```powershell
python -m pytest tests/test_validation_engine.py -q
```

Expected: all validation engine tests pass.

- [ ] Commit:

```bash
git add apps/api/app/services/validation_engine.py apps/api/tests/test_validation_engine.py
git commit -m "fix: restore validation engine"
```

### Task 0.3: Restore Version Service

**Files:**
- Create: `apps/api/app/services/version_service.py`
- Modify: `apps/api/tests/test_version_compatibility.py`
- Test: `apps/api/tests/test_versions.py`

- [ ] Implement `VersionService` with methods used by `apps/api/app/api/versions.py`.

Required method behavior:

```text
__init__(db):
  Store the async SQLAlchemy session. Allow db=None only for pure compatibility-report unit tests.

publish_plan(plan_id, user_id, data):
  Load the plan through SnapshotService.
  Reject stale draft_revision with code stale_draft_revision.
  Build current snapshot.
  Load previous latest version if one exists.
  Build compatibility_report from previous and current snapshots.
  Reject breaking report when data.allow_breaking is false with code breaking_changes.
  Create Version with version_number latest+1, snapshot, change_summary, compatibility_report, publish_kind=manual, published_from_revision.
  Update plan.current_version.
  Flush and return Version.

list_versions(plan_id):
  Return versions for the plan ordered by version_number descending.

get_version(version_id):
  Return Version or raise NotFoundError("Version", code="version_not_found").

diff_versions(version_a, version_b):
  Load both versions and return SnapshotService.diff_snapshots plus compatibility output.

restore_version(version_id, user_id):
  Load version and plan.
  Apply version.snapshot to the plan through SnapshotService.apply_snapshot_to_plan.
  Increment draft_revision.
  Mark restored_from_version_id on the next publish through existing schema fields where available.
  Flush and return TrackingPlan.

_build_compatibility_report(previous_snapshot, current_snapshot):
  Return {"breaking": bool, "checks": list[dict]} using contract_diff classification.
```

- [ ] Compatibility report must classify:

```text
property_type_changed
property_became_required
enum_value_removed
event_removed
property_removed
```

- [ ] Run:

```powershell
python -m pytest tests/test_version_compatibility.py tests/test_versions.py -q
```

Expected: compatibility and version endpoint tests pass.

- [ ] Commit:

```bash
git add apps/api/app/services/version_service.py apps/api/tests/test_version_compatibility.py
git commit -m "fix: restore version service"
```

## Phase 1: Canonical Contract Core

### Task 1.1: Add Canonical Contract Export Schema

**Files:**
- Create: `apps/api/app/services/contract_export_service.py`
- Modify: `apps/api/app/api/codegen.py`
- Modify: `apps/api/app/api/router.py`
- Test: `apps/api/tests/test_contract_export.py`

- [ ] Write test `test_export_published_contract_is_deterministic`.

Expected assertions:

```python
assert payload["format_version"] == "trackboard.contract.v1"
assert payload["version_number"] == 1
assert payload["hash"].startswith("sha256:")
event_names = [event["event_name"] for event in payload["events"]]
assert event_names == sorted(event_names)
```

- [ ] Implement endpoint:

```text
GET /api/v1/plans/{plan_id}/contract
```

Behavior:

- Requires view permission.
- Requires a published version.
- Exports latest published version by default.
- Accepts `?version=1`.
- Computes canonical SHA-256 hash.

- [ ] Run:

```powershell
python -m pytest tests/test_contract_export.py -q
```

- [ ] Commit:

```bash
git add apps/api/app/services/contract_export_service.py apps/api/app/api/codegen.py apps/api/app/api/router.py apps/api/tests/test_contract_export.py
git commit -m "feat: export canonical tracking contracts"
```

### Task 1.2: Add Contract Parser And Normalizer

**Files:**
- Create: `apps/api/app/services/contract_core.py`
- Test: `apps/api/tests/test_contract_core.py`

- [ ] Add parser tests:

```python
def test_contract_core_rejects_duplicate_events():
    contract = _contract(events=[_event("signup"), _event("signup")])
    with pytest.raises(ContractFormatError) as exc:
        parse_contract(contract)
    assert exc.value.code == "duplicate_event"
```

- [ ] Implement:

Required implementation surface:

```text
ContractFormatError:
  ValueError subclass with code and message.

parse_contract(raw):
  Validate format_version, duplicate event names, duplicate merged property names, allowed types, required booleans, and constraints shape.
  Return an immutable Contract dataclass or Pydantic model with event lookup maps.

normalize_contract(raw):
  Return deterministic dict with sorted events, sorted properties, sorted global_properties, sorted enum_values, and no hash field.

contract_hash(normalized):
  JSON-serialize with sort_keys=True and compact separators.
  Return sha256:<64 lowercase hex characters>.
```

- [ ] Run:

```powershell
python -m pytest tests/test_contract_core.py -q
```

- [ ] Commit:

```bash
git add apps/api/app/services/contract_core.py apps/api/tests/test_contract_core.py
git commit -m "feat: add canonical contract core"
```

### Task 1.3: Expand Compatibility Diff

**Files:**
- Modify: `apps/api/app/services/version_service.py`
- Create: `apps/api/app/services/contract_diff.py`
- Test: `apps/api/tests/test_contract_diff.py`

- [ ] Add golden diff fixture tests for:

```text
event_removed -> breaking
property_removed -> breaking
property_type_changed -> breaking
property_became_required -> breaking
enum_value_removed -> breaking
event_added -> safe
optional_property_added -> safe
description_changed -> informational
```

- [ ] Implement `diff_contracts(before, after) -> ContractDiff`.

- [ ] Update `VersionService._build_compatibility_report` to call `diff_contracts`.

- [ ] Run:

```powershell
python -m pytest tests/test_contract_diff.py tests/test_version_compatibility.py -q
```

- [ ] Commit:

```bash
git add apps/api/app/services/contract_diff.py apps/api/app/services/version_service.py apps/api/tests/test_contract_diff.py apps/api/tests/test_version_compatibility.py
git commit -m "feat: classify tracking contract changes"
```

## Phase 2: Developer Workflow

### Task 2.1: Add CLI Package

**Files:**
- Create: `apps/cli/package.json`
- Create: `apps/cli/src/index.ts`
- Create: `apps/cli/src/diff.ts`
- Create: `apps/cli/src/validate.ts`
- Create: `apps/cli/src/codegen.ts`
- Create: `apps/cli/tests/diff.test.ts`
- Create: `apps/cli/tests/validate.test.ts`
- Create: `apps/cli/fixtures/contract.v1.json`
- Create: `apps/cli/fixtures/contract.v2.breaking.json`

- [ ] CLI commands:

```bash
trackboard validate --contract apps/cli/fixtures/contract.v1.json --event apps/cli/fixtures/event.valid.json
trackboard diff apps/cli/fixtures/contract.v1.json apps/cli/fixtures/contract.v2.breaking.json
trackboard codegen typescript --contract apps/cli/fixtures/contract.v1.json --out generated/trackboard.ts
```

- [ ] Exit codes:

```text
validate valid event -> 0
validate invalid event -> 1
diff no breaking changes -> 0
diff breaking changes -> 2
invalid input file -> 64
```

- [ ] Run:

```powershell
cd apps/cli
npm test
npm run build
```

- [ ] Commit:

```bash
git add apps/cli package.json package-lock.json
git commit -m "feat: add tracking contract CLI"
```

### Task 2.2: Add GitHub Action For Contract Checks

**Files:**
- Create: `actions/contract-check/action.yml`
- Create: `actions/contract-check/README.md`
- Create: `.github/workflows/contract-check-example.yml`
- Test: `apps/cli/tests/action-output.test.ts`

- [ ] Action inputs:

```yaml
base-contract:
head-contract:
fail-on-breaking:
```

- [ ] Action outputs:

```yaml
breaking:
breaking-count:
summary-json:
```

- [ ] The action must write a Markdown summary containing:

```text
Trackboard Contract Check
Breaking changes
Safe changes
Informational changes
```

- [ ] Commit:

```bash
git add actions/contract-check .github/workflows/contract-check-example.yml apps/cli/tests/action-output.test.ts
git commit -m "feat: add contract check GitHub Action"
```

### Task 2.3: Upgrade TypeScript Codegen To SDK Helpers

**Files:**
- Modify: `apps/api/app/services/codegen_service.py`
- Modify: `apps/api/tests/test_codegen.py`
- Modify: `apps/cli/src/codegen.ts`
- Test: `apps/cli/tests/codegen.test.ts`

- [ ] Generated SDK must include:

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

- [ ] Tests assert helper names, enum unions, quoted property names, and generated file stability.

- [ ] Run:

```powershell
cd apps/api
python -m pytest tests/test_codegen.py -q
cd ..\..\apps\cli
npm test
```

- [ ] Commit:

```bash
git add apps/api/app/services/codegen_service.py apps/api/tests/test_codegen.py apps/cli/src/codegen.ts apps/cli/tests/codegen.test.ts
git commit -m "feat: generate typed tracking SDK helpers"
```

## Phase 3: Trackboard Guard Data Plane

### Task 3.1: Scaffold Go Guard

**Files:**
- Create: `apps/guard/go.mod`
- Create: `apps/guard/cmd/trackboard-guard/main.go`
- Create: `apps/guard/internal/config/config.go`
- Create: `apps/guard/internal/server/server.go`
- Create: `apps/guard/internal/health/health.go`
- Create: `apps/guard/README.md`

- [ ] Commands:

```bash
cd apps/guard
go test ./...
go run ./cmd/trackboard-guard --config ../../examples/guard/guard.local.yaml
```

- [ ] Health endpoints:

```text
GET /health/live -> 200
GET /health/ready -> 503 until contract is loaded
```

- [ ] Commit:

```bash
git add apps/guard
git commit -m "feat: scaffold Trackboard Guard"
```

### Task 3.2: Implement Contract Loader And Atomic Cache

**Files:**
- Create: `apps/guard/internal/contract/types.go`
- Create: `apps/guard/internal/contract/loader.go`
- Create: `apps/guard/internal/contract/cache.go`
- Create: `apps/guard/internal/contract/loader_test.go`
- Create: `apps/guard/internal/contract/cache_test.go`

- [ ] Loader behavior:

```text
Load local JSON file.
Validate format_version equals trackboard.contract.v1.
Normalize event/property lookup maps.
Store version_number and hash.
```

- [ ] Cache behavior:

```text
Readers always see a complete immutable contract.
Reload swaps atomically.
Reload failure keeps previous contract.
```

- [ ] Run race test:

```bash
go test -race ./internal/contract
```

- [ ] Commit:

```bash
git add apps/guard/internal/contract
git commit -m "feat: load contracts in Guard"
```

### Task 3.3: Implement Segment-Compatible Ingest

**Files:**
- Create: `apps/guard/internal/ingest/segment.go`
- Create: `apps/guard/internal/ingest/segment_test.go`
- Modify: `apps/guard/internal/server/server.go`

- [ ] `/v1/track` accepts:

```json
{
  "event": "signup_completed",
  "userId": "usr_123",
  "anonymousId": "anon_123",
  "messageId": "msg_123",
  "timestamp": "2026-06-27T12:00:00Z",
  "properties": {
    "user_id": "usr_123",
    "signup_method": "google"
  }
}
```

- [ ] Failure behavior:

```text
invalid JSON -> 400
body too large -> 413
no loaded contract -> 503
accepted into outbox or DLQ -> 202
```

- [ ] Commit:

```bash
git add apps/guard/internal/ingest apps/guard/internal/server
git commit -m "feat: accept Segment-compatible track events"
```

### Task 3.4: Implement Guard Validator And Policy Engine

**Files:**
- Create: `apps/guard/internal/validator/validator.go`
- Create: `apps/guard/internal/validator/validator_test.go`
- Create: `apps/guard/internal/policy/policy.go`
- Create: `apps/guard/internal/policy/policy_test.go`

- [ ] Validator reason codes match backend reason codes:

```text
unknown_event
inactive_event
missing_required_property
unknown_property
type_mismatch
enum_violation
min_violation
max_violation
invalid_timestamp
missing_identity
invalid_payload_shape
```

- [ ] Policy behavior:

```text
observe -> forward valid and invalid, record violations as warnings
warn -> forward valid and invalid, write invalid to DLQ as warning
block -> forward valid only, write invalid to DLQ as blocked
```

- [ ] Run:

```bash
go test ./internal/validator ./internal/policy
```

- [ ] Commit:

```bash
git add apps/guard/internal/validator apps/guard/internal/policy
git commit -m "feat: validate events in Guard"
```

### Task 3.5: Add SQLite Outbox And DLQ

**Files:**
- Create: `apps/guard/internal/store/store.go`
- Create: `apps/guard/internal/store/migrations.go`
- Create: `apps/guard/internal/store/store_test.go`

- [ ] Tables:

```sql
CREATE TABLE outbox_events (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  destination TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  leased_until TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE dlq_events (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  event_name TEXT NOT NULL,
  severity TEXT NOT NULL,
  reason_codes_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  replay_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

- [ ] Store tests cover insert, duplicate idempotency key, lease, complete, retry schedule, and DLQ insert.

- [ ] Commit:

```bash
git add apps/guard/internal/store
git commit -m "feat: add durable Guard outbox and DLQ"
```

### Task 3.6: Add Worker Pool And Forwarder

**Files:**
- Create: `apps/guard/internal/forwarder/segment.go`
- Create: `apps/guard/internal/forwarder/segment_test.go`
- Create: `apps/guard/internal/runtime/workers.go`
- Create: `apps/guard/internal/runtime/workers_test.go`

- [ ] Forwarder behavior:

```text
2xx -> mark delivered
429/500/502/503/504 -> retry with backoff
400/401/403 -> terminal failure
network timeout -> retry with backoff
```

- [ ] Worker behavior:

```text
bounded worker count
context cancellation
lease before send
no double-send for same idempotency key
graceful shutdown drains leased work until timeout
```

- [ ] Run:

```bash
go test -race ./internal/forwarder ./internal/runtime
```

- [ ] Commit:

```bash
git add apps/guard/internal/forwarder apps/guard/internal/runtime
git commit -m "feat: forward accepted events with retries"
```

### Task 3.7: Add Metrics And Load Test

**Files:**
- Create: `apps/guard/internal/metrics/metrics.go`
- Create: `apps/guard/internal/metrics/metrics_test.go`
- Create: `apps/guard/scripts/loadtest.js`
- Create: `docs/guard-benchmarks.md`

- [ ] Metrics endpoint exposes:

```text
trackboard_guard_events_accepted_total
trackboard_guard_events_forwarded_total
trackboard_guard_events_blocked_total
trackboard_guard_events_retried_total
trackboard_guard_queue_depth
trackboard_guard_validation_duration_seconds
trackboard_guard_forward_duration_seconds
```

- [ ] Load test records:

```text
requests per second
p50 latency
p95 latency
p99 latency
blocked count
forwarded count
queue depth max
```

- [ ] Commit:

```bash
git add apps/guard/internal/metrics apps/guard/scripts/loadtest.js docs/guard-benchmarks.md
git commit -m "feat: add Guard metrics and benchmark harness"
```

### Task 3.8: Add Replay Command

**Files:**
- Modify: `apps/guard/cmd/trackboard-guard/main.go`
- Create: `apps/guard/internal/replay/replay.go`
- Create: `apps/guard/internal/replay/replay_test.go`

- [ ] Command:

```bash
trackboard-guard replay --config examples/guard/guard.local.yaml --limit 100
```

- [ ] Behavior:

```text
Load DLQ rows with replay_status=pending.
Revalidate against current contract.
Move valid rows to outbox.
Keep invalid rows in DLQ with updated reason codes.
Print summary.
```

- [ ] Commit:

```bash
git add apps/guard/cmd/trackboard-guard apps/guard/internal/replay
git commit -m "feat: replay fixed Guard DLQ events"
```

## Phase 4: Packaging And Product Surface

### Task 4.1: Update README Positioning

**Files:**
- Modify: `README.md`
- Modify: `STATUS.md`
- Modify: `KNOWN_LIMITATIONS.md`

- [ ] README first paragraph:

```markdown
Trackboard is an open-source, self-hosted tracking plan platform for teams that want Avo-like analytics governance without SaaS lock-in.
```

- [ ] README must include:

```text
What it is
Why self-hosted
Workflow
Screenshots
Quick start
CLI
GitHub Action
Guard
Current status
Non-goals
```

- [ ] Commit:

```bash
git add README.md STATUS.md KNOWN_LIMITATIONS.md
git commit -m "docs: position Trackboard as self-hosted tracking plan management"
```

### Task 4.2: Add Docs

**Files:**
- Create: `docs/contracts.md`
- Create: `docs/cli.md`
- Create: `docs/github-action.md`
- Create: `docs/codegen.md`
- Create: `docs/guard.md`
- Create: `docs/guard-operations.md`
- Create: `docs/comparison.md`

- [ ] Each doc must include one working command or request example.

- [ ] `docs/comparison.md` must avoid hostile copy and use category language:

```text
SaaS tracking-plan tools
Self-hosted Trackboard
```

- [ ] Commit:

```bash
git add docs/contracts.md docs/cli.md docs/github-action.md docs/codegen.md docs/guard.md docs/guard-operations.md docs/comparison.md
git commit -m "docs: add Trackboard workflow guides"
```

### Task 4.3: Add Compose Demo

**Files:**
- Modify: `docker-compose.yml`
- Create: `examples/guard/guard.local.yaml`
- Create: `examples/contracts/web-analytics.v1.json`
- Create: `examples/events/signup.valid.json`
- Create: `examples/events/signup.invalid.json`
- Create: `examples/fake-destination/server.js`

- [ ] Demo flow:

```bash
docker compose up --build
curl -X POST http://localhost:8080/v1/track -d @examples/events/signup.valid.json
curl -X POST http://localhost:8080/v1/track -d @examples/events/signup.invalid.json
curl http://localhost:8080/metrics
```

- [ ] Commit:

```bash
git add docker-compose.yml examples
git commit -m "feat: add local Guard demo"
```

### Task 4.4: End-To-End Verification

**Files:**
- Create: `scripts/verify-trackboard-v1.ps1`
- Create: `.github/workflows/ci.yml` or update existing CI

- [ ] Verification script runs:

```powershell
cd apps/api
python -m pytest
cd ..\web
npm run lint
npm run build
cd ..\cli
npm test
npm run build
cd ..\guard
go test ./...
go test -race ./...
go vet ./...
```

- [ ] CI runs the same checks on pull requests.

- [ ] Commit:

```bash
git add scripts/verify-trackboard-v1.ps1 .github/workflows/ci.yml
git commit -m "ci: verify Trackboard platform workflow"
```

## Release Checklist

- [ ] All backend tests pass.
- [ ] CLI tests pass.
- [ ] Guard tests pass with `-race`.
- [ ] Web lint and build pass.
- [ ] Docker Compose demo works locally.
- [ ] README examples were copied from working commands.
- [ ] `STATUS.md` states prototype status honestly.
- [ ] `KNOWN_LIMITATIONS.md` lists V1 limits.
- [ ] `docs/guard-benchmarks.md` includes local machine specs and reproducible command.
- [ ] Tag `v0.1.0` only after the full local workflow works end to end.

## Work Queue Summary

- [ ] Restore `validation_engine`.
- [ ] Restore `version_service`.
- [ ] Add canonical contract export.
- [ ] Add contract parser/normalizer/hash.
- [ ] Add compatibility diff.
- [ ] Add CLI validate/diff/codegen.
- [ ] Add GitHub Action.
- [ ] Upgrade TypeScript SDK codegen.
- [ ] Scaffold Go Guard.
- [ ] Add Guard contract cache.
- [ ] Add Guard ingest.
- [ ] Add Guard validation and policies.
- [ ] Add Guard outbox and DLQ.
- [ ] Add Guard workers and forwarding.
- [ ] Add Guard metrics and benchmarks.
- [ ] Add Guard replay.
- [ ] Update README positioning.
- [ ] Add workflow docs.
- [ ] Add Compose demo.
- [ ] Add full verification script and CI.
