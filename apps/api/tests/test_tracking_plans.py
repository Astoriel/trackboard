import pytest

from tests.helpers import (
    auth_headers,
    create_branch,
    create_event,
    create_plan,
    create_property,
    register_user,
)


@pytest.mark.asyncio
async def test_create_plan_event_property_and_branch_flow(client):
    identity = await register_user(client, email_prefix="plans")
    plan = await create_plan(
        client,
        identity["token"],
        name="My SaaS App",
        description="Production tracking plan",
    )
    assert plan["status"] == "draft"
    assert plan["draft_revision"] == 1

    event = await create_event(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=plan["draft_revision"],
        event_name="signup_completed",
        description="User finished signup",
        category="onboarding",
    )
    assert event["draft_revision"] == 2

    prop = await create_property(
        client,
        identity["token"],
        event_id=event["id"],
        draft_revision=event["draft_revision"],
        name="signup_method",
        required=True,
        constraints={"enum_values": ["google", "email", "apple"]},
    )
    assert prop["required"] is True
    assert prop["draft_revision"] == 3

    global_prop = await client.post(
        f"/api/v1/plans/{plan['id']}/global-properties",
        json={
            "name": "source",
            "type": "string",
            "required": False,
            "draft_revision": prop["draft_revision"],
        },
        headers=auth_headers(identity["token"]),
    )
    assert global_prop.status_code == 201, global_prop.text
    global_prop_payload = global_prop.json()
    assert global_prop_payload["draft_revision"] == 4

    linked = await client.post(
        f"/api/v1/events/{event['id']}/global-properties/{global_prop_payload['id']}",
        params={"draft_revision": global_prop_payload["draft_revision"]},
        headers=auth_headers(identity["token"]),
    )
    assert linked.status_code == 200, linked.text
    linked_payload = linked.json()
    assert linked_payload["draft_revision"] == 5
    assert linked_payload["global_properties"][0]["name"] == "source"

    detail = await client.get(
        f"/api/v1/plans/{plan['id']}",
        headers=auth_headers(identity["token"]),
    )
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["draft_revision"] == 5
    assert payload["events_count"] == 1
    assert payload["global_properties"][0]["name"] == "source"
    assert payload["events"][0]["draft_revision"] == 5
    assert payload["events"][0]["properties"][0]["draft_revision"] == 5
    assert payload["events"][0]["global_properties"][0]["name"] == "source"

    exported = await client.get(
        f"/api/v1/plans/{plan['id']}/export",
        headers=auth_headers(identity["token"]),
    )
    assert exported.status_code == 200
    assert exported.json()["global_properties"][0]["name"] == "source"

    branch = await create_branch(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=payload["draft_revision"],
        branch_name="experiment-checkout",
    )
    assert branch["is_main"] is False
    assert branch["parent_plan_id"] == plan["id"]
    assert branch["branch_name"] == "experiment-checkout"
    assert branch["draft_revision"] == payload["draft_revision"]


@pytest.mark.asyncio
async def test_stale_revision_returns_machine_readable_conflict(client):
    identity = await register_user(client, email_prefix="stale")
    plan = await create_plan(client, identity["token"], name="Stale Plan")

    first_event = await create_event(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=plan["draft_revision"],
        event_name="signup_completed",
    )
    assert first_event["draft_revision"] == 2

    stale_response = await client.post(
        f"/api/v1/plans/{plan['id']}/events",
        json={
            "event_name": "checkout_completed",
            "draft_revision": 1,
        },
        headers=auth_headers(identity["token"]),
    )
    assert stale_response.status_code == 409
    assert stale_response.json()["code"] == "stale_revision"
    assert stale_response.json()["current_revision"] == 2
