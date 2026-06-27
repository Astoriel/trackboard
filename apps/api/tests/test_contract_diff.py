from __future__ import annotations

from copy import deepcopy

from app.services.contract_diff import diff_contracts


def _property(name: str, prop_type: str = "string", **overrides):
    payload = {
        "name": name,
        "type": prop_type,
        "required": False,
        "constraints": {},
        "description": None,
        "examples": [],
    }
    payload.update(overrides)
    return payload


def _event(name: str, **overrides):
    payload = {
        "event_name": name,
        "status": "active",
        "description": None,
        "category": None,
        "properties": [_property("method", constraints={"enum_values": ["google", "email"]})],
        "global_properties": [],
    }
    payload.update(overrides)
    return payload


def _snapshot(**overrides):
    payload = {
        "events": [_event("signup_completed")],
        "global_properties": [],
    }
    payload.update(overrides)
    return payload


def _codes(diff):
    return [change["code"] for change in diff["changes"]]


def test_diff_flags_removed_event_as_breaking():
    before = _snapshot(events=[_event("signup_completed")])
    after = _snapshot(events=[])

    diff = diff_contracts(before, after)

    assert diff["breaking"] is True
    assert diff["summary"]["breaking_count"] == 1
    assert "event_removed" in _codes(diff)


def test_diff_flags_removed_property_as_breaking():
    before = _snapshot()
    after = _snapshot(events=[_event("signup_completed", properties=[])])

    diff = diff_contracts(before, after)

    assert diff["breaking"] is True
    assert "property_removed" in _codes(diff)


def test_diff_flags_type_required_and_enum_removal_as_breaking():
    before = _snapshot()
    after = deepcopy(before)
    prop = after["events"][0]["properties"][0]
    prop["type"] = "integer"
    prop["required"] = True
    prop["constraints"] = {"enum_values": ["google"]}

    diff = diff_contracts(before, after)

    assert diff["breaking"] is True
    assert "property_type_changed" in _codes(diff)
    assert "property_became_required" in _codes(diff)
    assert "enum_value_removed" in _codes(diff)


def test_diff_marks_added_event_and_optional_property_as_safe():
    before = _snapshot()
    after = _snapshot(
        events=[
            _event("signup_completed", properties=[
                _property("method"),
                _property("campaign"),
            ]),
            _event("checkout_completed"),
        ]
    )

    diff = diff_contracts(before, after)

    assert diff["summary"]["safe_count"] == 2
    assert "event_added" in _codes(diff)
    assert "optional_property_added" in _codes(diff)


def test_diff_marks_description_changes_as_informational():
    before = _snapshot()
    after = _snapshot(
        events=[
            _event(
                "signup_completed",
                description="New description",
                properties=[
                    _property(
                        "method",
                        constraints={"enum_values": ["google", "email"]},
                        description="New property docs",
                    )
                ],
            )
        ]
    )

    diff = diff_contracts(before, after)

    assert diff["breaking"] is False
    assert diff["summary"]["informational_count"] == 2
    assert "event_description_changed" in _codes(diff)
    assert "property_description_changed" in _codes(diff)
