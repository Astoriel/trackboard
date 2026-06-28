from __future__ import annotations

from uuid import uuid4

from app.models import InvalidPayloadError
from app.services.dlq_grouping import DLQGroupingService, DLQViolation


def test_fingerprint_is_stable_across_raw_payload_value_changes():
    service = DLQGroupingService(db=None)  # type: ignore[arg-type]
    plan_id = uuid4()
    version_id = uuid4()
    violation = DLQViolation(
        code="type_mismatch",
        path="properties.tier",
        property_name="tier",
        expected="integer",
        actual="string",
    )
    row_a = InvalidPayloadError(
        plan_id=plan_id,
        version_id=version_id,
        event_name="CheckoutCompleted",
        payload={"tier": "premium", "email": "a@example.com"},
        error_reason="Property 'tier' must be integer.",
    )
    row_b = InvalidPayloadError(
        plan_id=plan_id,
        version_id=version_id,
        event_name="CheckoutCompleted",
        payload={"tier": "gold", "email": "b@example.com"},
        error_reason="Property 'tier' must be integer.",
    )

    material_a = service._fingerprint_material(
        plan_id=plan_id,
        row=row_a,
        violation=violation,
        source_metadata={"source_label": "ios"},
        expectation={"type": "integer", "constraints": {}},
    )
    material_b = service._fingerprint_material(
        plan_id=plan_id,
        row=row_b,
        violation=violation,
        source_metadata={"source_label": "ios"},
        expectation={"type": "integer", "constraints": {}},
    )

    assert service.fingerprint_for_material(material_a) == service.fingerprint_for_material(material_b)
    assert "premium" not in str(material_a)
    assert "gold" not in str(material_b)
    assert "a@example.com" not in str(material_a)
    assert "b@example.com" not in str(material_b)


def test_fingerprint_includes_safe_source_metadata():
    service = DLQGroupingService(db=None)  # type: ignore[arg-type]
    plan_id = uuid4()
    version_id = uuid4()
    violation = DLQViolation(
        code="enum_violation",
        path="properties.tier",
        property_name="tier",
        expected=["free", "paid"],
        actual="enterprise",
    )
    row = InvalidPayloadError(
        plan_id=plan_id,
        version_id=version_id,
        event_name="CheckoutCompleted",
        payload={"tier": "enterprise"},
        error_reason="Property 'tier' must be one of the allowed values.",
    )

    material_ios = service._fingerprint_material(
        plan_id=plan_id,
        row=row,
        violation=violation,
        source_metadata={"source_label": "ios", "app.version": "3.14.0"},
        expectation={"type": "string", "constraints": {"enum_values": ["free", "paid"]}},
    )
    material_web = service._fingerprint_material(
        plan_id=plan_id,
        row=row,
        violation=violation,
        source_metadata={"source_label": "web", "app.version": "3.14.0"},
        expectation={"type": "string", "constraints": {"enum_values": ["free", "paid"]}},
    )

    assert material_ios["app_version"] == "3.14.0"
    assert material_ios["actual_kind"] == "string"
    assert "enterprise" not in str(material_ios)
    assert service.fingerprint_for_material(material_ios) != service.fingerprint_for_material(material_web)
