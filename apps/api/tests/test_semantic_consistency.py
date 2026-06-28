from __future__ import annotations

from uuid import uuid4

from app.models import EventSchema, Property
from app.schemas.tracking_plan import ConsistencyPreviewRequest
from app.services.semantic_consistency import SemanticConsistencyService, tokenize


def _event(name: str, *, description: str, category: str, properties: list[Property]) -> EventSchema:
    return EventSchema(
        id=uuid4(),
        plan_id=uuid4(),
        event_name=name,
        description=description,
        category=category,
        status="active",
        properties=properties,
        global_properties=[],
    )


def _property(name: str, property_type: str = "string", required: bool = True) -> Property:
    return Property(
        id=uuid4(),
        event_id=uuid4(),
        name=name,
        type=property_type,
        required=required,
        constraints={},
    )


def test_tokenizer_splits_and_normalizes_synonyms() -> None:
    assert tokenize("CheckoutCompleted") == ["commerce", "complete"]
    assert tokenize("order_completed") == ["commerce", "complete"]
    assert tokenize("user-clicked-product-card") == ["product", "card"]


def test_high_confidence_duplicate_scores_with_evidence() -> None:
    service = SemanticConsistencyService()
    existing = service.build_event_profile(
        _event(
            "CheckoutCompleted",
            description="Customer completed checkout after payment succeeds",
            category="checkout",
            properties=[
                _property("user_id"),
                _property("order_id"),
                _property("revenue", "float"),
                _property("currency"),
                _property("payment_method"),
            ],
        )
    )
    proposed = service.build_proposed_profile(
        ConsistencyPreviewRequest(
            event_name="order_completed",
            description="User finished an order after payment succeeds",
            category="checkout",
            properties=[
                {"name": "user_id", "type": "string", "required": True},
                {"name": "order_id", "type": "string", "required": True},
                {"name": "revenue", "type": "float", "required": True},
                {"name": "currency", "type": "string", "required": True},
                {"name": "payment_method", "type": "string", "required": True},
            ],
            implementation_guidance={"trigger_when": ["payment webhook succeeds"]},
        )
    )

    candidate = service.score_candidate(proposed, existing)

    assert candidate.score >= 82
    assert candidate.label == "duplicate_likely"
    assert candidate.recommendation == "reuse_existing_event"
    assert candidate.score_breakdown["name_similarity"] == 25
    assert any(item.kind == "property_overlap" for item in candidate.evidence)


def test_unrelated_event_is_filtered_below_threshold() -> None:
    service = SemanticConsistencyService()
    existing = service.build_event_profile(
        _event(
            "CheckoutCompleted",
            description="Customer completed checkout after payment succeeds",
            category="checkout",
            properties=[
                _property("order_id"),
                _property("revenue", "float"),
                _property("currency"),
            ],
        )
    )
    proposed = service.build_proposed_profile(
        ConsistencyPreviewRequest(
            event_name="ProductViewed",
            description="Visitor looked at a product detail page",
            category="catalog",
            properties=[
                {"name": "product_id", "type": "string", "required": True},
                {"name": "sku", "type": "string", "required": False},
            ],
        )
    )

    candidate = service.score_candidate(proposed, existing)

    assert candidate.score < 50
    assert service.compare_against_events(proposed, [existing]) == []


def test_same_name_conflict_and_semantic_warning_coexist() -> None:
    service = SemanticConsistencyService()
    same_name = service.build_event_profile(
        _event(
            "OrderCompleted",
            description="Order completed",
            category="checkout",
            properties=[_property("order_id")],
        )
    )
    semantic_match = service.build_event_profile(
        _event(
            "CheckoutSuccess",
            description="Checkout success",
            category="checkout",
            properties=[_property("order_id")],
        )
    )
    proposed = service.build_proposed_profile(
        ConsistencyPreviewRequest(
            event_name="OrderCompleted",
            description="Purchase finished",
            category="checkout",
            properties=[{"name": "order_id", "type": "string", "required": True}],
        )
    )

    candidates = service.compare_against_events(proposed, [same_name, semantic_match])

    assert [candidate.event_name for candidate in candidates] == [
        "OrderCompleted",
        "CheckoutSuccess",
    ]
    assert all(candidate.label == "duplicate_likely" for candidate in candidates)
