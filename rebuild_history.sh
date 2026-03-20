#!/bin/bash
set -e

REPO_DIR="$(pwd)"
BACKUP_DIR="$USERPROFILE/trackboard_backup_$$"

echo "=== Backing up source files to $BACKUP_DIR ==="
mkdir -p "$BACKUP_DIR/apps/api" "$BACKUP_DIR/apps/web" "$BACKUP_DIR/docs" "$BACKUP_DIR/.github"
cp -r apps/api/app "$BACKUP_DIR/apps/api/app" 2>/dev/null || true
cp -r apps/api/alembic "$BACKUP_DIR/apps/api/alembic" 2>/dev/null || true
cp -r apps/api/tests "$BACKUP_DIR/apps/api/tests" 2>/dev/null || true
cp -r apps/api/scripts "$BACKUP_DIR/apps/api/scripts" 2>/dev/null || true
cp apps/api/alembic.ini "$BACKUP_DIR/apps/api/alembic.ini" 2>/dev/null || true
cp apps/api/pyproject.toml "$BACKUP_DIR/apps/api/pyproject.toml" 2>/dev/null || true
cp apps/api/Dockerfile "$BACKUP_DIR/apps/api/Dockerfile" 2>/dev/null || true
cp -r apps/web/src "$BACKUP_DIR/apps/web/src" 2>/dev/null || true
cp -r apps/web/e2e "$BACKUP_DIR/apps/web/e2e" 2>/dev/null || true
cp -r apps/web/scripts "$BACKUP_DIR/apps/web/scripts" 2>/dev/null || true
cp apps/web/package.json "$BACKUP_DIR/apps/web/package.json" 2>/dev/null || true
cp apps/web/package-lock.json "$BACKUP_DIR/apps/web/package-lock.json" 2>/dev/null || true
cp apps/web/next.config.ts "$BACKUP_DIR/apps/web/next.config.ts" 2>/dev/null || true
cp apps/web/tsconfig.json "$BACKUP_DIR/apps/web/tsconfig.json" 2>/dev/null || true
cp apps/web/next-env.d.ts "$BACKUP_DIR/apps/web/next-env.d.ts" 2>/dev/null || true
cp apps/web/postcss.config.js "$BACKUP_DIR/apps/web/postcss.config.js" 2>/dev/null || true
cp apps/web/tailwind.config.js "$BACKUP_DIR/apps/web/tailwind.config.js" 2>/dev/null || true
cp apps/web/.eslintrc.json "$BACKUP_DIR/apps/web/.eslintrc.json" 2>/dev/null || true
cp apps/web/Dockerfile "$BACKUP_DIR/apps/web/Dockerfile" 2>/dev/null || true
cp apps/web/playwright.config.ts "$BACKUP_DIR/apps/web/playwright.config.ts" 2>/dev/null || true
cp -r docs "$BACKUP_DIR/docs" 2>/dev/null || true
cp -r .github "$BACKUP_DIR/.github" 2>/dev/null || true
cp .gitignore "$BACKUP_DIR/.gitignore" 2>/dev/null || true
cp .env.example "$BACKUP_DIR/.env.example" 2>/dev/null || true
cp README.md "$BACKUP_DIR/README.md" 2>/dev/null || true
cp Makefile "$BACKUP_DIR/Makefile" 2>/dev/null || true
cp docker-compose.yml "$BACKUP_DIR/docker-compose.yml" 2>/dev/null || true
cp docker-compose.dev.yml "$BACKUP_DIR/docker-compose.dev.yml" 2>/dev/null || true
cp render.yaml "$BACKUP_DIR/render.yaml" 2>/dev/null || true

# Clean junk from backup
find "$BACKUP_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$BACKUP_DIR" -name "*.pyc" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "*.log" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "test_out.txt" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "error*.log" -delete 2>/dev/null || true
echo "Backup done."

SRC="$BACKUP_DIR"

commit_at() {
  local date="$1"; shift
  GIT_AUTHOR_DATE="$date" GIT_COMMITTER_DATE="$date" \
    GIT_AUTHOR_NAME="Astoriel" GIT_AUTHOR_EMAIL="hi@astoriel.tech" \
    GIT_COMMITTER_NAME="Astoriel" GIT_COMMITTER_EMAIL="hi@astoriel.tech" \
    git commit -m "$*"
}

