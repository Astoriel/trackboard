from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass
from typing import Any

FORMAT_VERSION = "trackboard.contract.v1"
ALLOWED_PROPERTY_TYPES = {"string", "integer", "float", "boolean", "array", "object"}
ALLOWED_GUIDANCE_LOCATIONS = {"client", "server", "edge", "mobile", "backend_job", "unknown"}
GUIDANCE_ARRAY_FIELDS = {"trigger_when", "do_not_trigger_when", "privacy_notes"}
GUIDANCE_STRING_FIELDS = {"required_source", "lifecycle_stage", "idempotency_key"}
GUIDANCE_ALLOWED_FIELDS = {
    *GUIDANCE_ARRAY_FIELDS,
    *GUIDANCE_STRING_FIELDS,
    "preferred_location",
    "code_examples",
}
MAX_GUIDANCE_STRING_LENGTH = 500
MAX_GUIDANCE_ARRAY_LENGTH = 20
MAX_GUIDANCE_SNIPPET_LENGTH = 2000


class ContractFormatError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class ContractProperty:
    name: str
    type: str
    required: bool
    constraints: dict[str, Any]


@dataclass(frozen=True)
class ContractEvent:
    event_name: str
    properties: dict[str, ContractProperty]
    implementation_guidance: dict[str, Any] | None = None


@dataclass(frozen=True)
class Contract:
    raw: dict[str, Any]
    events: dict[str, ContractEvent]
    global_properties: dict[str, ContractProperty]
    hash: str


def parse_contract(raw: dict[str, Any]) -> Contract:
    normalized = normalize_contract(raw)
    global_properties = {
        prop["name"]: _property_from_dict(prop) for prop in normalized.get("global_properties", [])
    }
    events: dict[str, ContractEvent] = {}
    for event in normalized.get("events", []):
        property_map = {
            prop["name"]: _property_from_dict(prop) for prop in event.get("properties", [])
        }
        for global_name in event.get("global_properties", []):
            property_map[global_name] = global_properties[global_name]
        events[event["event_name"]] = ContractEvent(
            event_name=event["event_name"],
            properties=property_map,
            implementation_guidance=event.get("implementation_guidance"),
        )
    return Contract(
        raw=normalized,
        events=events,
        global_properties=global_properties,
        hash=contract_hash(normalized),
    )


