from __future__ import annotations

import re
from dataclasses import dataclass, field
from itertools import combinations
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.models import EventSchema, TrackingPlan

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_CAMEL_BOUNDARY_RE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")

_LOW_SIGNAL_TOKENS = {
    "a",
    "an",
    "and",
    "at",
    "by",
    "for",
    "from",
    "in",
    "is",
    "of",
    "on",
    "the",
    "to",
    "when",
    "with",
    "event",
    "user",
    "clicked",
    "click",
}

_SYNONYMS = {
    "checkout": "commerce",
    "purchase": "commerce",
    "purchased": "commerce",
    "order": "commerce",
    "signup": "signup",
    "sign": "signup",
    "registration": "signup",
    "registered": "signup",
    "account": "account",
    "created": "created",
    "cart": "cart",
    "basket": "cart",
    "completed": "complete",
    "complete": "complete",
    "success": "complete",
    "successful": "complete",
    "finished": "complete",
    "finish": "complete",
}


@dataclass(frozen=True)
class PropertyProfile:
    name: str
    name_tokens: tuple[str, ...]
    type: str
    required: bool
    constraints: dict[str, Any] = field(default_factory=dict)
    is_global: bool = False


@dataclass(frozen=True)
class EventProfile:
    event_id: str | None
    event_name: str
    name_tokens: tuple[str, ...]
    description_tokens: tuple[str, ...]
    category: str | None
    status: str
    property_profiles: tuple[PropertyProfile, ...] = ()
    global_properties: tuple[str, ...] = ()
    implementation_guidance: dict[str, Any] | None = None


@dataclass(frozen=True)
class ConsistencyEvidence:
    kind: str
    detail: str
    weight: int


@dataclass(frozen=True)
class ConsistencyCandidate:
    event_id: str
    event_name: str
    score: int
    label: str
    recommendation: str
    score_breakdown: dict[str, int]
    evidence: tuple[ConsistencyEvidence, ...]


def tokenize(value: str | None) -> list[str]:
    if not value:
        return []
    separated = _CAMEL_BOUNDARY_RE.sub(" ", value.replace("_", " ").replace("-", " "))
    tokens = []
    for token in _TOKEN_RE.findall(separated.lower()):
        if token in _LOW_SIGNAL_TOKENS:
            continue
        tokens.append(_SYNONYMS.get(token, token))
    return tokens


def _enum_value(value: Any) -> str:
    return getattr(value, "value", str(value))


def _jaccard(left: set[str], right: set[str]) -> float:
    if not left and not right:
        return 0.0
    union = left | right
    if not union:
        return 0.0
    return len(left & right) / len(union)


def _weighted_overlap(left: set[str], right: set[str], max_weight: int) -> int:
    if not left or not right:
        return 0
    containment = len(left & right) / min(len(left), len(right))
    return round(max(_jaccard(left, right), containment) * max_weight)


def _constraint_signature(constraints: dict[str, Any]) -> set[str]:
    signature = set()
    for key, value in sorted((constraints or {}).items()):
        if isinstance(value, list):
            signature.add(f"{key}:{','.join(map(str, sorted(value)))}")
        else:
            signature.add(f"{key}:{value}")
    return signature


def _guidance_tokens(guidance: dict[str, Any] | None) -> set[str]:
    if not guidance:
        return set()
    tokens: list[str] = []
    for value in guidance.values():
        if isinstance(value, str):
            tokens.extend(tokenize(value))
        elif isinstance(value, list):
            for item in value:
                tokens.extend(tokenize(str(item)))
        elif isinstance(value, dict):
            tokens.extend(_guidance_tokens(value))
    return set(tokens)


def _label_for_score(score: int) -> str:
    if score >= 82:
        return "duplicate_likely"
    if score >= 65:
        return "possibly_related"
    return "weak_signal"


