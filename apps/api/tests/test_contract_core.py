from __future__ import annotations

import pytest

from app.services.contract_core import ContractFormatError, contract_hash, normalize_contract, parse_contract


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
        "properties": [],
        "global_properties": [],
    }
    payload.update(overrides)
    return payload


def _contract(**overrides):
    payload = {
        "format_version": "trackboard.contract.v1",
        "plan_id": "plan_1",
        "version_id": "version_1",
        "version_number": 1,
        "name": "Core Plan",
        "description": None,
        "published_at": "2026-06-27T12:00:00Z",
        "global_properties": [_property("user_id", required=True)],
        "events": [
            _event(
                "signup_completed",
                properties=[
                    _property(
                        "signup_method",
                        constraints={"enum": ["google", "email"]},
                    )
                ],
                global_properties=["user_id"],
            )
        ],
    }
    payload.update(overrides)
    return payload


def test_normalize_contract_sorts_events_properties_and_enum_values():
    raw = _contract(
        global_properties=[_property("z_global"), _property("a_global")],
        events=[
            _event("z_event", properties=[_property("b"), _property("a")]),
            _event(
                "a_event",
                properties=[_property("choice", constraints={"enum": ["b", "a"]})],
            ),
        ],
    )

    normalized = normalize_contract(raw)

    assert [event["event_name"] for event in normalized["events"]] == ["a_event", "z_event"]
    assert [prop["name"] for prop in normalized["global_properties"]] == ["a_global", "z_global"]
    assert [prop["name"] for prop in normalized["events"][1]["properties"]] == ["a", "b"]
    assert normalized["events"][0]["properties"][0]["constraints"] == {"enum_values": ["a", "b"]}


def test_parse_contract_builds_event_property_maps_with_global_properties():
    contract = parse_contract(_contract())

    assert contract.hash.startswith("sha256:")
    assert set(contract.events["signup_completed"].properties) == {"signup_method", "user_id"}
    assert contract.events["signup_completed"].properties["user_id"].required is True


def test_contract_hash_ignores_existing_hash_field():
    normalized = normalize_contract(_contract())
    with_hash = {**normalized, "hash": "sha256:not-real"}

    assert contract_hash(normalized) == contract_hash(with_hash)


def test_contract_core_rejects_duplicate_events():
    raw = _contract(events=[_event("signup"), _event("signup")])

    with pytest.raises(ContractFormatError) as exc:
        parse_contract(raw)

    assert exc.value.code == "duplicate_event"


def test_contract_core_rejects_duplicate_merged_properties():
    raw = _contract(
        global_properties=[_property("user_id")],
        events=[
            _event(
                "signup_completed",
                properties=[_property("user_id")],
                global_properties=["user_id"],
            )
        ],
    )

    with pytest.raises(ContractFormatError) as exc:
        parse_contract(raw)

    assert exc.value.code == "duplicate_merged_property"


def test_contract_core_rejects_invalid_property_type():
    raw = _contract(events=[_event("signup", properties=[_property("bad", "uuid")])])

    with pytest.raises(ContractFormatError) as exc:
        parse_contract(raw)

    assert exc.value.code == "invalid_property_type"


def test_contract_core_rejects_unknown_global_property_link():
    raw = _contract(events=[_event("signup", global_properties=["missing_global"])])

    with pytest.raises(ContractFormatError) as exc:
        parse_contract(raw)

    assert exc.value.code == "unknown_global_property"