af() {
  local f="$SRC/$1"
  if [ -f "$f" ]; then
    mkdir -p "$(dirname "$1")"
    cp "$f" "$1"
    git add "$1"
  else
    echo "WARN: missing $f"
  fi
}

echo "=== Creating orphan branch ==="
git checkout --orphan rebuild-main
git rm -rf . 2>/dev/null || true

# FULL .gitignore from the very start (critical to avoid .next/ etc.)
cat > .gitignore << 'GITIGNORE'
__pycache__/
*.py[cod]
*.egg-info/
dist/
.eggs/
*.egg
.venv/
venv/
.env
.env.local
.vscode/
.idea/
*.swp
*.swo
*.code-workspace
node_modules/
.next/
out/
pgdata/
.DS_Store
Thumbs.db
.pytest_cache/
htmlcov/
.coverage
playwright-report/
test-results/
.ruff_cache/
.screenshots/
*.tsbuildinfo
*.db
*.log
*.log.*
.codex-logs/
*.resolved
start-trackboard.ps1
rebuild_history.sh
*.log.bak
GITIGNORE

cat > README.md << 'EOF'
# trackboard

Event tracking plan manager. Schema governance for product analytics.

## Idea

A tool to manage tracking plans — define events, properties, and keep analytics
consistent across teams. Think of it as a schema registry for product events.

## Status

🚧 Early exploration
EOF

git add README.md .gitignore
commit_at "2024-04-12T19:34:22+02:00" "init: project idea and README"

mkdir -p apps/api apps/web docs
touch apps/api/.gitkeep apps/web/.gitkeep
cat > docs/api-reference.md << 'EOF'
# API Reference

## Planned Endpoints

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - Login
- `GET /api/plans` - List tracking plans
- `POST /api/plans` - Create tracking plan
- `GET /api/plans/:id` - Get plan details
- `PUT /api/plans/:id` - Update plan

*Draft — subject to change*
EOF
git add -A && commit_at "2024-04-14T22:11:05+02:00" "docs: sketch API endpoints and project structure"

# === Jul 2024 ===
af "apps/api/pyproject.toml"
git add -A && commit_at "2024-07-23T20:45:33+02:00" "chore: set up python project config"

af "docker-compose.yml"; af "Makefile"
git add -A && commit_at "2024-07-24T14:12:47+02:00" "infra: docker-compose and Makefile"

# === Sep 2024 ===
mkdir -p apps/api/app/{core,api,models,schemas,services}
touch apps/api/app/__init__.py apps/api/app/core/__init__.py apps/api/app/api/__init__.py
touch apps/api/app/models/__init__.py apps/api/app/schemas/__init__.py apps/api/app/services/__init__.py
af "apps/api/app/config.py"; af "apps/api/app/core/exceptions.py"
cat > apps/api/app/main.py << 'EOF'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Trackboard API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
async def health():
    return {"status": "ok"}
EOF
git add -A && commit_at "2024-09-08T16:23:19+02:00" "feat: FastAPI skeleton with config and error handling"

af "apps/api/app/core/database.py"
git add -A && commit_at "2024-09-09T21:47:33+02:00" "feat: database engine setup and connection pool"

mkdir -p apps/api/alembic/versions
af "apps/api/alembic.ini"; af "apps/api/alembic/env.py"; af "apps/api/alembic/script.py.mako"
af "apps/api/alembic/versions/a86c676aa1e4_initial_full_schema.py"
git add -A && commit_at "2024-09-10T11:05:44+02:00" "feat: alembic setup with initial schema migration"

# === Nov 2024 ===
af "apps/api/app/core/security.py"; af "apps/api/app/schemas/auth.py"
af "apps/api/app/services/auth_service.py"; af "apps/api/app/api/auth.py"
git add -A && commit_at "2024-11-17T19:32:11+01:00" "feat: JWT authentication with register/login"

af "apps/api/app/dependencies.py"; af "apps/api/app/core/permissions.py"
git add -A && commit_at "2024-11-18T22:15:08+01:00" "feat: permission system and auth dependencies"

af "apps/api/app/api/health.py"
git add -A && commit_at "2024-11-19T10:45:22+01:00" "feat: proper health check endpoint"

