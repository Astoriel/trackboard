import pytest

from tests.helpers import (
    auth_headers,
    create_event,
    create_key,
    create_plan,
    create_property,
    publish_plan,
    register_user,
)


async def _published_plan_with_key(client):
    identity = await register_user(client, email_prefix="validate")
    plan = await create_plan(client, identity["token"], name="Validation Plan")
    event = await create_event(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=plan["draft_revision"],
        event_name="signup_completed",
        description="Signup event",
    )
    prop = await create_property(
        client,
        identity["token"],
        event_id=event["id"],
        draft_revision=event["draft_revision"],
        name="method",
        required=True,
        constraints={"enum_values": ["google", "email"]},
    )
    published = await publish_plan(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=prop["draft_revision"],
        summary="Validation baseline",
    )
    api_key = await create_key(client, identity["token"], plan_id=plan["id"], label="SDK key")
    return identity, plan, published, api_key


@pytest.mark.asyncio
async def test_validation_requires_api_key(app_client):
    response = await app_client.post(
        "/api/v1/validate",
        json={"event": "signup_completed", "properties": {}},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "api_key_required"


@pytest.mark.asyncio
async def test_validation_requires_published_version(client):
    identity = await register_user(client, email_prefix="validate-draft")
    plan = await create_plan(client, identity["token"], name="Draft Validation Plan")
    api_key = await create_key(client, identity["token"], plan_id=plan["id"])

    response = await client.post(
        "/api/v1/validate",
        json={"event": "signup_completed", "properties": {}, "mode": "warn"},
        headers={"X-API-Key": api_key["full_key"]},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "no_published_version"


@pytest.mark.asyncio
async def test_validation_success_and_block_mode_dlq_aggregation(client):
    identity, plan, published, api_key = await _published_plan_with_key(client)

    success = await client.post(
        "/api/v1/validate",
        json={
            "event": "signup_completed",
            "properties": {"method": "google"},
            "mode": "warn",
        },
        headers={"X-API-Key": api_key["full_key"]},
    )
    assert success.status_code == 200
    success_payload = success.json()
    assert success_payload["valid"] is True
    assert success_payload["version_id"] == published["id"]
    assert success_payload["violations"] == []

    for _ in range(2):
        invalid = await client.post(
            "/api/v1/validate",
            json={
                "event": "signup_completed",
                "properties": {"method": "twitter"},
                "mode": "block",
            },
            headers={"X-API-Key": api_key["full_key"]},
        )
        assert invalid.status_code == 200
        payload = invalid.json()
        assert payload["valid"] is False
        assert payload["mode"] == "block"
        assert payload["violations"][0]["code"] == "enum_violation"

    dlq = await client.get(
        f"/api/v1/plans/{plan['id']}/dlq",
        headers=auth_headers(identity["token"]),
    )
    assert dlq.status_code == 200
    dlq_items = dlq.json()
    assert len(dlq_items) == 1
    assert dlq_items[0]["occurrence_count"] == 2
    assert dlq_items[0]["version_id"] == published["id"]
    assert dlq_items[0]["event_name"] == "signup_completed"

    stats = await client.get(
        f"/api/v1/plans/{plan['id']}/validate/stats",
        headers=auth_headers(identity["token"]),
    )
    assert stats.status_code == 200
    stats_payload = stats.json()
    assert stats_payload["valid_count"] == 1
    assert stats_payload["invalid_count"] == 2
    assert stats_payload["top_failing_events"][0]["event_name"] == "signup_completed"


@pytest.mark.asyncio
async def test_validation_accepts_imported_global_property_links(client):
    identity = await register_user(client, email_prefix="validate-global")
    plan = await create_plan(client, identity["token"], name="Global Link Validation Plan")

    imported = await client.post(
        f"/api/v1/plans/{plan['id']}/import",
        json={
            "draft_revision": plan["draft_revision"],
            "events": [
                {
                    "event_name": "signup_completed",
                    "properties": [
                        {"name": "method", "type": "string", "required": True},
                    ],
                    "global_properties": ["source"],
                }
            ],
            "global_properties": [
                {"name": "source", "type": "string", "required": False},
            ],
        },
        headers=auth_headers(identity["token"]),
    )
    assert imported.status_code == 200, imported.text
    exported = await client.get(
        f"/api/v1/plans/{plan['id']}/export",
        headers=auth_headers(identity["token"]),
    )
    assert exported.status_code == 200, exported.text
    exported_payload = exported.json()
    assert exported_payload["global_properties"][0]["name"] == "source"
    assert exported_payload["events"][0]["global_properties"] == ["source"]

    published = await publish_plan(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=imported.json()["draft_revision"],
        summary="Global link validation baseline",
    )
    api_key = await create_key(client, identity["token"], plan_id=plan["id"], label="SDK key")

    response = await client.post(
        "/api/v1/validate",
        json={
            "event": "signup_completed",
            "properties": {"method": "email", "source": "landing"},
            "mode": "warn",
        },
        headers={"X-API-Key": api_key["full_key"]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is True
    assert payload["version_id"] == published["id"]
    assert payload["violations"] == []
