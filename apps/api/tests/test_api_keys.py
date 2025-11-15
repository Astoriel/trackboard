import pytest

from tests.helpers import auth_headers, create_key, create_plan, register_user


@pytest.mark.asyncio
async def test_api_key_lifecycle(client):
    identity = await register_user(client, email_prefix="keys")
    plan = await create_plan(client, identity["token"], name="Key Plan")

    created = await create_key(client, identity["token"], plan_id=plan["id"], label="Prod Key")
    assert created["label"] == "Prod Key"
    assert created["scope"] == "validate"
    assert created["is_active"] is True
    assert created["full_key"].startswith("tb_live_")

    listed = await client.get(
        f"/api/v1/plans/{plan['id']}/keys",
        headers=auth_headers(identity["token"]),
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    rotated = await client.post(
        f"/api/v1/keys/{created['id']}/rotate",
        headers=auth_headers(identity["token"]),
    )
    assert rotated.status_code == 200
    rotated_payload = rotated.json()
    assert rotated_payload["id"] != created["id"]
    assert rotated_payload["label"] == "Prod Key (rotated)"

    after_rotate = await client.get(
        f"/api/v1/plans/{plan['id']}/keys",
        headers=auth_headers(identity["token"]),
    )
    assert after_rotate.status_code == 200
    keys = after_rotate.json()
    assert len(keys) == 2
    original = next(item for item in keys if item["id"] == created["id"])
    replacement = next(item for item in keys if item["id"] == rotated_payload["id"])
    assert original["is_active"] is False
    assert original["revoked_at"] is not None
    assert replacement["is_active"] is True

    revoked = await client.delete(
        f"/api/v1/keys/{rotated_payload['id']}",
        headers=auth_headers(identity["token"]),
    )
    assert revoked.status_code == 204

    final_list = await client.get(
        f"/api/v1/plans/{plan['id']}/keys",
        headers=auth_headers(identity["token"]),
    )
    assert final_list.status_code == 200
    final_keys = final_list.json()
    rotated_key = next(item for item in final_keys if item["id"] == rotated_payload["id"])
    assert rotated_key["is_active"] is False
    assert rotated_key["revoked_at"] is not None


@pytest.mark.asyncio
async def test_api_keys_require_authentication(client):
    response = await client.get("/api/v1/plans/123e4567-e89b-12d3-a456-426614174000/keys")
    assert response.status_code == 401