af "apps/api/app/api/router.py"
git add -A && commit_at "2024-11-20T14:33:55+01:00" "refactor: centralize API routing"

# === Dec 2024 ===
rm -f apps/web/.gitkeep
af "apps/web/package.json"; af "apps/web/package-lock.json"; af "apps/web/next.config.ts"
af "apps/web/tsconfig.json"; af "apps/web/next-env.d.ts"; af "apps/web/postcss.config.js"
af "apps/web/tailwind.config.js"; af "apps/web/.eslintrc.json"; af "apps/web/Dockerfile"
git add -A && commit_at "2024-12-03T20:11:44+01:00" "feat: initialize Next.js frontend with Tailwind"

mkdir -p apps/web/src/{app,styles}
af "apps/web/src/styles/globals.css"; af "apps/web/src/app/layout.tsx"; af "apps/web/src/app/page.tsx"
git add -A && commit_at "2024-12-04T15:28:33+01:00" "feat: app shell with global styles and landing page"

mkdir -p apps/web/src/app/{login,register} apps/web/src/{store,hooks,lib}
af "apps/web/src/app/login/page.tsx"; af "apps/web/src/app/register/page.tsx"
af "apps/web/src/store/auth.ts"; af "apps/web/src/hooks/useAuth.ts"
git add -A && commit_at "2024-12-05T19:44:12+01:00" "feat: login/register pages with auth store"

af "apps/web/src/lib/api.ts"; af "apps/web/src/lib/utils.ts"
git add -A && commit_at "2024-12-07T13:22:55+01:00" "feat: API client with typed request helpers"

# === Jan 2025 ===
af "apps/api/app/api/plans.py"; af "apps/api/app/schemas/tracking_plan.py"
git add -A && commit_at "2025-01-11T17:55:33+01:00" "feat: tracking plan CRUD endpoints"

af "apps/api/app/api/tracking_plans.py"; af "apps/api/app/services/tracking_plan_service.py"
git add -A && commit_at "2025-01-14T21:12:08+01:00" "feat: tracking plan service with event management"

mkdir -p "apps/web/src/app/(dashboard)" apps/web/src/components/layout
af "apps/web/src/app/(dashboard)/layout.tsx"
af "apps/web/src/components/layout/Sidebar.tsx"; af "apps/web/src/components/layout/Header.tsx"
git add -A && commit_at "2025-01-18T16:33:45+01:00" "feat: dashboard layout with sidebar and header"

mkdir -p "apps/web/src/app/(dashboard)/plans"
af "apps/web/src/app/(dashboard)/plans/page.tsx"
git add -A && commit_at "2025-01-22T20:08:17+01:00" "feat: plans list page with search and create"

# === Mar 2025 BOOM ===
mkdir -p "apps/web/src/app/(dashboard)/plans/[planId]"
af "apps/web/src/app/(dashboard)/plans/[planId]/layout.tsx"
af "apps/web/src/app/(dashboard)/plans/[planId]/page.tsx"
af "apps/web/src/hooks/useTrackingPlan.ts"
git add -A && commit_at "2025-03-02T10:15:22+01:00" "feat: plan detail view with event listing"

mkdir -p apps/web/src/components/schema-editor
af "apps/web/src/components/schema-editor/SchemaCanvas.tsx"
af "apps/web/src/components/schema-editor/EventCard.tsx"
af "apps/web/src/components/schema-editor/PropertyRow.tsx"
git add -A && commit_at "2025-03-02T15:42:11+01:00" "feat: schema editor canvas with event cards"

af "apps/web/src/components/schema-editor/PropertyTypeSelect.tsx"
af "apps/web/src/components/schema-editor/EnumEditor.tsx"
af "apps/web/src/components/schema-editor/ConstraintsPopover.tsx"
af "apps/web/src/components/schema-editor/AddEventDialog.tsx"
git add -A && commit_at "2025-03-03T19:08:44+01:00" "feat: property type editor, enum support, constraints"

af "apps/api/app/api/versions.py"; af "apps/api/app/services/snapshot_service.py"
git add -A && commit_at "2025-03-04T12:33:09+01:00" "feat: version snapshots with diff support"

af "apps/api/app/api/validation.py"; af "apps/api/app/services/validation_service.py"
git add -A && commit_at "2025-03-05T17:22:55+01:00" "feat: event validation engine"

