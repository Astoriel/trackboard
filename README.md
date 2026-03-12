<p align="center">
  <img src="docs/assets/trackboard-logo.svg" width="560" alt="Trackboard" />
</p>

<p align="center">
  <strong>Open-source tracking plans that behave like code.</strong>
</p>

<p align="center">
  <a href="#what-it-is">What it is</a> |
  <a href="#screenshots">Screenshots</a> |
  <a href="#quick-start">Quick start</a> |
  <a href="#backend-install">Backend install</a> |
  <a href="#api">API</a>
</p>

---

## What it is

Trackboard is a self-hostable workspace for analytics contracts.

Use it to import a tracking plan, edit events and properties, review schema changes in branches, publish immutable versions, validate incoming events with API keys, and triage invalid payloads in a DLQ.

It is meant for teams that are tired of tracking plans living in spreadsheets, Notion pages, or half-forgotten SDK types.

The serious v1 surface is intentionally small:

- Import a plan from structured JSON.
- Edit main workspace events, local properties, and shared global properties.
- Create branches and merge requests with diff summaries.
- Publish main workspace versions with compatibility reports.
- Restore a published version back into draft, then publish again when ready.
- Validate single or batch event payloads through API keys.
- Inspect invalid payloads grouped by event, version, first seen, last seen, and count.
- Generate TypeScript types and JSON Schema from the latest plan.
- Configure an optional OpenAI-compatible provider for schema assist.

Not in the v1 release bar: warehouse codegen, webhook integrations, GitHub PR automation, and live streaming validation. Some old code may still exist in the repository, but the primary product path is the contract workflow above.

## Screenshots

| Source-of-truth editor | Merge review |
| --- | --- |
| ![Trackboard editor](docs/assets/readme/editor.png) | ![Trackboard merge review](docs/assets/readme/merge-review.png) |

| Published versions | DLQ triage |
| --- | --- |
| ![Trackboard versions](docs/assets/readme/versions.png) | ![Trackboard observability DLQ](docs/assets/readme/observability.png) |

| Workspace settings |
| --- |
| ![Trackboard settings](docs/assets/readme/settings.png) |

## Quick Start

The fastest path is Docker Compose.

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

For local development, replace the placeholder secrets in `.env` before doing anything public. The default values are only for a local throwaway environment.

## How To Use

1. Register a user and organization.
2. Create a tracking plan.
3. Import a JSON plan or add events manually.
4. Publish v1 from the main workspace.
5. Create an API key in Settings.
6. Validate production payloads with `/api/v1/validate` or `/api/v1/validate/batch`.
7. Open DLQ when payloads fail validation.
8. Use a branch when the schema change needs review before touching main.

Example import shape:

```json
{
  "global_properties": [
    {
      "name": "user_id",
      "type": "string",
      "required": true,
      "description": "Stable application user id"
    }
  ],
  "events": [
    {
      "event_name": "signup_completed",
      "description": "A user completes signup",
      "category": "activation",
      "global_properties": ["user_id"],
      "properties": [
        {
          "name": "signup_method",
          "type": "string",
          "required": true,
          "constraints": { "enum": ["email", "google", "github"] }
        }
      ]
    }
  ]
}
```

## Backend Install

Use Python 3.12 and PostgreSQL. SQLite is not the serious v1 path.

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

Useful backend checks:

```powershell
python -m pytest
python -m bandit -r app -q
python -m pip_audit . -f json
```

## Frontend Install

```powershell
cd apps/web
npm install
$env:NEXT_PUBLIC_API_URL="http://localhost:8000"
npm run dev
```

Useful frontend checks:

```powershell
npx tsc --noEmit
npm run lint
npm run build
node scripts/stress-frontend-coverage.mjs
```

The stress script drives the UI through register, plan creation, import, branch, merge request, publish, validation, DLQ, settings, AI provider settings, and code generation. It also compares visited frontend calls against the backend OpenAPI routes.

## API

Base path: `/api/v1`

Important routes:

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`
- `GET /plans`, `POST /plans`, `GET /plans/{plan_id}`
- `POST /plans/{plan_id}/import`
- `POST /plans/{plan_id}/branch`
- `GET /plans/{plan_id}/merge-requests`
- `POST /merge-requests/{mr_id}/merge`
- `POST /plans/{plan_id}/publish`
- `GET /plans/{plan_id}/versions`
- `POST /versions/{version_id}/restore`
- `POST /plans/{plan_id}/keys`
- `POST /keys/{key_id}/rotate`
- `DELETE /keys/{key_id}`
- `POST /validate`
- `POST /validate/batch`
- `GET /plans/{plan_id}/dlq`
- `GET /health/live`, `GET /health/ready`, `GET /health/version`

Validation example:

```bash
curl -X POST http://localhost:8000/api/v1/validate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: tb_live_xxx" \
  -d '{
    "event": "signup_completed",
    "mode": "block",
    "source": "web",
    "properties": {
      "user_id": "usr_123",
      "signup_method": "google"
    }
  }'
```

Every validation response follows the same shape:

```json
{
  "valid": true,
  "mode": "block",
  "version_id": "00000000-0000-0000-0000-000000000000",
  "event": "signup_completed",
  "violations": [],
  "validated_at": "2026-04-14T12:00:00Z"
}
```

## Environment

Minimum backend variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Use `postgresql+asyncpg://...` locally. Plain `postgresql://...` is normalized by the app. |
| `JWT_SECRET` | Signs access and refresh tokens. Use a long random value. |
| `SECRET_ENCRYPTION_KEY` | Encrypts stored provider secrets, such as optional AI keys. Use a different long random value. |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins. |
| `REDIS_URL` | Redis URL. `memory://` is acceptable for local/dev only. |
| `ENVIRONMENT` | Use `production` in real deployments. Production rejects debug mode and weak secrets. |
| `ALLOW_PRIVATE_AI_ENDPOINTS` | Keep `false` unless you intentionally allow localhost/private AI endpoints in a trusted dev setup. |

## Deploy Notes

Backend on Render:

- Root directory: `apps/api`
- Build command: `pip install -e .`
- Start command: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/api/v1/health/ready`
- Required env: `DATABASE_URL`, `JWT_SECRET`, `SECRET_ENCRYPTION_KEY`, `ENVIRONMENT=production`, `DEBUG=false`, `CORS_ORIGINS=<your frontend url>`

Frontend on Vercel:

- Root directory: `apps/web`
- Env: `NEXT_PUBLIC_API_URL=<your backend url>`
- Build command: `npm run build`

For Neon, use the normal database host for migrations and the pooler host for high-concurrency app traffic if you need it. Do not commit database URLs.

## Repo Layout

```text
trackboard/
  apps/
    api/   FastAPI, SQLAlchemy 2, Alembic, Pydantic v2
    web/   Next.js App Router, TypeScript, Tailwind
  docs/
    assets/
    serious-v1-implementation-plan.md
  docker-compose.yml
  render.yaml
```

## Security Posture

Trackboard is not magic security dust. Treat it like an internal schema control plane:

- Keep JWT and encryption secrets out of git.
- Rotate API keys when they are exposed.
- Run Alembic migrations before serving traffic.
- Pin CORS to your real frontend domains.
- Keep private AI endpoints disabled in production.
- Put the API behind HTTPS.
- Back up Postgres.

## License

MIT. See `LICENSE` if present in your checkout.
