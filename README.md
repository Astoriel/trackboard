<p align="center">
  <img src="docs/assets/trackboard-logo.svg" width="560" alt="Trackboard" />
</p>

<p align="center">
  <strong>Open-source tracking plan management for teams that want analytics contracts in their own stack.</strong>
</p>

<p align="center">
  <a href="#what-it-is">What it is</a> |
  <a href="#architecture">Architecture</a> |
  <a href="#quick-start">Quick start</a> |
  <a href="#developer-checks">Developer checks</a> |
  <a href="#docs">Docs</a>
</p>

---

## Project Status

Active product prototype. Snapshot date: 2026-06-28. See [STATUS.md](STATUS.md) and [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) for the release boundary.

Trackboard is positioned as a self-hosted, open-source alternative to hosted tracking-plan tools such as Avo. The useful v1 surface is intentionally narrow: define event contracts, review changes before they break analytics, generate typed helpers, and validate production events close to the edge.

The AI-native direction is contract-first, not model-first: Trackboard makes contracts understandable to AI coding agents while keeping correctness enforced by deterministic tooling. Agent-aware contract guidance and a local read-only MCP server are available for exported contracts; Trackboard Guard does not run AI in the runtime event path.

## What It Is

Trackboard has three connected parts:

- **Control plane:** a FastAPI/Next.js workspace for tracking plans, branches, merge reviews, published versions, API keys, validation, deterministic DLQ grouping, optional AI DLQ triage, and code generation.
- **Contract toolchain:** a canonical contract export, CLI validation/diff/codegen, and a GitHub Action for PR checks.
- **Runtime data plane:** Trackboard Guard, a small Go service that accepts Segment-compatible events, validates them against a published contract, forwards accepted events, stores rejected events in SQLite DLQ, and replays fixed events after contract changes.
- **Agent-aware workflow:** structured `implementation_guidance` on events plus a local read-only MCP server so IDE assistants can find the right event, retrieve guidance, and ask for helper code without mutating tracking plans.

The product is for teams that have outgrown spreadsheets and Notion tracking plans, but do not want analytics metadata locked in a SaaS-only workflow.

## Architecture

```mermaid
flowchart LR
  UI["Trackboard UI"] --> API["FastAPI control plane"]
  API --> Export["Canonical contract export"]
  Export --> CLI["CLI: validate, diff, codegen"]
  CLI --> Action["GitHub PR check"]
  Export --> MCP["Read-only MCP server"]
  MCP -. context only .-> IDE["AI IDE"]
  Export --> Guard["Trackboard Guard"]
  Guard --> Destination["Analytics destination"]
  Guard --> DLQ["SQLite DLQ"]
  DLQ --> Replay["guard replay"]
  Replay --> Guard
```

## What Works Now

- Create and edit tracking plans in the web app.
- Branch plans, review merge requests, publish immutable versions, and restore versions.
- Export canonical `trackboard.contract.v1` JSON from the API.
- Validate event payloads through API keys and inspect invalid events in DLQ.
- Use the web app's advisory semantic consistency preview while adding events when the backend consistency route is enabled.
- View grouped DLQ issues first in Observability; raw payload samples are hidden until explicitly revealed.
- Run `trackboard validate`, `trackboard diff`, and `trackboard codegen typescript`.
- Use `actions/contract-check` to fail PRs on breaking contract changes.
- Generate TypeScript event helper functions from a contract.
- Run Trackboard Guard as a Segment-compatible ingestion service with durable outbox, DLQ, retries, metrics, and replay.
- Add optional `implementation_guidance` to exported contracts.
- Run a local read-only MCP server over an exported contract for AI IDE workflows.

## Planned