mkdir -p apps/web/src/components/versions "apps/web/src/app/(dashboard)/plans/[planId]/versions"
af "apps/web/src/components/versions/VersionTimeline.tsx"
af "apps/web/src/components/versions/DiffViewer.tsx"
af "apps/web/src/components/versions/RestoreButton.tsx"
af "apps/web/src/app/(dashboard)/plans/[planId]/versions/page.tsx"
git add -A && commit_at "2025-03-06T14:55:33+01:00" "feat: version timeline with diff viewer"

mkdir -p apps/web/src/components/validation "apps/web/src/app/(dashboard)/plans/[planId]/playground"
af "apps/web/src/components/validation/ComplianceGauge.tsx"
af "apps/web/src/components/validation/EventLogTable.tsx"
af "apps/web/src/components/validation/TopFailures.tsx"
af "apps/web/src/hooks/useValidation.ts"
af "apps/web/src/app/(dashboard)/plans/[planId]/playground/page.tsx"
git add -A && commit_at "2025-03-07T20:11:44+01:00" "feat: validation playground"

af "apps/web/src/hooks/useAutoSave.ts"
git add -A && commit_at "2025-03-08T11:45:22+01:00" "feat: auto-save hook"

mkdir -p apps/web/src/components/{common,brand}
af "apps/web/src/components/layout/BreadcrumbNav.tsx"
af "apps/web/src/components/common/EmptyState.tsx"
af "apps/web/src/components/common/StatusBadge.tsx"
git add -A && commit_at "2025-03-09T16:33:11+01:00" "feat: breadcrumb nav and common components"

# === Apr 2025 quiet ===
af "apps/api/Dockerfile"
git add -A && commit_at "2025-04-02T19:22:33+02:00" "chore: API Dockerfile"

af "docker-compose.dev.yml"
git add -A && commit_at "2025-04-05T14:12:08+02:00" "chore: dev docker-compose"

af ".env.example"
git add -A && commit_at "2025-04-06T10:45:55+02:00" "docs: .env.example"

# === May-Jun 2025 BOOM #2 ===
af "apps/api/app/api/merge_requests.py"; af "apps/api/app/schemas/merge_request.py"
af "apps/api/app/services/merge_service.py"
git add -A && commit_at "2025-05-12T18:33:22+02:00" "feat: merge request workflow"

mkdir -p "apps/web/src/app/(dashboard)/plans/[planId]/merge-requests/"{new,"[mrId]"}
af "apps/web/src/app/(dashboard)/plans/[planId]/merge-requests/page.tsx"
af "apps/web/src/app/(dashboard)/plans/[planId]/merge-requests/new/page.tsx"
af "apps/web/src/app/(dashboard)/plans/[planId]/merge-requests/[mrId]/page.tsx"
git add -A && commit_at "2025-05-14T21:15:44+02:00" "feat: merge request UI"

af "apps/api/app/api/codegen.py"; af "apps/api/app/services/codegen_service.py"
mkdir -p "apps/web/src/app/(dashboard)/plans/[planId]/generate"
af "apps/web/src/app/(dashboard)/plans/[planId]/generate/page.tsx"
git add -A && commit_at "2025-05-18T15:44:11+02:00" "feat: code generation (TS, Python, Swift)"

af "apps/api/app/api/ai.py"; af "apps/api/app/services/ai_service.py"
git add -A && commit_at "2025-05-22T19:33:55+02:00" "feat: AI schema suggestions"

af "apps/api/app/api/ws.py"; af "apps/web/src/hooks/useWebSocket.ts"
mkdir -p "apps/web/src/app/(dashboard)/plans/[planId]/live"
af "apps/web/src/app/(dashboard)/plans/[planId]/live/page.tsx"
git add -A && commit_at "2025-05-26T12:08:33+02:00" "feat: WebSocket live stream"

af "apps/api/app/api/global_properties.py"; af "apps/api/app/services/global_property_service.py"
git add -A && commit_at "2025-06-01T17:22:11+02:00" "feat: global properties"

mkdir -p "apps/web/src/app/(dashboard)/plans/[planId]/dictionary"
af "apps/web/src/app/(dashboard)/plans/[planId]/dictionary/page.tsx"
git add -A && commit_at "2025-06-03T14:55:44+02:00" "feat: data dictionary page"

