from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.models import Version
from app.services.contract_export_service import build_contract_payload
from tests.helpers import (
    auth_headers,
    create_event,
    create_plan,
    create_property,
    publish_plan,
    register_user,
)


def test_build_contract_payload_is_deterministic():
    plan_id = uuid4()
    version_id = uuid4()
    version = Version(
        id=version_id,
        plan_id=plan_id,
        version_number=1,
        created_by=uuid4(),
        change_summary="Initial",
        published_from_revision=3,
        snapshot={
            "name": "Web Analytics",
            "description": "Core events",
            "global_properties": [
                {
                    "name": "user_id",
                    "type": "string",
                    "required": True,
                    "constraints": {},
                    "description": "User id",
                    "examples": ["usr_123"],
                }
            ],
            "events": [
                {
                    "event_name": "signup_completed",
                    "status": "active",
                    "description": "Signup",
                    "category": "activation",
                    "sort_order": 2,
                    "implementation_guidance": {
                        "trigger_when": ["Account creation transaction commits."],
                        "do_not_trigger_when": ["Signup form is submitted."],
                        "preferred_location": "server",
                        "required_source": "users_service",
                        "lifecycle_stage": "activation",
                        "idempotency_key": "user_id",
                        "privacy_notes": ["Do not include password fields."],
                        "code_examples": [
                            {
                                "snippet": "trackSignupCompleted({ user_id, signup_method })",
                                "framework": "fastapi",
                                "language": "typescript",
                            }
                        ],
                    },
                    "properties": [
                        {
                            "name": "signup_method",
                            "type": "string",
                            "required": True,
                            "constraints": {"enum": ["google", "email"]},
                            "description": "Signup method",
                            "examples": ["google"],
                        }
                    ],
                    "global_properties": ["user_id"],
                },
                {
                    "event_name": "page_viewed",
                    "status": "active",
                    "description": None,
                    "category": None,
                    "sort_order": 1,
                    "properties": [],
                    "global_properties": [],
                },
            ],
        },
        created_at=datetime(2026, 6, 27, 12, 0, tzinfo=timezone.utc),
    )

    first = build_contract_payload(version)
    second = build_contract_payload(version)

    assert first == second
    assert first["format_version"] == "trackboard.contract.v1"
    assert first["plan_id"] == str(plan_id)
    assert first["version_id"] == str(version_id)
    assert first["version_number"] == 1
    assert first["published_at"] == "2026-06-27T12:00:00Z"
    assert first["hash"].startswith("sha256:")
    assert len(first["hash"]) == len("sha256:") + 64
    event_names = [event["event_name"] for event in first["events"]]
    assert event_names == ["page_viewed", "signup_completed"]
    assert "implementation_guidance" not in first["events"][0]
    assert first["events"][1]["implementation_guidance"] == {
        "code_examples": [
            {
                "framework": "fastapi",
                "language": "typescript",
                "snippet": "trackSignupCompleted({ user_id, signup_method })",
            }
        ],
        "do_not_trigger_when": ["Signup form is submitted."],
        "idempotency_key": "user_id",
        "lifecycle_stage": "activation",
        "preferred_location": "server",
        "privacy_notes": ["Do not include password fields."],
        "required_source": "users_service",
        "trigger_when": ["Account creation transaction commits."],
    }
    signup_method = first["events"][1]["properties"][0]
    assert signup_method["constraints"] == {"enum_values": ["email", "google"]}


def test_build_contract_payload_hash_changes_when_guidance_changes():
    base = Version(
        id=uuid4(),
        plan_id=uuid4(),
        version_number=1,
        created_by=uuid4(),
        change_summary="Initial",
        published_from_revision=1,
        snapshot={
            "name": "Web Analytics",
            "description": None,
            "global_properties": [],
            "events": [
                {
                    "event_name": "checkout_completed",
                    "status": "active",
                    "description": None,
                    "category": None,
                    "sort_order": 1,
                    "properties": [],
                    "global_properties": [],
                    "implementation_guidance": {
                        "trigger_when": ["Payment provider confirms the charge."],
                    },
                }
            ],
        },
        created_at=datetime(2026, 6, 27, 12, 0, tzinfo=timezone.utc),
    )
    changed = Version(
        id=base.id,
        plan_id=base.plan_id,
        version_number=base.version_number,
        created_by=base.created_by,
        change_summary=base.change_summary,
        published_from_revision=base.published_from_revision,
        snapshot={
            **base.snapshot,
            "events": [
                {
                    **base.snapshot["events"][0],
                    "implementation_guidance": {
                        "trigger_when": ["Order row is persisted."],
                    },
                }
            ],
        },
        created_at=base.created_at,
    )

    assert build_contract_payload(base)["hash"] != build_contract_payload(changed)["hash"]


@pytest.mark.asyncio
async def test_export_published_contract_endpoint(client):
    identity = await register_user(client, email_prefix="contract-export")
    plan = await create_plan(client, identity["token"], name="Contract Export Plan")
    event = await create_event(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=plan["draft_revision"],
        event_name="signup_completed",
    )
    prop = await create_property(
        client,
        identity["token"],
        event_id=event["id"],
        draft_revision=event["draft_revision"],
        name="signup_method",
        constraints={"enum_values": ["google", "email"]},
    )
    version = await publish_plan(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=prop["draft_revision"],
        summary="Initial contract",
    )

    response = await client.get(
        f"/api/v1/plans/{plan['id']}/contract",
        headers=auth_headers(identity["token"]),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["format_version"] == "trackboard.contract.v1"
    assert payload["version_id"] == version["id"]
    assert payload["version_number"] == 1
    assert payload["hash"].startswith("sha256:")
    event_names = [event["event_name"] for event in payload["events"]]
    assert event_names == sorted(event_names)