def _recommendation_for_label(label: str) -> str:
    if label == "duplicate_likely":
        return "reuse_existing_event"
    if label == "possibly_related":
        return "review_taxonomy"
    return "review_if_relevant"


class SemanticConsistencyService:
    def __init__(self, db: AsyncSession | None = None):
        self.db = db

    def build_event_profile(self, event: EventSchema) -> EventProfile:
        property_profiles = [
            PropertyProfile(
                name=prop.name,
                name_tokens=tuple(tokenize(prop.name)),
                type=_enum_value(prop.type),
                required=bool(prop.required),
                constraints=prop.constraints or {},
                is_global=False,
            )
            for prop in getattr(event, "properties", []) or []
        ]
        global_property_profiles = [
            PropertyProfile(
                name=prop.name,
                name_tokens=tuple(tokenize(prop.name)),
                type=_enum_value(prop.type),
                required=bool(prop.required),
                constraints=prop.constraints or {},
                is_global=True,
            )
            for prop in getattr(event, "global_properties", []) or []
        ]
        return EventProfile(
            event_id=str(event.id),
            event_name=event.event_name,
            name_tokens=tuple(tokenize(event.event_name)),
            description_tokens=tuple(tokenize(event.description)),
            category=event.category,
            status=_enum_value(event.status),
            property_profiles=tuple(property_profiles + global_property_profiles),
            global_properties=tuple(prop.name for prop in getattr(event, "global_properties", []) or []),
            implementation_guidance=None,
        )

    def build_proposed_profile(self, payload: Any) -> EventProfile:
        properties = []
        for prop in payload.properties:
            properties.append(
                PropertyProfile(
                    name=prop.name,
                    name_tokens=tuple(tokenize(prop.name)),
                    type=prop.type,
                    required=prop.required,
                    constraints=prop.constraints or {},
                    is_global=False,
                )
            )
        return EventProfile(
            event_id=None,
            event_name=payload.event_name,
            name_tokens=tuple(tokenize(payload.event_name)),
            description_tokens=tuple(tokenize(payload.description)),
            category=payload.category,
            status=payload.status,
            property_profiles=tuple(properties),
            global_properties=tuple(payload.global_properties),
            implementation_guidance=payload.implementation_guidance or None,
        )

    def score_candidate(
        self,
        proposed: EventProfile,
        existing: EventProfile,
    ) -> ConsistencyCandidate:
        breakdown: dict[str, int] = {}
        evidence: list[ConsistencyEvidence] = []

        proposed_name_tokens = set(proposed.name_tokens)
        existing_name_tokens = set(existing.name_tokens)
        name_score = _weighted_overlap(proposed_name_tokens, existing_name_tokens, 25)
        if proposed.event_name.lower() == existing.event_name.lower():
            name_score = 25
        breakdown["name_similarity"] = name_score
        if name_score:
            shared = sorted(proposed_name_tokens & existing_name_tokens)
            evidence.append(
                ConsistencyEvidence(
                    kind="name_similarity",
                    detail=(
                        f"{proposed.event_name} shares normalized name tokens with "
                        f"{existing.event_name}: {', '.join(shared) or 'exact name match'}"
                    ),
                    weight=name_score,
                )
            )

        description_score = _weighted_overlap(
            set(proposed.description_tokens) | _guidance_tokens(proposed.implementation_guidance),
            set(existing.description_tokens) | _guidance_tokens(existing.implementation_guidance),
            15,
        )
        breakdown["description_similarity"] = description_score
        if description_score:
            evidence.append(
                ConsistencyEvidence(
                    kind="description_similarity",
                    detail="description or guidance text has overlapping normalized terms",
                    weight=description_score,
                )
            )

        proposed_props = {prop.name: prop for prop in proposed.property_profiles}
        existing_props = {prop.name: prop for prop in existing.property_profiles}
        proposed_prop_names = set(proposed_props)
        existing_prop_names = set(existing_props)
        shared_props = proposed_prop_names & existing_prop_names

        property_score = _weighted_overlap(proposed_prop_names, existing_prop_names, 20)
        breakdown["property_overlap"] = property_score
        if property_score:
            evidence.append(
                ConsistencyEvidence(
                    kind="property_overlap",
                    detail=(
                        f"{len(shared_props)} shared properties: "
                        f"{', '.join(sorted(shared_props))}"
                    ),
                    weight=property_score,
                )
            )

        proposed_required = {prop.name for prop in proposed.property_profiles if prop.required}
        existing_required = {prop.name for prop in existing.property_profiles if prop.required}
        shared_required = proposed_required & existing_required
        required_score = _weighted_overlap(proposed_required, existing_required, 10)
        breakdown["required_property_overlap"] = required_score
        if required_score:
            evidence.append(
                ConsistencyEvidence(
                    kind="required_property_overlap",
                    detail=(
                        f"{len(shared_required)} required properties overlap: "
                        f"{', '.join(sorted(shared_required))}"
                    ),
                    weight=required_score,
                )
            )

        compatible_types = [
            name
            for name in shared_props
            if proposed_props[name].type == existing_props[name].type
        ]
        type_score = round((len(compatible_types) / len(shared_props)) * 10) if shared_props else 0
        breakdown["type_compatibility"] = type_score
        if type_score:
            evidence.append(
                ConsistencyEvidence(
                    kind="type_compatibility",
                    detail=f"{len(compatible_types)} shared properties use compatible types",
                    weight=type_score,
                )
            )

        proposed_constraints = set().union(
            *[_constraint_signature(prop.constraints) for prop in proposed.property_profiles]
        ) if proposed.property_profiles else set()
        existing_constraints = set().union(
            *[_constraint_signature(prop.constraints) for prop in existing.property_profiles]
        ) if existing.property_profiles else set()
        constraint_score = _weighted_overlap(proposed_constraints, existing_constraints, 5)
        breakdown["constraint_overlap"] = constraint_score
        if constraint_score:
            evidence.append(
                ConsistencyEvidence(
                    kind="constraint_overlap",
                    detail="property constraints have overlapping expected values or limits",
                    weight=constraint_score,
                )
            )

        category_status_score = 0
        if proposed.category and existing.category and proposed.category.lower() == existing.category.lower():
            category_status_score += 3
        if proposed.status and existing.status and proposed.status == existing.status:
            category_status_score += 2
        breakdown["category_status_match"] = category_status_score
        if category_status_score:
            evidence.append(
                ConsistencyEvidence(
                    kind="category_status_match",
                    detail="category or lifecycle status matches",
                    weight=category_status_score,
                )
            )

        lifecycle_score = _weighted_overlap(
            _guidance_tokens(proposed.implementation_guidance),
            _guidance_tokens(existing.implementation_guidance),
            10,
        )
        breakdown["lifecycle_source_match"] = lifecycle_score
        if lifecycle_score:
            evidence.append(
                ConsistencyEvidence(
                    kind="lifecycle_source_match",
                    detail="implementation guidance refers to similar trigger/source terms",
                    weight=lifecycle_score,
                )
            )

        score = min(100, sum(breakdown.values()))
        label = _label_for_score(score)
        return ConsistencyCandidate(
            event_id=existing.event_id or "",
            event_name=existing.event_name,
            score=score,
            label=label,
            recommendation=_recommendation_for_label(label),
            score_breakdown=breakdown,
            evidence=tuple(evidence),
        )

    def compare_against_events(
        self,
        proposed: EventProfile,
        existing_profiles: list[EventProfile],
        *,
        threshold: int = 50,
    ) -> list[ConsistencyCandidate]:
        candidates = [
            self.score_candidate(proposed, existing)
            for existing in existing_profiles
            if existing.event_id != proposed.event_id
        ]
        return sorted(
            [candidate for candidate in candidates if candidate.score >= threshold],
            key=lambda candidate: (
                -candidate.score,
                0 if candidate.event_name.lower() == proposed.event_name.lower() else 1,
                candidate.event_name.lower(),
            ),
        )

    async def _load_plan(self, plan_id: UUID) -> TrackingPlan:
        if self.db is None:
            raise RuntimeError("Database session is required.")
        result = await self.db.execute(
            select(TrackingPlan)
            .options(
                selectinload(TrackingPlan.events).selectinload(EventSchema.properties),
                selectinload(TrackingPlan.events).selectinload(EventSchema.global_properties),
            )
            .where(TrackingPlan.id == plan_id)
        )
        plan = result.scalar_one_or_none()
        if plan is None:
            raise NotFoundError("Plan")
        return plan

    async def preview(self, plan_id: UUID, payload: Any) -> tuple[EventProfile, list[ConsistencyCandidate]]:
        plan = await self._load_plan(plan_id)
        proposed = self.build_proposed_profile(payload)
        existing = [self.build_event_profile(event) for event in plan.events or []]
        return proposed, self.compare_against_events(proposed, existing)

    async def event_consistency(self, event_id: UUID) -> tuple[EventProfile, list[ConsistencyCandidate]]:
        if self.db is None:
            raise RuntimeError("Database session is required.")
        result = await self.db.execute(
            select(EventSchema)
            .options(
                selectinload(EventSchema.properties),
                selectinload(EventSchema.global_properties),
            )
            .where(EventSchema.id == event_id)
        )
        event = result.scalar_one_or_none()
        if event is None:
            raise NotFoundError("Event", code="event_not_found")

        plan = await self._load_plan(event.plan_id)
        proposed = self.build_event_profile(event)
        existing = [self.build_event_profile(plan_event) for plan_event in plan.events or []]
        return proposed, self.compare_against_events(proposed, existing)

    async def audit_plan(self, plan_id: UUID) -> list[dict[str, Any]]:
        plan = await self._load_plan(plan_id)
        profiles = [self.build_event_profile(event) for event in plan.events or []]
        findings = []
        for left, right in combinations(profiles, 2):
            candidate = self.score_candidate(left, right)
            if candidate.score >= 50:
                findings.append(
                    {
                        "event_id": left.event_id,
                        "event_name": left.event_name,
                        "candidate": candidate,
                    }
                )
        return sorted(
            findings,
            key=lambda finding: (-finding["candidate"].score, finding["event_name"].lower()),
        )

    async def merge_request_consistency(
        self,
        *,
        main_plan_id: UUID,
        branch_plan_id: UUID,
        changed_event_names: set[str] | None = None,
    ) -> list[dict[str, Any]]:
        main_plan = await self._load_plan(main_plan_id)
        branch_plan = await self._load_plan(branch_plan_id)
        if branch_plan.parent_plan_id != main_plan.id:
            raise ConflictError("Branch does not belong to the target plan.", code="invalid_merge_branch")

        changed_names = {name.lower() for name in changed_event_names or set()}
        main_profiles = [self.build_event_profile(event) for event in main_plan.events or []]
        branch_profiles = [self.build_event_profile(event) for event in branch_plan.events or []]
        findings: list[dict[str, Any]] = []

        for branch_profile in branch_profiles:
            if changed_names and branch_profile.event_name.lower() not in changed_names:
                continue
            comparable_main_profiles = [
                profile
                for profile in main_profiles
                if profile.event_name.lower() != branch_profile.event_name.lower()
            ]
            for candidate in self.compare_against_events(branch_profile, comparable_main_profiles):
                findings.append(
                    {
                        "event_id": branch_profile.event_id,
                        "event_name": branch_profile.event_name,
                        "candidate": candidate,
                    }
                )

        return sorted(
            findings,
            key=lambda finding: (-finding["candidate"].score, finding["event_name"].lower()),
        )
