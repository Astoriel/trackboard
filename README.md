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

Active product prototype. Snapshot date: 2026-06-27. See [STATUS.md](STATUS.md) and [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) for the release boundary.

Trackboard is positioned as a self-hosted, open-source alternative to hosted tracking-plan tools such as Avo. The useful v1 surface is intentionally narrow: define event contracts, review changes before they break analytics, generate typed helpers, and validate production events close to the edge.

## What It Is

Trackboard has three connected parts:

- **Control plane:** a FastAPI/Next.js workspace for tracking plans, branches, merge reviews, published versions, API keys, validation, DLQ triage, and code generation.
- **Contract toolchain:** a canonical contract export, CLI validation/diff/codegen, and a GitHub Action for PR checks.
- **Runtime data plane:** Trackboard Guard, a small Go service that accepts Segment-compatible events, validates them against a published contract, forwards accepted events, stores rejected events in SQLite DLQ, and replays fixed events after contract changes.

The product is for teams that have outgrown spreadsheets and Notion tracking plans, but do not want analytics metadata locked in a SaaS-only workflow.

## Architecture

```mermaid
flowchart LR
  UI["Trackboard UI"] --> API["FastAPI control plane"]
  API --> Export["Canonical contract export"]
  Export --> CLI["CLI: validate, diff, codegen"]
  CLI --> Action["GitHub PR check"]
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
- Run `trackboard validate`, `trackboard diff`, and `trackboard codegen typescript`.
- Use `actions/contract-check` to fail PRs on breaking contract changes.
- Generate TypeScript event helper functions from a contract.
- Run Trackboard Guard as a Segment-compatible ingestion service with durable outbox, DLQ, retries, metrics, and replay.

## Planned

- Hosted demo environment.
- More destination adapters beyond generic HTTP forwarding.
- Broader generated SDKs beyond TypeScript.
- Team/enterprise features such as SSO, approvals, and audit workflows.

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
- [GitHub Action](docs/github-action.md)
- [Guard](docs/guard.md)
- [Guard operations](docs/guard-operations.md)
- [Product comparison](docs/comparison.md)
- [API reference](docs/api-reference.md)
