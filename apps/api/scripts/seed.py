#!/usr/bin/env python
"""
Demo seed script for Trackboard.

Populates the database with a realistic demo workspace so you can
explore the UI immediately after setup without manual data entry.

Usage:
    cd apps/api
    python -m scripts.seed
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# ── Import models so metadata is populated ──
from app.config import settings
from app.core.security import hash_password
from app.models import (
    ApiKey,
    EventSchema,
    EventStatus,
    OrgMember,
    Organization,
    Property,
    PropertyType,
    TrackingPlan,
    User,
    Version,
)

# ─────────────────────────────────────────────────────────────────────────────
# Demo data
# ─────────────────────────────────────────────────────────────────────────────

DEMO_EMAIL = "demo@trackboard.dev"
DEMO_PASSWORD = "trackboard123"
ORG_NAME = "Trackboard Demo"
PLAN_NAME = "Main Product Analytics"

EVENTS = [
    {
        "event_name": "signup_completed",
        "description": "User finished the registration flow",
        "category": "onboarding",
        "properties": [
            {"name": "user_id", "type": "string", "required": True, "description": "Unique user identifier"},
            {
                "name": "signup_method",
                "type": "string",
                "required": True,
                "constraints": {"enum_values": ["google", "github", "email", "apple"]},
            },
            {"name": "plan_selected", "type": "string", "required": False,
             "constraints": {"enum_values": ["free", "pro", "enterprise"]}},
            {"name": "referral_code", "type": "string", "required": False},
        ],
    },
    {
        "event_name": "login",
        "description": "User authenticated successfully",
        "category": "auth",
        "properties": [
            {"name": "user_id", "type": "string", "required": True},
            {"name": "method", "type": "string", "required": True,
             "constraints": {"enum_values": ["password", "oauth", "magic_link", "sso"]}},
            {"name": "device_type", "type": "string", "required": False,
             "constraints": {"enum_values": ["desktop", "mobile", "tablet"]}},
        ],
    },
    {
        "event_name": "plan_created",
        "description": "User created a new tracking plan",
        "category": "core",
        "properties": [
            {"name": "user_id", "type": "string", "required": True},
            {"name": "plan_id", "type": "string", "required": True},
            {"name": "plan_name", "type": "string", "required": True},
            {"name": "template_used", "type": "string", "required": False},
        ],
    },
    {
        "event_name": "event_schema_added",
        "description": "User added a new event schema to a plan",
        "category": "core",
        "properties": [
            {"name": "user_id", "type": "string", "required": True},
            {"name": "plan_id", "type": "string", "required": True},
            {"name": "event_name", "type": "string", "required": True},
            {"name": "properties_count", "type": "integer", "required": False},
        ],
    },
    {
        "event_name": "plan_published",
        "description": "User published a new version of a tracking plan",
        "category": "core",
        "properties": [
            {"name": "user_id", "type": "string", "required": True},
            {"name": "plan_id", "type": "string", "required": True},
            {"name": "version_number", "type": "integer", "required": True},
            {"name": "events_count", "type": "integer", "required": True},
            {"name": "change_summary", "type": "string", "required": False},
        ],
    },
    {
        "event_name": "code_generated",
        "description": "User generated code from a tracking plan",
        "category": "features",
        "properties": [
            {"name": "user_id", "type": "string", "required": True},
            {"name": "plan_id", "type": "string", "required": True},
            {"name": "language", "type": "string", "required": True,
             "constraints": {"enum_values": ["typescript", "python", "json_schema", "dbt"]}},
        ],
    },
    {
        "event_name": "api_key_created",
        "description": "User created a new API key for validation",
        "category": "settings",
        "properties": [
            {"name": "user_id", "type": "string", "required": True},
            {"name": "plan_id", "type": "string", "required": True},
            {"name": "label", "type": "string", "required": True},
        ],
    },
    {
        "event_name": "event_validated",
        "description": "An event was validated via the API",
        "category": "validation",
        "properties": [
            {"name": "plan_id", "type": "string", "required": True},
            {"name": "event_name", "type": "string", "required": True},
            {"name": "is_valid", "type": "boolean", "required": True},
            {"name": "error_count", "type": "integer", "required": False},
            {"name": "source", "type": "string", "required": False},
        ],
    },
]


async def seed(db: AsyncSession) -> None:
    # 1. Create user
    user = User(
        email=DEMO_EMAIL,
        name="Demo User",
        hashed_password=hash_password(DEMO_PASSWORD),
        is_active=True,
    )
    db.add(user)
    await db.flush()

    # 2. Create org
    org = Organization(name=ORG_NAME, slug="trackboard-demo", owner_id=user.id)
    db.add(org)
    await db.flush()

    # 3. Org membership
    member = OrgMember(org_id=org.id, user_id=user.id, role="owner")
    db.add(member)
    await db.flush()

    # 4. Create tracking plan
    plan = TrackingPlan(
        org_id=org.id,
        name=PLAN_NAME,
        description="Full analytics schema for the Trackboard SaaS product itself",
        current_version=2,
    )
    db.add(plan)
    await db.flush()

    # 5. Add events + properties
    for event_data in EVENTS:
        event = EventSchema(
            plan_id=plan.id,
            event_name=event_data["event_name"],
            description=event_data.get("description"),
            category=event_data.get("category"),
            status=EventStatus.active,
        )
        db.add(event)
        await db.flush()

        for i, prop_data in enumerate(event_data.get("properties", [])):
            prop = Property(
                event_id=event.id,
                name=prop_data["name"],
                description=prop_data.get("description"),
                type=PropertyType(prop_data["type"]),
                required=prop_data.get("required", False),
                constraints=prop_data.get("constraints", {}),
                sort_order=i,
            )
            db.add(prop)

    await db.flush()

    # 6. Create a demo API key (raw key shown in console)
    import secrets
    raw_key = "tb_live_" + secrets.token_urlsafe(32)
    api_key = ApiKey(
        plan_id=plan.id,
        created_by=user.id,
        key_hash=hash_password(raw_key),
        key_prefix=raw_key[:12],
        label="Demo Key",
    )
    db.add(api_key)
    await db.flush()

    await db.commit()

    print("\n✅ Trackboard demo data seeded!")
    print(f"\n  📧 Email:    {DEMO_EMAIL}")
    print(f"  🔑 Password: {DEMO_PASSWORD}")
    print(f"  🗝  API Key:  {raw_key}")
    print(f"\n  → Open http://localhost:8000/docs to try the API")
    print(f"  → Open http://localhost:3000 to use the UI\n")


async def main() -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as db:
        # Check if demo user already exists
        result = await db.execute(text(f"SELECT id FROM users WHERE email = '{DEMO_EMAIL}' LIMIT 1"))
        if result.scalar_one_or_none():
            print(f"⚠️  Demo user {DEMO_EMAIL} already exists. Skipping seed.")
            return
        await seed(db)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
