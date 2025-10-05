import pytest

from tests.helpers import (
    auth_headers,
    create_event,
    create_plan,
    create_property,
    publish_plan,
    register_user,
)


@pytest.mark.asyncio
async def test_publish_diff_restore_and_breaking_change_gate(client):
    identity = await register_user(client, email_prefix="versions")
    plan = await create_plan(client, identity["token"], name="Versioned Plan")
    event = await create_event(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=plan["draft_revision"],
        event_name="checkout_completed",
    )
    prop = await create_property(
        client,
        identity["token"],
        event_id=event["id"],
        draft_revision=event["draft_revision"],
        name="payment_method",
        property_type="string",
    )

    version_one = await publish_plan(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=prop["draft_revision"],
        summary="Initial publish",
    )
    assert version_one["version_number"] == 1
    assert version_one["publish_kind"] == "publish"
    assert version_one["compatibility_report"]["breaking"] is False

    updated_property = await client.patch(
        f"/api/v1/properties/{prop['id']}",
        json={"type": "integer", "draft_revision": prop["draft_revision"]},
        headers=auth_headers(identity["token"]),
    )
    assert updated_property.status_code == 200
    updated_payload = updated_property.json()
    assert updated_payload["draft_revision"] == 4

    blocked_publish = await client.post(
        f"/api/v1/plans/{plan['id']}/publish",
        json={"summary": "Breaking publish", "draft_revision": 4, "allow_breaking": False},
        headers=auth_headers(identity["token"]),
    )
    assert blocked_publish.status_code == 409
    assert blocked_publish.json()["code"] == "breaking_change_blocked"
    assert blocked_publish.json()["compatibility_report"]["breaking"] is True

    version_two = await publish_plan(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=4,
        summary="Breaking publish",
        allow_breaking=True,
    )
    assert version_two["version_number"] == 2
    assert version_two["compatibility_report"]["breaking"] is True

    listed = await client.get(
        f"/api/v1/plans/{plan['id']}/versions",
        headers=auth_headers(identity["token"]),
    )
    assert listed.status_code == 200
    assert [item["version_number"] for item in listed.json()] == [2, 1]

    diff = await client.get(
        f"/api/v1/versions/{version_one['id']}/diff/{version_two['id']}",
        headers=auth_headers(identity["token"]),
    )
    assert diff.status_code == 200
    diff_payload = diff.json()
    assert diff_payload["modified_events"][0]["event_name"] == "checkout_completed"
    assert diff_payload["modified_events"][0]["changed_properties"][0]["name"] == "payment_method"

    restored = await client.post(
        f"/api/v1/versions/{version_one['id']}/restore",
        headers=auth_headers(identity["token"]),
    )
    assert restored.status_code == 200
    assert restored.json()["restored_from_version_id"] == version_one["id"]
    assert restored.json()["draft_revision"] == 5

    detail = await client.get(
        f"/api/v1/plans/{plan['id']}",
        headers=auth_headers(identity["token"]),
    )
    assert detail.status_code == 200
    restored_plan = detail.json()
    assert restored_plan["draft_revision"] == 5
    assert restored_plan["events"][0]["properties"][0]["type"] == "string"
