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


async def _get_plan(client, token: str, plan_id: str) -> dict:
    response = await client.get(
        f"/api/v1/plans/{plan_id}",
        headers=auth_headers(token),
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_implementation_status_rolls_up_plan_events_from_validation_logs(client):
    identity = await register_user(client, email_prefix="implementation-status")
    plan = await create_plan(client, identity["token"], name="Implementation Status Plan")

    signup = await create_event(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=plan["draft_revision"],
        event_name="signup_completed",
    )
    plan = await _get_plan(client, identity["token"], plan["id"])
    await create_property(
        client,
        identity["token"],
        event_id=signup["id"],
        draft_revision=plan["draft_revision"],
        name="method",
        required=True,
        constraints={"enum_values": ["email", "google"]},
    )
    plan = await _get_plan(client, identity["token"], plan["id"])
    await create_event(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=plan["draft_revision"],
        event_name="checkout_started",
    )
    plan = await _get_plan(client, identity["token"], plan["id"])
    await create_event(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=plan["draft_revision"],
        event_name="purchase_completed",
    )
    plan = await _get_plan(client, identity["token"], plan["id"])
    published = await publish_plan(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=plan["draft_revision"],
        summary="Implementation status baseline",
    )
    api_key = await create_key(client, identity["token"], plan_id=plan["id"], label="SDK key")

    valid_signup = await client.post(
        "/api/v1/validate",
        json={
            "event": "signup_completed",
            "properties": {"method": "google"},
            "source": "web",
            "mode": "warn",
        },
        headers={"X-API-Key": api_key["full_key"]},
    )
    assert valid_signup.status_code == 200, valid_signup.text

    invalid_signup = await client.post(
        "/api/v1/validate",
        json={
            "event": "signup_completed",
            "properties": {"method": "twitter"},
            "source": "ios",
            "mode": "warn",
        },
        headers={"X-API-Key": api_key["full_key"]},
    )
    assert invalid_signup.status_code == 200, invalid_signup.text

    valid_purchase = await client.post(
        "/api/v1/validate",
        json={
            "event": "purchase_completed",
            "properties": {},
            "source": "server",
            "mode": "warn",
        },
        headers={"X-API-Key": api_key["full_key"]},
    )
    assert valid_purchase.status_code == 200, valid_purchase.text

    response = await client.get(
        f"/api/v1/plans/{plan['id']}/implementation-status",
        headers=auth_headers(identity["token"]),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["period"] == "all"

    by_event = {event["event_name"]: event for event in payload["events"]}
    assert set(by_event) == {"signup_completed", "checkout_started", "purchase_completed"}

    signup_status = by_event["signup_completed"]
    assert signup_status["status"] == "mixed"
    assert signup_status["valid_count"] == 1
    assert signup_status["invalid_count"] == 1
    assert signup_status["last_seen_at"] is not None
    assert signup_status["last_valid_at"] is not None
    assert signup_status["last_invalid_at"] is not None
    assert signup_status["source_labels"] == ["ios", "web"]
    assert signup_status["version_ids"] == [published["id"]]

    checkout_status = by_event["checkout_started"]
    assert checkout_status["status"] == "never_seen"
    assert checkout_status["valid_count"] == 0
    assert checkout_status["invalid_count"] == 0
    assert checkout_status["source_labels"] == []
    assert checkout_status["version_ids"] == []

    purchase_status = by_event["purchase_completed"]
    assert purchase_status["status"] == "seen_valid"
    assert purchase_status["valid_count"] == 1
    assert purchase_status["invalid_count"] == 0
    assert purchase_status["source_labels"] == ["server"]
    assert purchase_status["version_ids"] == [published["id"]]
