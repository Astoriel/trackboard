.PHONY: dev down api-dev web-install web-dev migrate makemigrations seed test lint format

# ── Full stack ──
dev:
	docker compose up --build

down:
	docker compose down

# ── API (local) ──
api-dev:
	cd apps/api && uvicorn app.main:app --reload --port 8000

# ── Database ──
migrate:
	cd apps/api && alembic upgrade head

makemigrations:
	cd apps/api && alembic revision --autogenerate -m "$(msg)"

seed:
	cd apps/api && python -m scripts.seed

# ── Tests ──
test:
	cd apps/api && python -m pytest -v

# ── Lint / Format ──
lint:
	cd apps/api && ruff check . && ruff format --check .

format:
	cd apps/api && ruff check --fix . && ruff format .

# ── Web ──
web-install:
	cd apps/web && npm install

web-dev:
	cd apps/web && npm run dev
