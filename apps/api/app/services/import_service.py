from __future__ import annotations

import json
from typing import Any

import yaml

from app.core.exceptions import BadRequestError
from app.schemas.tracking_plan import ImportPlanRequest

ALLOWED_TYPES = {"string", "integer", "float", "boolean", "array", "object"}


STARTER_TEMPLATE = {
    "global_properties": [
        {
            "name": "user_id",
            "type": "string",
            "required": True,
            "description": "Canonical user identifier",
            "constraints": {},
            "examples": [],
        }
    ],
    "events": [
        {
            "event_name": "page_viewed",
            "description": "A user viewed a page",
            "category": "engagement",
            "properties": [
                {
                    "name": "page_name",
                    "type": "string",
                    "required": True,
                    "description": "Human-readable page name",
                    "constraints": {},
                    "examples": [],
                }
            ],
            "global_properties": ["user_id"],
        }
    ],
}


class ImportService:
    def normalize(self, request: ImportPlanRequest) -> dict[str, Any]:
        raw_payload = self._parse_payload(request)

        warnings: list[str] = []
        raw_events = raw_payload.get("events", [])
        raw_global_properties = raw_payload.get("global_properties", [])

        normalized_global_properties = []
        seen_global_properties: set[str] = set()
        for prop in raw_global_properties:
            normalized = self._normalize_property(prop, warnings, context="global property")
            if normalized is None:
                continue
            if normalized["name"] in seen_global_properties:
                warnings.append(f"Duplicate global property '{normalized['name']}' was skipped.")
                continue
            seen_global_properties.add(normalized["name"])
            normalized_global_properties.append(normalized)

        normalized_events = []
        seen_events: set[str] = set()
        for event in raw_events:
            event_name = str(event.get("event_name", "")).strip()
            if not event_name:
                warnings.append("Skipped an event without event_name.")
                continue
            if event_name in seen_events:
                warnings.append(f"Duplicate event '{event_name}' was skipped.")
                continue
            seen_events.add(event_name)

            normalized_properties = []
            seen_properties: set[str] = set()
            for prop in event.get("properties", []):
                normalized = self._normalize_property(prop, warnings, context=f"event '{event_name}'")
                if normalized is None:
                    continue
                if normalized["name"] in seen_properties:
                    warnings.append(
                        f"Duplicate property '{normalized['name']}' in event '{event_name}' was skipped."
                    )
                    continue
                seen_properties.add(normalized["name"])
                normalized_properties.append(normalized)

            linked_global_properties = []
            for name in event.get("global_properties", []):
                global_name = str(name).strip()
                if not global_name:
                    continue
                if global_name not in seen_global_properties:
                    warnings.append(
                        f"Event '{event_name}' referenced unknown global property '{global_name}'."
                    )
                    continue
                linked_global_properties.append(global_name)

            normalized_events.append(
                {
                    "event_name": event_name,
                    "description": event.get("description"),
                    "category": event.get("category"),
                    "properties": normalized_properties,
                    "global_properties": sorted(set(linked_global_properties)),
                }
            )

        return {
            "warnings": warnings,
            "events": normalized_events,
            "global_properties": normalized_global_properties,
        }

    def _parse_payload(self, request: ImportPlanRequest) -> dict[str, Any]:
        if request.format == "template":
            return STARTER_TEMPLATE

        if request.events or request.global_properties:
            return {
                "events": [event.model_dump(mode="json") for event in request.events],
                "global_properties": [prop.model_dump(mode="json") for prop in request.global_properties],
            }

        if request.data is None:
            raise BadRequestError("Import payload is empty.", code="empty_import_payload")

        if request.format == "structured":
            if isinstance(request.data, list):
                return {"events": request.data, "global_properties": []}
            if isinstance(request.data, dict):
                return request.data
            raise BadRequestError("Structured imports must be a JSON object or array.")

        if request.format == "json":
            if isinstance(request.data, (dict, list)):
                parsed = request.data
            else:
                parsed = json.loads(str(request.data))
            return parsed if isinstance(parsed, dict) else {"events": parsed, "global_properties": []}

        if request.format == "yaml":
            parsed = yaml.safe_load(str(request.data))
            if isinstance(parsed, dict):
                return parsed
            if isinstance(parsed, list):
                return {"events": parsed, "global_properties": []}
            raise BadRequestError("YAML import must parse to an object or array.")

        raise BadRequestError(f"Unsupported import format '{request.format}'.")

    def _normalize_property(
        self,
        raw_property: dict[str, Any],
        warnings: list[str],
        *,
        context: str,
    ) -> dict[str, Any] | None:
        name = str(raw_property.get("name", "")).strip()
        prop_type = str(raw_property.get("type", "")).strip().lower()

        if not name:
            warnings.append(f"Skipped a {context} property without a name.")
            return None
        if prop_type not in ALLOWED_TYPES:
            warnings.append(
                f"Skipped property '{name}' in {context} because type '{prop_type}' is unsupported."
            )
            return None

        return {
            "name": name,
            "description": raw_property.get("description"),
            "type": prop_type,
            "required": bool(raw_property.get("required", False)),
            "constraints": raw_property.get("constraints", {}) or {},
            "examples": raw_property.get("examples", []) or [],
        }
