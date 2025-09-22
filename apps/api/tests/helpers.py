from __future__ import annotations

from uuid import uuid4

from httpx import AsyncClient


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def register_user(
    client: AsyncClient,
    *,
    email_prefix: str = "user",
    password: str = "securepass123",
    name: str = "Trackboard User",
    org_name: str = "Trackboard Org",
) -> dict[str, str]:
    email = f"{email_prefix}-{uuid4().hex[:8]}@trackboard.dev"
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "name": name,
            "org_name": org_name,
        },
    )
    assert response.status_code == 201, response.text
    tokens = response.json()
    return {
        "email": email,
        "password": password,
        "token": tokens["access_token"],
    }


async def create_plan(
    client: AsyncClient,
    token: str,
    *,
    name: str = "Core Plan",
    description: str | None = None,
) -> dict:
    response = await client.post(
        "/api/v1/plans",
        json={"name": name, "description": description},
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_event(
    client: AsyncClient,
    token: str,
    *,
    plan_id: str,
    draft_revision: int,
    event_name: str,
    description: str | None = None,
    category: str | None = None,
) -> dict:
    response = await client.post(
        f"/api/v1/plans/{plan_id}/events",
        json={
            "event_name": event_name,
            "description": description,
            "category": category,
            "draft_revision": draft_revision,
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_property(
    client: AsyncClient,
    token: str,
    *,
    event_id: str,
    draft_revision: int,
    name: str,
    property_type: str = "string",
    required: bool = False,
    constraints: dict | None = None,
) -> dict:
    response = await client.post(
        f"/api/v1/events/{event_id}/properties",
        json={
            "name": name,
            "type": property_type,
            "required": required,
            "constraints": constraints or {},
            "draft_revision": draft_revision,
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def publish_plan(
    client: AsyncClient,
    token: str,
    *,
    plan_id: str,
    draft_revision: int,
    summary: str,
    allow_breaking: bool = False,
) -> dict:
    response = await client.post(
        f"/api/v1/plans/{plan_id}/publish",
        json={
            "summary": summary,
            "allow_breaking": allow_breaking,
            "draft_revision": draft_revision,
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_key(
    client: AsyncClient,
    token: str,
    *,
    plan_id: str,
    label: str = "Validation Key",
) -> dict:
    response = await client.post(
        f"/api/v1/plans/{plan_id}/keys",
        json={"label": label},
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_branch(
    client: AsyncClient,
    token: str,
    *,
    plan_id: str,
    draft_revision: int,
    branch_name: str,
) -> dict:
    response = await client.post(
        f"/api/v1/plans/{plan_id}/branch",
        json={"branch_name": branch_name, "draft_revision": draft_revision},
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_merge_request(
    client: AsyncClient,
    token: str,
    *,
    plan_id: str,
    branch_plan_id: str,
    title: str = "Merge branch",
    description: str | None = None,
) -> dict:
    response = await client.post(
        f"/api/v1/plans/{plan_id}/merge-requests",
        json={
            "branch_plan_id": branch_plan_id,
            "title": title,
            "description": description,
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return response.json()
