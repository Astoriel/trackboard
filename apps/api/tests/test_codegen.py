import pytest

from tests.helpers import create_event, create_plan, create_property, publish_plan, register_user


@pytest.mark.asyncio
async def test_codegen_requires_published_version(client):
    identity = await register_user(client, email_prefix="codegen-empty")
    plan = await create_plan(client, identity["token"], name="Codegen Plan")

    response = await client.get(
        f"/api/v1/plans/{plan['id']}/generate/typescript",
        headers={"Authorization": f"Bearer {identity['token']}"},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "no_published_version"


@pytest.mark.asyncio
async def test_codegen_typescript_and_json_schema(client):
    identity = await register_user(client, email_prefix="codegen")
    plan = await create_plan(client, identity["token"], name="Codegen Plan")
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
        constraints={"enum_values": ["card", "paypal"]},
    )
    await publish_plan(
        client,
        identity["token"],
        plan_id=plan["id"],
        draft_revision=prop["draft_revision"],
        summary="Initial release",
    )

    typescript = await client.get(
        f"/api/v1/plans/{plan['id']}/generate/typescript",
        headers={"Authorization": f"Bearer {identity['token']}"},
    )
    assert typescript.status_code == 200
    assert "interface CheckoutCompletedProperties" in typescript.text
    assert '"card" | "paypal"' in typescript.text

    json_schema = await client.get(
        f"/api/v1/plans/{plan['id']}/generate/json-schema",
        headers={"Authorization": f"Bearer {identity['token']}"},
    )
    assert json_schema.status_code == 200
    payload = json_schema.json()
    payment_method_schema = payload["oneOf"][0]["properties"]["properties"]["properties"][
        "payment_method"
    ]
    assert payload["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert payload["oneOf"][0]["properties"]["event"]["const"] == "checkout_completed"
    assert payment_method_schema["enum"] == ["card", "paypal"]