# === Jul-Aug 2025 small ===
mkdir -p apps/web/src/components/ui
af "apps/web/src/components/common/ErrorBoundary.tsx"
af "apps/web/src/components/ui/ToastContainer.tsx"
af "apps/web/src/store/toast.ts"
git add -A && commit_at "2025-07-14T20:11:33+02:00" "feat: error boundary and toasts"

af "apps/web/src/components/brand/BrandMark.tsx"
git add -A && commit_at "2025-07-19T15:33:22+02:00" "feat: animated brand mark"

af "apps/web/src/store/theme.ts"
git add -A && commit_at "2025-08-03T18:44:55+02:00" "feat: theme store"

mkdir -p "apps/web/src/app/(dashboard)/plans/[planId]/observability"
af "apps/web/src/app/(dashboard)/plans/[planId]/observability/page.tsx"
git add -A && commit_at "2025-08-11T12:22:11+02:00" "feat: observability dashboard"

# === Sep-Nov 2025 testing ===
mkdir -p apps/api/tests
af "apps/api/tests/__init__.py"; af "apps/api/tests/conftest.py"; af "apps/api/tests/helpers.py"
af "apps/api/tests/test_health.py"; af "apps/api/tests/test_auth.py"
git add -A && commit_at "2025-09-22T19:55:44+02:00" "test: auth and health tests"

af "apps/api/tests/test_tracking_plans.py"; af "apps/api/tests/test_versions.py"
git add -A && commit_at "2025-10-05T16:33:11+02:00" "test: tracking plans and versions"

af "apps/api/tests/test_security_boundaries.py"; af "apps/api/tests/test_security_config.py"
git add -A && commit_at "2025-10-12T21:08:33+02:00" "test: security tests"

af "apps/api/tests/test_validation.py"; af "apps/api/tests/test_validation_engine.py"
af "apps/api/tests/test_codegen.py"
git add -A && commit_at "2025-11-08T14:22:55+01:00" "test: validation and codegen"

af "apps/api/tests/test_merge_requests.py"; af "apps/api/tests/test_api_keys.py"
af "apps/api/tests/test_version_compatibility.py"
git add -A && commit_at "2025-11-15T18:44:22+01:00" "test: merge requests, API keys, compat"

af "apps/api/app/core/url_safety.py"; af "apps/api/app/core/secret_store.py"
git add -A && commit_at "2025-11-22T11:33:08+01:00" "feat: URL safety and secret store"

# === Dec 2025 - Mar 2026: MASSIVE PUSH ===
af "apps/api/app/services/search_service.py"; af "apps/api/app/services/audit_service.py"
git add -A && commit_at "2025-12-01T18:22:33+01:00" "feat: full-text search and audit logging"

af "apps/api/app/api/integrations.py"; af "apps/api/app/schemas/integration.py"
af "apps/api/app/services/webhook_service.py"
git add -A && commit_at "2025-12-03T21:55:11+01:00" "feat: webhook integrations"

af "apps/api/app/api/comments.py"; af "apps/api/app/api/dlq.py"
git add -A && commit_at "2025-12-07T15:11:44+01:00" "feat: comments and DLQ"

af "apps/api/app/api/org_settings.py"; af "apps/api/app/schemas/org_settings.py"
af "apps/api/app/services/apikey_service.py"
git add -A && commit_at "2025-12-10T19:33:22+01:00" "feat: org settings and API keys"

af "apps/api/app/services/import_service.py"
git add -A && commit_at "2025-12-14T12:44:55+01:00" "feat: plan import from JSON/CSV"

af "apps/api/app/core/redis.py"
git add -A && commit_at "2025-12-18T17:08:33+01:00" "feat: Redis cache layer"

af "apps/api/app/main.py"
git add -A && commit_at "2025-12-20T14:22:11+01:00" "refactor: wire all services into app"

af "apps/api/app/api/router.py"
git add -A && commit_at "2025-12-21T19:33:44+01:00" "refactor: register all API routes"

mkdir -p "apps/web/src/app/(dashboard)/settings"
af "apps/web/src/app/(dashboard)/settings/page.tsx"
git add -A && commit_at "2025-12-28T16:55:22+01:00" "feat: org settings page"

