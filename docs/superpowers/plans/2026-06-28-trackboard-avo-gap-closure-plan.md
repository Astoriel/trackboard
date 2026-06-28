# Trackboard Avo Gap Closure Plan

Date: 2026-06-28
Status: implementation sprint plan

## Goal

Close the most visible gaps between Trackboard and an Avo-like tracking-plan workflow without turning Trackboard into a fake enterprise platform.

The immediate target is not full Avo parity. The target is a credible OSS loop:

1. design clean events,
2. warn about duplicate taxonomy,
3. validate runtime traffic,
4. observe implementation health,
5. triage invalid events,
6. bridge Guard runtime DLQ back into the control plane.

## Scope

### 1. Deterministic DLQ Triage Fallback

Current problem:

- `POST /dlq/groups/{fingerprint}/triage` needs an AI provider.
- Without a provider, deterministic grouping works but triage feels broken.

Target behavior:

- Triage endpoint returns a useful deterministic report even without AI.
- AI adds a richer explanation only when configured.
- Runtime validation and grouping remain deterministic.

Acceptance:

- No provider: `200` with `status: deterministic_only`.
- Provider configured: existing AI report and cache still work.
- UI can say "Generate triage report" rather than implying AI is mandatory.

### 2. Guard DLQ Bridge

Current problem:

- Guard SQLite DLQ is operationally useful but separate from the API/control-plane DLQ.
- Observability cannot claim a unified runtime issue surface until there is a bridge.

Target behavior:

- Guard can export rejected DLQ records in a control-plane-friendly NDJSON shape.
- API can import exported records, or at minimum the export contract is implemented and documented.

Preferred command:

```bash
trackboard-guard dlq export --config guard.yaml --format ndjson --limit 100
```

Preferred API:

```http
POST /api/v1/plans/{plan_id}/dlq/import
```

Acceptance:

- Export does not replay or mutate events.
- Exported records avoid secrets in docs and include enough metadata for grouping.
- Existing Guard replay remains intact.

### 3. Semantic Warning Coverage

Current problem:

- Semantic consistency warning is mounted only in create-event flow.

Target behavior:

- Show advisory warnings when editing an event.
- Show semantic warnings in merge review for added/changed events or as a branch audit panel.

Acceptance:

- Warnings remain advisory.
- Merge is not blocked in v0.
- User can continue with clear human-review language.

### 4. Implementation Status V0

Current problem:

- Trackboard validates traffic and shows DLQ, but does not yet show Avo-like implementation status by event/source.

Target behavior:

- Compute event implementation status from existing plan events and validation logs:
  - `never_seen`
  - `seen_valid`
  - `seen_invalid`
  - `mixed`
- Display compact implementation status in Observability.

Acceptance:

- No new runtime dependency.
- No AI.
- Works from existing `ValidationLog` and plan schema.

## Non-Goals

- Full Avo parity.
- Enterprise approval workflows.
- Multi-tenant hosted service.
- Auto-fixing contracts.
- Runtime AI validation.
- Guard multi-node queue rewrite.

## Agent Slices

### Agent A: Deterministic DLQ Triage Fallback

Files:

- `apps/api/app/services/dlq_triage_service.py`
- `apps/api/app/schemas/tracking_plan.py`
- `apps/api/tests/test_dlq_triage_api.py`

### Agent B: Guard DLQ Bridge

Files:

- `apps/guard/cmd/trackboard-guard/main.go`
- `apps/guard/internal/store/*`
- `apps/guard/README.md`
- `docs/guard.md`
- optional API import route

### Agent C: Semantic Warning Coverage

Files:

- `apps/web/src/components/schema-editor/SemanticConsistencyWarning.tsx`
- `apps/web/src/app/(dashboard)/plans/[planId]/page.tsx`
- `apps/web/src/app/(dashboard)/plans/[planId]/merge-requests/[mrId]/page.tsx`

### Agent D: Implementation Status V0

Files:

- `apps/api/app/services/implementation_status.py`
- `apps/api/app/api/implementation_status.py`
- `apps/web/src/app/(dashboard)/plans/[planId]/observability/page.tsx`
- tests

## Verification

Run:

```bash
python -m pytest -q
npm test
npm run build
go test ./...
.\scripts\verify-trackboard-v1.ps1
```

Final commit should land only after full verification passes.