def normalize_contract(raw: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ContractFormatError("invalid_contract", "Contract must be a JSON object.")
    if raw.get("format_version") != FORMAT_VERSION:
        raise ContractFormatError(
            "unsupported_format_version",
            f"Contract format_version must be {FORMAT_VERSION}.",
        )

    normalized = {
        "format_version": FORMAT_VERSION,
        "plan_id": raw.get("plan_id"),
        "version_id": raw.get("version_id"),
        "version_number": raw.get("version_number"),
        "name": raw.get("name"),
        "description": raw.get("description"),
        "published_at": raw.get("published_at"),
        "global_properties": _normalize_properties(
            raw.get("global_properties", []),
            duplicate_code="duplicate_global_property",
        ),
        "events": _normalize_events(raw.get("events", []), raw.get("global_properties", [])),
    }
    return normalized


def contract_hash(normalized: dict[str, Any]) -> str:
    canonical = deepcopy(normalized)
    canonical.pop("hash", None)
    encoded = json.dumps(
        canonical,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def _normalize_events(events: Any, global_properties: Any) -> list[dict[str, Any]]:
    if not isinstance(events, list):
        raise ContractFormatError("invalid_events", "events must be a list.")
    global_names = {
        prop["name"]
        for prop in _normalize_properties(
            global_properties,
            duplicate_code="duplicate_global_property",
        )
    }
    seen: set[str] = set()
    normalized = []
    for index, event in enumerate(events):
        if not isinstance(event, dict):
            raise ContractFormatError("invalid_event", "Each event must be an object.")
        event_name = event.get("event_name")
        if not event_name or not isinstance(event_name, str):
            raise ContractFormatError(
                "invalid_event_name", "Event name must be a non-empty string."
            )
        if event_name in seen:
            raise ContractFormatError("duplicate_event", f"Duplicate event '{event_name}'.")
        seen.add(event_name)

        properties = _normalize_properties(
            event.get("properties", []),
            duplicate_code="duplicate_property",
        )
        linked_globals = event.get("global_properties", [])
        if not isinstance(linked_globals, list):
            raise ContractFormatError("invalid_global_links", "global_properties must be a list.")
        linked_global_names = sorted(linked_globals)
        local_names = {prop["name"] for prop in properties}
        for global_name in linked_global_names:
            if global_name not in global_names:
                raise ContractFormatError(
                    "unknown_global_property",
                    f"Event '{event_name}' links unknown global property '{global_name}'.",
                )
            if global_name in local_names:
                raise ContractFormatError(
                    "duplicate_merged_property",
                    f"Event '{event_name}' has both local and global property '{global_name}'.",
                )

        normalized_event = {
            "event_name": event_name,
            "status": event.get("status", "active"),
            "description": event.get("description"),
            "category": event.get("category"),
            "sort_order": event.get("sort_order", index),
            "properties": properties,
            "global_properties": linked_global_names,
        }
        guidance = event.get("implementation_guidance")
        if guidance is not None:
            normalized_event["implementation_guidance"] = _normalize_implementation_guidance(
                guidance,
                event_name=event_name,
            )
        normalized.append(normalized_event)
    return sorted(normalized, key=lambda item: item["event_name"])


def _normalize_properties(properties: Any, *, duplicate_code: str) -> list[dict[str, Any]]:
    if not isinstance(properties, list):
        raise ContractFormatError("invalid_properties", "properties must be a list.")
    seen: set[str] = set()
    normalized = []
    for prop in properties:
        if not isinstance(prop, dict):
            raise ContractFormatError("invalid_property", "Each property must be an object.")
        name = prop.get("name")
        if not name or not isinstance(name, str):
            raise ContractFormatError(
                "invalid_property_name", "Property name must be a non-empty string."
            )
        if name in seen:
            raise ContractFormatError(duplicate_code, f"Duplicate property '{name}'.")
        seen.add(name)

        prop_type = prop.get("type")
        if prop_type not in ALLOWED_PROPERTY_TYPES:
            raise ContractFormatError(
                "invalid_property_type",
                f"Property '{name}' has unsupported type '{prop_type}'.",
            )
        required = prop.get("required", False)
        if not isinstance(required, bool):
            raise ContractFormatError(
                "invalid_required_flag",
                f"Property '{name}' required must be boolean.",
            )
        constraints = prop.get("constraints") or {}
        if not isinstance(constraints, dict):
            raise ContractFormatError(
                "invalid_constraints",
                f"Property '{name}' constraints must be an object.",
            )
        examples = prop.get("examples") or []
        if not isinstance(examples, list):
            raise ContractFormatError(
                "invalid_examples",
                f"Property '{name}' examples must be a list.",
            )

        normalized.append(
            {
                "name": name,
                "type": prop_type,
                "required": required,
                "constraints": _normalize_constraints(constraints),
                "description": prop.get("description"),
                "examples": examples,
            }
        )
    return sorted(normalized, key=lambda item: item["name"])


def _normalize_constraints(constraints: dict[str, Any]) -> dict[str, Any]:
    normalized = deepcopy(constraints)
    enum_values = normalized.get("enum_values", normalized.get("enum"))
    if enum_values is not None:
        if not isinstance(enum_values, list):
            raise ContractFormatError("invalid_enum_values", "enum_values must be a list.")
        normalized["enum_values"] = sorted(enum_values, key=lambda value: str(value))
        normalized.pop("enum", None)
    return dict(sorted(normalized.items()))


def _normalize_implementation_guidance(guidance: Any, *, event_name: str) -> dict[str, Any]:
    if not isinstance(guidance, dict):
        raise ContractFormatError(
            "invalid_implementation_guidance",
            f"Event '{event_name}' implementation_guidance must be an object.",
        )

    unknown_fields = sorted(set(guidance) - GUIDANCE_ALLOWED_FIELDS)
    if unknown_fields:
        raise ContractFormatError(
            "unknown_implementation_guidance_field",
            f"Event '{event_name}' implementation_guidance has unknown field '{unknown_fields[0]}'.",
        )

    normalized: dict[str, Any] = {}
    for field in sorted(GUIDANCE_ARRAY_FIELDS):
        normalized[field] = _normalize_guidance_string_array(
            guidance.get(field, []),
            event_name=event_name,
            field=field,
        )

    preferred_location = guidance.get("preferred_location", "unknown")
    if preferred_location not in ALLOWED_GUIDANCE_LOCATIONS:
        raise ContractFormatError(
            "invalid_preferred_location",
            f"Event '{event_name}' implementation_guidance preferred_location is invalid.",
        )
    normalized["preferred_location"] = preferred_location

    for field in sorted(GUIDANCE_STRING_FIELDS):
        normalized[field] = _normalize_optional_guidance_string(
            guidance.get(field),
            event_name=event_name,
            field=field,
        )

    code_examples = guidance.get("code_examples", [])
    if not isinstance(code_examples, list):
        raise ContractFormatError(
            "invalid_code_examples",
            f"Event '{event_name}' implementation_guidance code_examples must be a list.",
        )
    if len(code_examples) > MAX_GUIDANCE_ARRAY_LENGTH:
        raise ContractFormatError(
            "implementation_guidance_too_many_items",
            f"Event '{event_name}' implementation_guidance code_examples has too many items.",
        )
    normalized["code_examples"] = [
        _normalize_code_example(example, event_name=event_name) for example in code_examples
    ]

    return dict(sorted(normalized.items()))


def _normalize_guidance_string_array(value: Any, *, event_name: str, field: str) -> list[str]:
    if not isinstance(value, list):
        raise ContractFormatError(
            "invalid_implementation_guidance_field",
            f"Event '{event_name}' implementation_guidance {field} must be a list.",
        )
    if len(value) > MAX_GUIDANCE_ARRAY_LENGTH:
        raise ContractFormatError(
            "implementation_guidance_too_many_items",
            f"Event '{event_name}' implementation_guidance {field} has too many items.",
        )
    return [
        _normalize_required_guidance_string(item, event_name=event_name, field=field)
        for item in value
    ]


def _normalize_optional_guidance_string(value: Any, *, event_name: str, field: str) -> str | None:
    if value is None:
        return None
    return _normalize_required_guidance_string(value, event_name=event_name, field=field)


def _normalize_required_guidance_string(value: Any, *, event_name: str, field: str) -> str:
    if not isinstance(value, str):
        raise ContractFormatError(
            "invalid_implementation_guidance_field",
            f"Event '{event_name}' implementation_guidance {field} must be a string.",
        )
    if len(value) > MAX_GUIDANCE_STRING_LENGTH:
        raise ContractFormatError(
            "implementation_guidance_string_too_long",
            f"Event '{event_name}' implementation_guidance {field} is too long.",
        )
    return value


def _normalize_code_example(example: Any, *, event_name: str) -> dict[str, Any]:
    if not isinstance(example, dict):
        raise ContractFormatError(
            "invalid_code_example",
            f"Event '{event_name}' implementation_guidance code_examples entries must be objects.",
        )
    unknown_fields = sorted(set(example) - {"language", "framework", "snippet"})
    if unknown_fields:
        raise ContractFormatError(
            "unknown_code_example_field",
            f"Event '{event_name}' implementation_guidance code_example has unknown field '{unknown_fields[0]}'.",
        )
    language = _normalize_required_guidance_string(
        example.get("language"),
        event_name=event_name,
        field="code_examples.language",
    )
    framework = _normalize_optional_guidance_string(
        example.get("framework"),
        event_name=event_name,
        field="code_examples.framework",
    )
    snippet = example.get("snippet")
    if not isinstance(snippet, str):
        raise ContractFormatError(
            "invalid_implementation_guidance_field",
            f"Event '{event_name}' implementation_guidance code_examples.snippet must be a string.",
        )
    if len(snippet) > MAX_GUIDANCE_SNIPPET_LENGTH:
        raise ContractFormatError(
            "implementation_guidance_snippet_too_long",
            f"Event '{event_name}' implementation_guidance code_examples.snippet is too long.",
        )
    normalized = {
        "language": language,
        "framework": framework,
        "snippet": snippet,
    }
    return dict(sorted(normalized.items()))


def _property_from_dict(prop: dict[str, Any]) -> ContractProperty:
    return ContractProperty(
        name=prop["name"],
        type=prop["type"],
        required=prop["required"],
        constraints=prop["constraints"],
    )
