import json
from uuid import UUID

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.exceptions import BadRequestError, NotFoundError
from app.core.secret_store import decrypt_secret
from app.models import Organization, TrackingPlan


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
        result = await self.db.execute(
            select(TrackingPlan).options(selectinload(TrackingPlan.events)).where(TrackingPlan.id == plan_id)
        )
        plan = result.scalar_one_or_none()
        if not plan:
            raise NotFoundError("Plan")

        events = [{"id": str(e.id), "name": e.event_name, "desc": e.description} for e in plan.events]
        if len(events) < 2:
            return {"duplicates": []}

        prompt = f"""
We have {len(events)} tracking events. Identify any pairs that are highly likely to be duplicates or represent the exact same semantic action.
Output strictly as JSON:
{{
  "duplicates": [
    {{
      "event_a": "name1",
      "event_b": "name2",
      "confidence": "high",
      "reason": "explanation"
    }}
  ]
}}

Events list:
{json.dumps(events, indent=2)}
"""
        client, model = await self._client_for_org(org_id)
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        return json.loads(response.choices[0].message.content or '{"duplicates": []}')
