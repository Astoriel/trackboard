from app.services.version_service import VersionService


def test_compatibility_report_flags_breaking_changes():
    previous_snapshot = {
        "events": [
            {
                "event_name": "signup_completed",
                "status": "active",
                "properties": [
                    {
                        "name": "method",
                        "type": "string",
                        "required": False,
                        "constraints": {"enum_values": ["google", "email", "apple"]},
                    }
                ],
                "global_properties": [],
            }
        ],
        "global_properties": [],
    }
    current_snapshot = {
        "events": [
            {
                "event_name": "signup_completed",
                "status": "active",
                "properties": [
                    {
                        "name": "method",
                        "type": "integer",
                        "required": True,
                        "constraints": {"enum_values": ["google"]},
                    }
                ],
                "global_properties": [],
            }
        ],
        "global_properties": [],
    }

    service = VersionService(db=None)  # type: ignore[arg-type]
    report = service._build_compatibility_report(previous_snapshot, current_snapshot)

    assert report["breaking"] is True
    codes = [check["code"] for check in report["checks"]]
    assert "property_type_changed" in codes
    assert "property_became_required" in codes
    assert "enum_value_removed" in codes
