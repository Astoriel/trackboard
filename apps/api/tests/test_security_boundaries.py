from __future__ import annotations

from uuid import UUID

import pytest
from sqlalchemy import select

from app.models import OrgMember, Organization, User, UserRole
from tests.helpers import (
    auth_headers,
    create_branch,
    create_event,
    create_merge_request,
    create_plan,
    publish_plan,
    register_user,
)


async def _identity_details(client, token: str) -> dict:
    response = await client.get("/api/v1/auth/me", headers=auth_headers(token))
    assert response.status_code == 200, response.text
    return response.json()


async def _add_org_member(session_factory, *, email: str, org_id: str, role: UserRole) -> None:
    async with session_factory() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one()
        session.add(OrgMember(user_id=user.id, org_id=UUID(org_id), role=role))
        await session.commit()


@pytest.mark.asyncio
async def test_comments_do_not_cross_organization_boundary(client):
    alice = await register_user(client, email_prefix="security-alice-comments")
    bob = await register_user(client, email_prefix="security-bob-comments")
    plan = await create_plan(client, alice["token"], name="Private Comments Plan")
    event = await create_event(
        client,
        alice["token"],
        plan_id=plan["id"],
        draft_revision=plan["draft_revision"],
        event_name="private_event",
    )

    list_response = await client.get(
        f"/api/v1/events/{event['id']}/comments",
        headers=auth_headers(bob["token"]),
    )
    assert list_response.status_code == 403

    create_response = await client.post(
        f"/api/v1/events/{event['id']}/comments",
        json={"body": "cross-org probe"},
        headers=auth_headers(bob["token"]),
    )
    assert create_response.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_mutate_comments_merge_or_versions(client, session_factory):
    owner = await register_user(client, email_prefix="security-owner")
    viewer = await register_user(client, email_prefix="security-viewer")
    owner_me = await _identity_details(client, owner["token"])
    await _add_org_member(
        session_factory,
        email=viewer["email"],
        org_id=owner_me["org_id"],
        role=UserRole.VIEWER,
    )

    plan = await create_plan(client, owner["token"], name="Viewer Boundary Plan")
    event = await create_event(
        client,
        owner["token"],
        plan_id=plan["id"],
        draft_revision=plan["draft_revision"],
        event_name="signup_completed",
    )
    version = await publish_plan(
        client,
        owner["token"],
        plan_id=plan["id"],
        draft_revision=event["draft_revision"],
        summary="Initial publish",
    )
    branch = await create_branch(
        client,
        owner["token"],
        plan_id=plan["id"],
        draft_revision=event["draft_revision"],
        branch_name="viewer-boundary-branch",
    )
    merge_request = await create_merge_request(
        client,
        owner["token"],
        plan_id=plan["id"],
        branch_plan_id=branch["id"],
        title="Viewer should not merge",
    )

    readable = await client.get(f"/api/v1/plans/{plan['id']}", headers=auth_headers(viewer["token"]))
    assert readable.status_code == 200

    comment_response = await client.post(
        f"/api/v1/events/{event['id']}/comments",
        json={"body": "viewer mutation probe"},
        headers=auth_headers(viewer["token"]),
    )
    assert comment_response.status_code == 403

    merge_response = await client.post(
        f"/api/v1/merge-requests/{merge_request['id']}/merge",
        headers=auth_headers(viewer["token"]),
    )
    assert merge_response.status_code == 403

    restore_response = await client.post(
        f"/api/v1/versions/{version['id']}/restore",
        headers=auth_headers(viewer["token"]),
    )
    assert restore_response.status_code == 403


@pytest.mark.asyncio
async def test_version_diff_checks_both_versions_are_accessible(client):
    alice = await register_user(client, email_prefix="security-alice-version")
    bob = await register_user(client, email_prefix="security-bob-version")

    alice_plan = await create_plan(client, alice["token"], name="Alice Version Plan")
    alice_event = await create_event(
        client,
        alice["token"],
        plan_id=alice_plan["id"],
        draft_revision=alice_plan["draft_revision"],
        event_name="alice_event",
    )
    alice_version = await publish_plan(
        client,
        alice["token"],
        plan_id=alice_plan["id"],
        draft_revision=alice_event["draft_revision"],
        summary="Alice publish",
    )

    bob_plan = await create_plan(client, bob["token"], name="Bob Version Plan")
    bob_event = await create_event(
        client,
        bob["token"],
        plan_id=bob_plan["id"],
        draft_revision=bob_plan["draft_revision"],
        event_name="bob_event",
    )
    bob_version = await publish_plan(
        client,
        bob["token"],
        plan_id=bob_plan["id"],
        draft_revision=bob_event["draft_revision"],
        summary="Bob publish",
    )

    response = await client.get(
        f"/api/v1/versions/{bob_version['id']}/diff/{alice_version['id']}",
        headers=auth_headers(bob["token"]),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_ai_provider_secret_is_not_echoed_and_is_encrypted(client, session_factory):
    owner = await register_user(client, email_prefix="security-ai-secret")
    owner_me = await _identity_details(client, owner["token"])

    response = await client.patch(
        "/api/v1/org/ai-provider",
        json={
            "enabled": True,
            "provider": "openai-compatible",
            "base_url": "https://api.example.test/v1",
            "model": "example-model",
            "api_key": "sk_test_should_not_echo",
        },
        headers=auth_headers(owner["token"]),
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["has_api_key"] is True
    assert "api_key" not in payload

    read_response = await client.get("/api/v1/org/ai-provider", headers=auth_headers(owner["token"]))
    assert read_response.status_code == 200
    assert "api_key" not in read_response.json()

    async with session_factory() as session:
        org = await session.get(Organization, owner_me["org_id"])
        stored_key = org.settings["ai_provider"]["api_key"]
        assert stored_key != "sk_test_should_not_echo"
        assert stored_key.startswith("fernet:")
