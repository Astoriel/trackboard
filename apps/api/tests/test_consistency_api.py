from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.core.database import get_db
from app.core.permissions import Permission, PlanAccess
from app.dependencies import get_current_user
from app.main import app
from app.models import TrackingPlan, User
from app.services.semantic_consistency import (
    ConsistencyCandidate,
    ConsistencyEvidence,
    EventProfile,
    SemanticConsistencyService,
)
from tests.helpers import (
    auth_headers,
    create_branch,
    create_event,
    create_merge_request,
    create_plan,
    create_property,
    register_user,
)

pytestmark = pytest.mark.asyncio


class _ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _FakeSession:
    def __init__(self, plan_id):
        self.plan_id = plan_id

    async def execute(self, _statement):
        return _ScalarResult(self.plan_id)


def _fake_candidate(event_id) -> ConsistencyCandidate:
    return ConsistencyCandidate(
        event_id=str(event_id),
        event_name="CheckoutCompleted",
        score=87,
        label="duplicate_likely",
        recommendation="reuse_existing_event",
        score_breakdown={"name_similarity": 25, "property_overlap": 20},
        evidence=(
            ConsistencyEvidence(
                kind="name_similarity",
                detail="order/completed matches checkout/completed through synonyms",
                weight=25,
            ),
        ),
    )


