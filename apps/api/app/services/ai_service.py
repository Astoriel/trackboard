import json
from uuid import UUID

from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import BadRequestError, NotFoundError
from app.core.secret_store import decrypt_secret
from app.models import Organization, TrackingPlan
from app.services.semantic_consistency import SemanticConsistencyService


class AIService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _client_for_org(self, org_id: UUID | None) -> tuple[AsyncOpenAI, str]:
        kwargs = {}
        model = "gpt-4o-mini"

        if org_id is not None:
            org = await self.db.get(Organization, org_id)
            config = (org.settings or {}).get("ai_provider") if org is not None else None
            if config and config.get("enabled"):
                if config.get("base_url"):
                    kwargs["base_url"] = config["base_url"]
                api_key = decrypt_secret(config.get("api_key"))
                if api_key:
                    kwargs["api_key"] = api_key
                model = config.get("model") or model

        if not kwargs:
            if settings.openai_base_url:
                kwargs["base_url"] = settings.openai_base_url
                model = "local-model"
            if settings.openai_api_key:
                kwargs["api_key"] = settings.openai_api_key

        if not kwargs.get("api_key"):
            raise BadRequestError(
                "AI provider is not configured. Add a custom endpoint/key in organization settings.",
                code="ai_provider_not_configured",
            )

        return AsyncOpenAI(**kwargs), model

    async def generate_schema_from_json(self, json_payload: str, org_id: UUID | None = None) -> dict:
        prompt = f"""
We have a raw JSON payload representing a tracking event.
Generate a strictly typed EventSchema representing it.
Identify the likely event name and category.
For each property, determine its type (string, integer, float, boolean, array, object) and whether it is realistically required.
Output strictly as a JSON object:
{{
  "event_name": "example_event",
  "description": "Event description",
  "category": "category name",
  "properties": [
    {{
      "name": "prop1",
      "type": "string",
      "required": true
    }}
  ]
}}

Raw Payload:
{json_payload}
"""
        client, model = await self._client_for_org(org_id)
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        return json.loads(response.choices[0].message.content or "{}")

    async def analyze_schema_duplicates(self, plan_id: UUID, org_id: UUID | None = None) -> dict:
        plan = await self.db.get(TrackingPlan, plan_id)
        if plan is None:
            raise NotFoundError("Plan")

        findings = await SemanticConsistencyService(self.db).audit_plan(plan_id)
        duplicates = []
        for finding in findings:
            candidate = finding["candidate"]
            duplicates.append(
                {
                    "event_a": finding["event_name"],
                    "event_b": candidate.event_name,
                    "confidence": "high" if candidate.label == "duplicate_likely" else "medium",
                    "reason": "; ".join(item.detail for item in candidate.evidence[:3]),
                    "score": candidate.score,
                    "label": candidate.label,
                    "score_breakdown": candidate.score_breakdown,
                    "evidence": [
                        {"kind": item.kind, "detail": item.detail, "weight": item.weight}
                        for item in candidate.evidence
                    ],
                }
            )
        return {"duplicates": duplicates}

    async def triage_dlq_issue(self, input_package: dict, org_id: UUID | None = None) -> dict:
        prompt = f"""
You are a DLQ analyst for a tracking-plan validation system.
Use only the evidence in the JSON package. Raw payloads have been removed or redacted.
Do not infer facts that are not present. Do not recommend sending PII.
If you recommend a contract change, explain the tradeoff.
Output JSON only with this shape:
{{
  "summary": "short human summary",
  "confidence": "low|medium|high",
  "likely_root_cause": "string",
  "evidence": ["string"],
  "recommended_actions": [
    {{
      "kind": "fix_instrumentation|update_contract|investigate_source|ignore_noise",
      "title": "string",
      "rationale": "string",
      "risk": "low|medium|high"
    }}
  ],
  "questions": ["string"]
}}

Evidence package:
{json.dumps(input_package, indent=2, sort_keys=True, default=str)}
"""
        client, model = await self._client_for_org(org_id)
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "You produce evidence-bound JSON triage reports for validation DLQ groups.",
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        payload = json.loads(response.choices[0].message.content or "{}")
        if isinstance(payload, dict):
            payload["_model"] = model
        return payload
