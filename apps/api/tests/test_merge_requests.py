import pytest

from tests.helpers import (
    auth_headers,
    create_branch,
    create_event,
    create_merge_request,
    create_plan,
    publish_plan,
    register_user,
)


@pytest.mark.asyncio
async def test_branch_merge_flow_does_not_auto_publish(client):
    identity = await register_user(client, email_prefix="merge")
    plan = await create_plan(client, identity["token"], name="Merge Plan")
    main_event = await create_event(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=plan["draft_revision"],
        event_name="signup_completed",
    )
    published = await publish_plan(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=main_event["draft_revision"],
        summary="Baseline release",
    )

    branch = await create_branch(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=main_event["draft_revision"],
        branch_name="new-checkout",
    )
    branch_event = await create_event(
        client,
        identity["token"],
        plan_id=branch["id"],
        draft_revision=branch["draft_revision"],
        event_name="checkout_completed",
    )
    assert branch_event["draft_revision"] == branch["draft_revision"] + 1

    merge_request = await create_merge_request(
        client,
        identity["token"],
        plan_id=plan["id"],
        branch_plan_id=branch["id"],
        title="Merge checkout",
    )
    assert merge_request["status"] == "open"
    assert merge_request["base_version_id"] == published["id"]

    merged = await client.post(
        f"/api/v1/merge-requests/{merge_request['id']}/merge",
        headers=auth_headers(identity["token"]),
    )
    assert merged.status_code == 200
    merged_payload = merged.json()
    assert merged_payload["status"] == "merged"
    assert merged_payload["closed_at"] is not None

    plan_detail = await client.get(
        f"/api/v1/plans/{plan['id']}",
        headers=auth_headers(identity["token"]),
    )
    assert plan_detail.status_code == 200
    detail_payload = plan_detail.json()
    assert detail_payload["draft_revision"] == 3
    assert sorted(event["event_name"] for event in detail_payload["events"]) == [
        "checkout_completed",
        "signup_completed",
    ]

    versions = await client.get(
        f"/api/v1/plans/{plan['id']}/versions",
        headers=auth_headers(identity["token"]),
    )
    assert versions.status_code == 200
    assert len(versions.json()) == 1
