from app.services.validation_engine import validate_payload


def _snapshot() -> dict:
    return {
        "name": "Validation Snapshot",
        "global_properties": [],
        "events": [
            {
                "event_name": "signup_completed",
                "properties": [
                    {
                        "name": "method",
                        "type": "string",
                        "required": True,
                        "constraints": {"enum_values": ["google", "email"]},
                    },
                    {
                        "name": "age",
                        "type": "integer",
                        "required": False,
                        "constraints": {"min": 13},
                    },
                ],
                "global_properties": [],
            }
        ],
    }


def test_validation_engine_reports_unknown_event():
    result = validate_payload(
        _snapshot(),
        event_name="checkout_completed",
        payload={},
        mode="warn",
    )
    assert result["valid"] is False
    assert result["violations"][0].code == "unknown_event"


def test_validation_engine_reports_required_type_and_constraint_violations():
    result = validate_payload(
        _snapshot(),
        event_name="signup_completed",
        payload={"method": "twitter", "age": 10, "extra": True},
        mode="block",
    )
    codes = [violation.code for violation in result["violations"]]
    assert result["valid"] is False
    assert "enum_violation" in codes
    assert "min_violation" in codes
    assert "unknown_property" in codes