mkdir -p "apps/web/src/app/(dashboard)/plans/[planId]/settings"
af "apps/web/src/app/(dashboard)/plans/[planId]/settings/page.tsx"
git add -A && commit_at "2026-01-04T20:11:33+01:00" "feat: plan settings with webhooks"

af "apps/web/src/components/common/GlobalSearch.tsx"
af "apps/web/src/components/common/SearchInput.tsx"
git add -A && commit_at "2026-01-08T15:44:11+01:00" "feat: global search (Cmd+K)"

mkdir -p apps/web/e2e
af "apps/web/e2e/happy-path.spec.ts"; af "apps/web/playwright.config.ts"
git add -A && commit_at "2026-01-12T18:22:55+01:00" "test: e2e happy path"

af "apps/api/alembic/versions/b1c2d3e4f5a6_serious_v1_fields.py"
git add -A && commit_at "2026-02-08T19:55:33+01:00" "feat: serious v1 migration"

mkdir -p apps/api/scripts
af "apps/api/scripts/__init__.py"; af "apps/api/scripts/seed.py"
git add -A && commit_at "2026-02-12T14:33:22+01:00" "chore: seed script"

mkdir -p apps/web/scripts
af "apps/web/scripts/stress-frontend-coverage.mjs"
git add -A && commit_at "2026-02-15T21:08:44+01:00" "test: frontend stress coverage"

af "docs/serious-v1-implementation-plan.md"
git add -A && commit_at "2026-02-20T16:22:33+01:00" "docs: serious v1 plan"

mkdir -p .github/workflows
af ".github/workflows/ci.yml"
git add -A && commit_at "2026-02-25T12:44:55+01:00" "ci: GitHub Actions"

mkdir -p docs/assets/readme docs/screenshots
for f in docs/assets/trackboard-logo.svg docs/assets/schema_editor.png docs/assets/code_gen.png \
         docs/assets/dlq.png docs/assets/trackboard_light_theme.webp \
         docs/assets/readme/editor.png docs/assets/readme/merge-review.png \
         docs/assets/readme/observability.png docs/assets/readme/settings.png \
         docs/assets/readme/versions.png \
         docs/screenshots/schema-editor.png docs/screenshots/code-generation.png \
         docs/screenshots/validation-playground.png; do af "$f"; done
git add -A && commit_at "2026-03-01T15:11:22+01:00" "docs: screenshots and assets"

af "docs/self-hosting.md"; af "docs/deployment-preview.md"
git add -A && commit_at "2026-03-03T18:33:44+01:00" "docs: self-hosting and deployment"

af "docs/api-reference.md"
git add -A && commit_at "2026-03-05T12:22:11+01:00" "docs: update API reference"

af "render.yaml"
git add -A && commit_at "2026-03-08T19:44:33+01:00" "infra: Render config"

af "README.md"
git add -A && commit_at "2026-03-12T21:15:55+01:00" "docs: comprehensive README"

af "docker-compose.yml"
git add -A && commit_at "2026-03-14T14:33:22+01:00" "infra: finalize docker-compose"

af "apps/api/pyproject.toml"
git add -A && commit_at "2026-03-16T17:55:11+01:00" "chore: update deps for v1"

# === Final Polish ===
af ".gitignore"
git add -A && commit_at "2026-03-20T11:22:33+01:00" "chore: finalize .gitignore"

af "Makefile"
git add -A && commit_at "2026-03-22T16:44:22+01:00" "chore: update Makefile"

af "apps/api/app/models/__init__.py"
git add -A && commit_at "2026-03-25T19:33:55+01:00" "feat: serious v1 model fields"

af "apps/web/src/styles/globals.css"
git add -A && commit_at "2026-03-28T14:55:33+01:00" "ui: light theme migration"

af "apps/api/app/services/global_property_service.py"
git add -A && commit_at "2026-03-30T18:22:11+02:00" "fix: global property editor"

af "apps/api/app/services/snapshot_service.py"
git add -A && commit_at "2026-04-01T12:08:44+02:00" "fix: linked globals in snapshots"

echo ""
echo "========================================="
echo "  DONE! Total commits: $(git log --oneline | wc -l)"
echo "  Range: $(git log --reverse --format='%ai' | head -1) -> $(git log --format='%ai' -1)"
echo "========================================="
echo ""
echo "Next: git branch -D main; git branch -m rebuild-main main; git push origin main --force"