async def test_routes_return_deterministic_payload_without_ai_provider(
    app_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    plan_id = uuid4()
    event_id = uuid4()
    candidate_id = uuid4()
    user = User(id=user_id, email="route@test.dev", name="Route User", password_hash="hash")
    plan = TrackingPlan(id=plan_id, org_id=uuid4(), name="Route Plan")

    async def fake_get_current_user():
        return user

    async def fake_get_db():
        yield _FakeSession(plan_id)

    async def fake_resolve_plan_access(_db, *, user_id, plan_id):
        return PlanAccess(user=user, plan=plan, permission=Permission.OWNER)

    async def fake_preview(self, received_plan_id, payload):
        assert received_plan_id == plan_id
        return (
            EventProfile(
                event_id=None,
                event_name=payload.event_name,
                name_tokens=("commerce", "complete"),
                description_tokens=(),
                category=payload.category,
                status="active",
            ),
            [_fake_candidate(candidate_id)],
        )

    async def fake_audit_plan(self, received_plan_id):
        assert received_plan_id == plan_id
        return [
            {
                "event_id": str(event_id),
                "event_name": "order_completed",
                "candidate": _fake_candidate(candidate_id),
            }
        ]

    async def fake_event_consistency(self, received_event_id):
        assert received_event_id == event_id
        return (
            EventProfile(
                event_id=str(event_id),
                event_name="order_completed",
                name_tokens=("commerce", "complete"),
                description_tokens=(),
                category="checkout",
                status="active",
            ),
            [_fake_candidate(candidate_id)],
        )

    monkeypatch.setattr("app.core.permissions.resolve_plan_access", fake_resolve_plan_access)
    monkeypatch.setattr("app.api.consistency.resolve_plan_access", fake_resolve_plan_access)
    monkeypatch.setattr(SemanticConsistencyService, "preview", fake_preview)
    monkeypatch.setattr(SemanticConsistencyService, "audit_plan", fake_audit_plan)
    monkeypatch.setattr(SemanticConsistencyService, "event_consistency", fake_event_consistency)
    app.dependency_overrides[get_current_user] = fake_get_current_user
    app.dependency_overrides[get_db] = fake_get_db

    try:
        preview = await app_client.post(
            f"/api/v1/plans/{plan_id}/consistency/preview",
            json={"event_name": "order_completed", "category": "checkout"},
        )
        audit = await app_client.get(f"/api/v1/plans/{plan_id}/consistency/audit")
        event = await app_client.get(f"/api/v1/events/{event_id}/consistency")
    finally:
        app.dependency_overrides.clear()

    assert preview.status_code == 200, preview.text
    assert preview.json()["candidates"][0]["label"] == "duplicate_likely"
    assert audit.status_code == 200, audit.text
    assert audit.json()["finding_count"] == 1
    assert event.status_code == 200, event.text
    assert event.json()["candidates"][0]["score_breakdown"]["name_similarity"] == 25


async def _seed_checkout_event(client: AsyncClient, token: str) -> tuple[dict, dict]:
    plan = await create_plan(client, token, name="Commerce Plan")
    event = await create_event(
        client,
        token,
        plan_id=plan["id"],
        draft_revision=plan["draft_revision"],
        event_name="CheckoutCompleted",
        description="Customer completed checkout after payment succeeds",
        category="checkout",
    )
    revision = event["draft_revision"]
    for name, property_type in [
        ("user_id", "string"),
        ("order_id", "string"),
        ("revenue", "float"),
        ("currency", "string"),
        ("payment_method", "string"),
    ]:
        prop = await create_property(
            client,
            token,
            event_id=event["id"],
            draft_revision=revision,
            name=name,
            property_type=property_type,
            required=True,
        )
        revision = prop["draft_revision"]
    return plan, event


async def test_preview_route_returns_duplicate_warning_without_ai_config(client: AsyncClient) -> None:
    user = await register_user(client, email_prefix="consistency-preview")
    plan, _event = await _seed_checkout_event(client, user["token"])

    response = await client.post(
        f"/api/v1/plans/{plan['id']}/consistency/preview",
        headers=auth_headers(user["token"]),
        json={
            "event_name": "order_completed",
            "description": "User finished an order after payment succeeds",
            "category": "checkout",
            "properties": [
                {"name": "user_id", "type": "string", "required": True},
                {"name": "order_id", "type": "string", "required": True},
                {"name": "revenue", "type": "float", "required": True},
                {"name": "currency", "type": "string", "required": True},
                {"name": "payment_method", "type": "string", "required": True},
            ],
            "implementation_guidance": {"trigger_when": ["payment webhook succeeds"]},
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["candidate_count"] == 1
    candidate = payload["candidates"][0]
    assert candidate["event_name"] == "CheckoutCompleted"
    assert candidate["score"] >= 82
    assert candidate["label"] == "duplicate_likely"
    assert candidate["score_breakdown"]["name_similarity"] == 25
    assert candidate["evidence"]


async def test_preview_route_omits_unrelated_low_match(client: AsyncClient) -> None:
    user = await register_user(client, email_prefix="consistency-low")
    plan, _event = await _seed_checkout_event(client, user["token"])

    response = await client.post(
        f"/api/v1/plans/{plan['id']}/consistency/preview",
        headers=auth_headers(user["token"]),
        json={
            "event_name": "ProductViewed",
            "description": "Visitor looked at a product detail page",
            "category": "catalog",
            "properties": [
                {"name": "product_id", "type": "string", "required": True},
                {"name": "sku", "type": "string", "required": False},
            ],
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["candidates"] == []


async def test_audit_event_and_legacy_ai_analyze_routes(client: AsyncClient) -> None:
    user = await register_user(client, email_prefix="consistency-audit")
    plan, event = await _seed_checkout_event(client, user["token"])
    plan_response = await client.get(
        f"/api/v1/plans/{plan['id']}",
        headers=auth_headers(user["token"]),
    )
    assert plan_response.status_code == 200, plan_response.text
    duplicate = await create_event(
        client,
        user["token"],
        plan_id=plan["id"],
        draft_revision=plan_response.json()["draft_revision"],
        event_name="order_completed",
        description="User finished an order after payment succeeds",
        category="checkout",
    )
    revision = duplicate["draft_revision"]
    for name, property_type in [
        ("user_id", "string"),
        ("order_id", "string"),
        ("revenue", "float"),
        ("currency", "string"),
        ("payment_method", "string"),
    ]:
        prop = await create_property(
            client,
            user["token"],
            event_id=duplicate["id"],
            draft_revision=revision,
            name=name,
            property_type=property_type,
            required=True,
        )
        revision = prop["draft_revision"]

    audit = await client.get(
        f"/api/v1/plans/{plan['id']}/consistency/audit",
        headers=auth_headers(user["token"]),
    )
    assert audit.status_code == 200, audit.text
    assert audit.json()["finding_count"] >= 1

    event_consistency = await client.get(
        f"/api/v1/events/{event['id']}/consistency",
        headers=auth_headers(user["token"]),
    )
    assert event_consistency.status_code == 200, event_consistency.text
    assert event_consistency.json()["candidates"][0]["event_name"] == "order_completed"

    legacy = await client.get(
        f"/api/v1/plans/{plan['id']}/ai/analyze",
        headers=auth_headers(user["token"]),
    )
    assert legacy.status_code == 200, legacy.text
    assert legacy.json()["duplicates"][0]["score"] >= 82


async def test_merge_request_consistency_compares_branch_changes_against_main_only(
    client: AsyncClient,
) -> None:
    user = await register_user(client, email_prefix="consistency-merge")
    plan, _event = await _seed_checkout_event(client, user["token"])
    plan_response = await client.get(
        f"/api/v1/plans/{plan['id']}",
        headers=auth_headers(user["token"]),
    )
    assert plan_response.status_code == 200, plan_response.text

    branch = await create_branch(
        client,
        user["token"],
        plan_id=plan["id"],
        draft_revision=plan_response.json()["draft_revision"],
        branch_name="order-event",
    )
    duplicate = await create_event(
        client,
        user["token"],
        plan_id=branch["id"],
        draft_revision=branch["draft_revision"],
        event_name="order_completed",
        description="User finished an order after payment succeeds",
        category="checkout",
    )
    revision = duplicate["draft_revision"]
    for name, property_type in [
        ("user_id", "string"),
        ("order_id", "string"),
        ("revenue", "float"),
        ("currency", "string"),
        ("payment_method", "string"),
    ]:
        prop = await create_property(
            client,
            user["token"],
            event_id=duplicate["id"],
            draft_revision=revision,
            name=name,
            property_type=property_type,
            required=True,
        )
        revision = prop["draft_revision"]

    merge_request = await create_merge_request(
        client,
        user["token"],
        plan_id=plan["id"],
        branch_plan_id=branch["id"],
        title="Add order event",
    )

    response = await client.get(
        f"/api/v1/merge-requests/{merge_request['id']}/consistency",
        headers=auth_headers(user["token"]),
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["finding_count"] == 1
    finding = payload["findings"][0]
    assert finding["event_name"] == "order_completed"
    assert finding["candidate"]["event_name"] == "CheckoutCompleted"
    assert finding["candidate"]["label"] == "duplicate_likely"


async def test_merge_request_consistency_does_not_compare_modified_event_to_itself(
    client: AsyncClient,
) -> None:
    user = await register_user(client, email_prefix="consistency-merge-self")
    plan, _event = await _seed_checkout_event(client, user["token"])
    plan_response = await client.get(
        f"/api/v1/plans/{plan['id']}",
        headers=auth_headers(user["token"]),
    )
    assert plan_response.status_code == 200, plan_response.text

    branch = await create_branch(
        client,
        user["token"],
        plan_id=plan["id"],
        draft_revision=plan_response.json()["draft_revision"],
        branch_name="checkout-docs",
    )
    branch_response = await client.get(
        f"/api/v1/plans/{branch['id']}",
        headers=auth_headers(user["token"]),
    )
    assert branch_response.status_code == 200, branch_response.text
    branch_payload = branch_response.json()
    checkout_event = next(
        event
        for event in branch_payload["events"]
        if event["event_name"] == "CheckoutCompleted"
    )

    updated = await client.patch(
        f"/api/v1/events/{checkout_event['id']}",
        headers=auth_headers(user["token"]),
        json={
            "draft_revision": branch_payload["draft_revision"],
            "description": "Customer completed checkout after the payment webhook confirms success",
        },
    )
    assert updated.status_code == 200, updated.text

    merge_request = await create_merge_request(
        client,
        user["token"],
        plan_id=plan["id"],
        branch_plan_id=branch["id"],
        title="Clarify checkout trigger",
    )

    response = await client.get(
        f"/api/v1/merge-requests/{merge_request['id']}/consistency",
        headers=auth_headers(user["token"]),
    )
    assert response.status_code == 200, response.text
    assert response.json()["findings"] == []
