from __future__ import annotations

from typing import Any

from app.services.snapshot_service import build_event_property_map

BREAKING = "breaking"
SAFE = "safe"
INFORMATIONAL = "informational"


def diff_contracts(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    changes: list[dict[str, Any]] = []
    before_events = {event["event_name"]: event for event in before.get("events", [])}
    after_events = {event["event_name"]: event for event in after.get("events", [])}

    for event_name in sorted(set(before_events) - set(after_events)):
        changes.append(
            _change(
                BREAKING,
                "event_removed",
                event_name,
                message=f"Event '{event_name}' was removed.",
            )
        )

    for event_name in sorted(set(after_events) - set(before_events)):
        changes.append(
            _change(
                SAFE,
                "event_added",
                event_name,
                message=f"Event '{event_name}' was added.",
            )
        )

    for event_name in sorted(set(before_events) & set(after_events)):
        changes.extend(_diff_event(before, after, before_events[event_name], after_events[event_name]))

    summary = {
        "breaking_count": sum(1 for change in changes if change["severity"] == BREAKING),
        "safe_count": sum(1 for change in changes if change["severity"] == SAFE),
        "informational_count": sum(
            1 for change in changes if change["severity"] == INFORMATIONAL
        ),
    }
    return {
        "breaking": summary["breaking_count"] > 0,
        "summary": summary,
        "changes": changes,
    }


def _diff_event(
    before_snapshot: dict[str, Any],
    after_snapshot: dict[str, Any],
    before_event: dict[str, Any],
    after_event: dict[str, Any],
) -> list[dict[str, Any]]:
    event_name = before_event["event_name"]
    changes: list[dict[str, Any]] = []

    for field in ("description", "category", "status"):
        if before_event.get(field) != after_event.get(field):
            changes.append(
                _change(
                    INFORMATIONAL,
                    f"event_{field}_changed",
                    event_name,
                    before=before_event.get(field),
                    after=after_event.get(field),
                    message=f"Event '{event_name}' changed {field}.",
                )
            )

    before_props = build_event_property_map(before_snapshot, before_event)
    after_props = build_event_property_map(after_snapshot, after_event)

    for prop_name in sorted(set(before_props) - set(after_props)):
        changes.append(
            _change(
                BREAKING,
                "property_removed",
                event_name,
                property_name=prop_name,
                message=f"Property '{prop_name}' was removed from event '{event_name}'.",
            )
        )

    for prop_name in sorted(set(after_props) - set(before_props)):
        prop = after_props[prop_name]
        changes.append(
            _change(
                BREAKING if prop.get("required", False) else SAFE,
                "required_property_added" if prop.get("required", False) else "optional_property_added",
                event_name,
                property_name=prop_name,
                after=prop,
                message=f"Property '{prop_name}' was added to event '{event_name}'.",
            )
        )

    for prop_name in sorted(set(before_props) & set(after_props)):
        changes.extend(
            _diff_property(
                event_name,
                prop_name,
                before_props[prop_name],
                after_props[prop_name],
            )
        )

    return changes


def _diff_property(
    event_name: str,
    prop_name: str,
    before_prop: dict[str, Any],
    after_prop: dict[str, Any],
) -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []
    before_type = before_prop.get("type")
    after_type = after_prop.get("type")
    if before_type != after_type:
        changes.append(
            _change(
                BREAKING,
                "property_type_changed",
                event_name,
                property_name=prop_name,
                before=before_type,
                after=after_type,
                message=f"{event_name}.{prop_name} changed from {before_type} to {after_type}.",
            )
        )

    before_required = before_prop.get("required", False)
    after_required = after_prop.get("required", False)
    if not before_required and after_required:
        changes.append(
            _change(
                BREAKING,
                "property_became_required",
                event_name,
                property_name=prop_name,
                before=False,
                after=True,
                message=f"{event_name}.{prop_name} became required.",
            )
        )
    elif before_required and not after_required:
        changes.append(
            _change(
                SAFE,
                "property_became_optional",
                event_name,
                property_name=prop_name,
                before=True,
                after=False,
                message=f"{event_name}.{prop_name} became optional.",
            )
        )

    removed_values = sorted(set(_enum_values(before_prop)) - set(_enum_values(after_prop)), key=str)
    if removed_values:
        changes.append(
            _change(
                BREAKING,
                "enum_value_removed",
                event_name,
                property_name=prop_name,
                before=_enum_values(before_prop),
                after=_enum_values(after_prop),
                removed_values=removed_values,
                message=f"{event_name}.{prop_name} removed enum values.",
            )
        )

    added_values = sorted(set(_enum_values(after_prop)) - set(_enum_values(before_prop)), key=str)
    if added_values:
        changes.append(
            _change(
                SAFE,
                "enum_value_added",
                event_name,
                property_name=prop_name,
                added_values=added_values,
                message=f"{event_name}.{prop_name} added enum values.",
            )
        )

    for field in ("description", "examples"):
        if before_prop.get(field) != after_prop.get(field):
            changes.append(
                _change(
                    INFORMATIONAL,
                    f"property_{field}_changed",
                    event_name,
                    property_name=prop_name,
                    before=before_prop.get(field),
                    after=after_prop.get(field),
                    message=f"{event_name}.{prop_name} changed {field}.",
                )
            )

    return changes


def _enum_values(prop: dict[str, Any]) -> list[Any]:
    constraints = prop.get("constraints") or {}
    values = constraints.get("enum_values", constraints.get("enum", []))
    return list(values or [])


def _change(
    severity: str,
    code: str,
    event_name: str,
    *,
    property_name: str | None = None,
    before: Any | None = None,
    after: Any | None = None,
    message: str,
    **extra: Any,
) -> dict[str, Any]:
    payload = {
        "severity": severity,
        "code": code,
        "event_name": event_name,
        "message": message,
    }
    if property_name is not None:
        payload["property_name"] = property_name
    if before is not None:
        payload["before"] = before
    if after is not None:
        payload["after"] = after
    payload.update(extra)
    return payload