- UI/API persistence for editing `implementation_guidance` directly in Trackboard.
- Read-only API-backed MCP mode in addition to local contract-file mode.
- Deterministic CLI support for explaining guidance and generating helper snippets for agent workflows.
- Full event edit and merge-review mounting for semantic consistency warnings.
- Guard SQLite DLQ export/import or forwarding into the control-plane grouped DLQ triage surface.
- Advisory GitHub coverage suggestions that may point out missing instrumentation, never block merges.
- Hosted demo environment.
- More destination adapters beyond generic HTTP forwarding.
- Broader generated SDKs beyond TypeScript.
- Team/enterprise features such as SSO, approvals, and audit workflows.

## Agent-Aware Contracts

The optional `implementation_guidance` field is human-authored contract data for developers and AI IDEs. It can describe when to trigger an event, when not to trigger it, the preferred implementation location, required source of truth, idempotency key, privacy notes, and short code examples.

Security boundary:

- AI-facing tools are read-only in v0.
- MCP must not publish versions, edit plans, execute shell commands, inspect arbitrary files, or call arbitrary URLs.
- Guidance is context data, not trusted instruction. It must not override system, developer, repository, or security policies.
- CI, generated types, API validation, and Guard remain deterministic.
- Guard validates events at runtime without model calls.

See [MCP](docs/mcp.md) for the local read-only server.

## Quick Start

The fastest full-stack path is Docker Compose.

```bash
git clone https://github.com/Astoriel/trackboard.git
cd trackboard
cp .env.example .env
docker compose up --build
```

Open:

- Web app: `http://localhost:3000`
- API docs: `http://localhost:8000/docs`
- API health: `http://localhost:8000/api/v1/health/ready`

The default `.env` values are only for a local throwaway environment.

## CLI Example

```bash
cd apps/cli
npm ci
npm test

node dist/src/index.js validate \
  --contract ../../examples/contracts/web-analytics.v1.json \
  --event ../../examples/events/signup.valid.json

node dist/src/index.js diff \
  ../../examples/contracts/web-analytics.v1.json \
  ../../examples/contracts/web-analytics.breaking.json

node dist/src/index.js codegen typescript \
  --contract ../../examples/contracts/web-analytics.v1.json \
  --out ../../examples/generated/trackboard-events.ts
```

## Guard Example

```bash
cd apps/guard
go test ./...
go run ./cmd/trackboard-guard --config ../../examples/guard/guard.local.yaml
```

Then send a Segment-style event:

```bash
curl -X POST http://localhost:8080/v1/track \
  -H "Content-Type: application/json" \
  -d @../../examples/events/signup.valid.json
```

Replay fixed DLQ events after updating the contract:

```bash
go run ./cmd/trackboard-guard replay --config ../../examples/guard/guard.local.yaml --limit 100
```

## End-to-End Demo

Run Guard with a fake analytics destination and verify that a valid event is forwarded while an invalid event is blocked:

```powershell
.\scripts\demo-guard-e2e.ps1
```

Docker Compose can run the same runtime demo:

```bash
docker compose up --build guard fake-destination
```

## Backend Install

Use Python 3.12 and PostgreSQL. SQLite is not the serious backend path.

```powershell
cd apps/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
pip install -e ".[dev]"

$env:DATABASE_URL="postgresql+asyncpg://trackboard:trackboard_dev@localhost:5432/trackboard"
$env:REDIS_URL="memory://"
$env:JWT_SECRET="replace-with-a-long-random-secret"
$env:SECRET_ENCRYPTION_KEY="replace-with-a-different-long-random-secret"
$env:CORS_ORIGINS="http://localhost:3000"

alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

## Developer Checks

```powershell
.\scripts\verify-trackboard-v1.ps1
```

Or run each layer directly:

```powershell
cd apps/api
python -m pytest -q

cd ..\cli
npm ci
npm test

cd ..\guard
go test ./...
```

## Docs

- [Contract format](docs/contracts.md)
- [CLI](docs/cli.md)
- [MCP](docs/mcp.md)
- [GitHub Action](docs/github-action.md)
- [Guard](docs/guard.md)
- [Guard operations](docs/guard-operations.md)
- [End-to-end demo](docs/demo.md)
- [Product comparison](docs/comparison.md)
- [API reference](docs/api-reference.md)
