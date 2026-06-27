from __future__ import annotations

from typing import Any

from app.schemas.tracking_plan import ViolationResponse
from app.services.snapshot_service import build_event_property_map


def validate_payload(
    snapshot: dict[str, Any],
    *,
    event_name: str,
    payload: dict[str, Any],
    mode: str = "warn",
) -> dict[str, Any]:
    del mode
    violations: list[ViolationResponse] = []
    event = _find_event(snapshot, event_name)
    if event is None:
        violations.append(
            _violation(
                "unknown_event",
                f"Event '{event_name}' is not defined in the tracking plan.",
                path="event",
                event_name=event_name,
                actual=event_name,
            )
        )
        return {"valid": False, "violations": violations}

    property_map = build_event_property_map(snapshot, event)

    for prop_name, prop in property_map.items():
        if prop.get("required", False) and payload.get(prop_name) is None:
            violations.append(
                _violation(
                    "missing_required_property",
                    f"Required property '{prop_name}' is missing.",
                    path=f"properties.{prop_name}",
                    event_name=event_name,
                    property_name=prop_name,
                    expected=prop.get("type"),
                )
            )

    for prop_name, value in payload.items():
        prop = property_map.get(prop_name)
        if prop is None:
            violations.append(
                _violation(
                    "unknown_property",
                    f"Property '{prop_name}' is not defined for event '{event_name}'.",
                    path=f"properties.{prop_name}",
                    event_name=event_name,
                    property_name=prop_name,
                    actual=value,
                )
            )
            continue
        if value is None:
            continue

        expected_type = str(prop.get("type", "string"))
        if not _matches_type(value, expected_type):
            violations.append(
                _violation(
                    "type_mismatch",
                    f"Property '{prop_name}' must be {expected_type}.",
                    path=f"properties.{prop_name}",
                    event_name=event_name,
                    property_name=prop_name,
                    expected=expected_type,
                    actual=_actual_type(value),
                )
            )
            continue

        violations.extend(_validate_constraints(event_name, prop_name, value, prop.get("constraints") or {}))

    return {"valid": not violations, "violations": violations}


def _find_event(snapshot: dict[str, Any], event_name: str) -> dict[str, Any] | None:
    for event in snapshot.get("events", []):
        if event.get("event_name") == event_name:
            return event
    return None


def _matches_type(value: Any, expected_type: str) -> bool:
    if expected_type == "string":
        return isinstance(value, str)
    if expected_type == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected_type == "float":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected_type == "boolean":
        return isinstance(value, bool)
    if expected_type == "array":
        return isinstance(value, list)
    if expected_type == "object":
        return isinstance(value, dict)
    return True


def _actual_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "float"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _validate_constraints(
    event_name: str,
    prop_name: str,
    value: Any,
    constraints: dict[str, Any],
) -> list[ViolationResponse]:
    violations: list[ViolationResponse] = []
    enum_values = constraints.get("enum_values", constraints.get("enum"))
    if enum_values is not None and value not in enum_values:
        violations.append(
            _violation(
                "enum_violation",
                f"Property '{prop_name}' must be one of the allowed values.",
                path=f"properties.{prop_name}",
                event_name=event_name,
                property_name=prop_name,
                expected=enum_values,
                actual=value,
            )
        )

    if "min" in constraints and _is_number(value) and value < constraints["min"]:
        violations.append(
            _violation(
                "min_violation",
                f"Property '{prop_name}' must be at least {constraints['min']}.",
                path=f"properties.{prop_name}",
                event_name=event_name,
                property_name=prop_name,
                expected=constraints["min"],
                actual=value,
            )
        )

    if "max" in constraints and _is_number(value) and value > constraints["max"]:
        violations.append(
            _violation(
                "max_violation",
                f"Property '{prop_name}' must be at most {constraints['max']}.",
                path=f"properties.{prop_name}",
                event_name=event_name,
                property_name=prop_name,
                expected=constraints["max"],
                actual=value,
            )
        )

    return violations


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _violation(
    code: str,
    message: str,
    *,
    path: str,
    event_name: str,
    property_name: str | None = None,
    expected: Any | None = None,
    actual: Any | None = None,
) -> ViolationResponse:
    return ViolationResponse(
        code=code,
        message=message,
        path=path,
        event_name=event_name,
        property_name=property_name,
        expected=expected,
        actual=actual,
    )
