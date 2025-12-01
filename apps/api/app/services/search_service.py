from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EventSchema, Property, TrackingPlan


class SearchService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def search_all(self, plan_id: UUID, query: str) -> dict:
        if not query.strip():
            return {"plan_matched": False, "events": [], "properties": []}

        search_query = func.plainto_tsquery("english", query)
        plan_stmt = select(TrackingPlan).where(
            TrackingPlan.id == plan_id,
            TrackingPlan.search_vector.op("@@")(search_query),
        )
        event_stmt = (
            select(EventSchema)
            .where(
                EventSchema.plan_id == plan_id,
                EventSchema.search_vector.op("@@")(search_query),
            )
            .order_by(EventSchema.sort_order, EventSchema.event_name)
        )
        property_stmt = (
            select(Property)
            .join(EventSchema, Property.event_id == EventSchema.id)
            .where(
                EventSchema.plan_id == plan_id,
                Property.search_vector.op("@@")(search_query),
            )
            .order_by(Property.name.asc())
        )

        plan_result = await self.db.execute(plan_stmt)
        event_result = await self.db.execute(event_stmt)
        property_result = await self.db.execute(property_stmt)

        return {
            "plan_matched": plan_result.scalar_one_or_none() is not None,
            "events": [
                {
                    "id": str(event.id),
                    "event_name": event.event_name,
                    "description": event.description,
                }
                for event in event_result.scalars().all()
            ],
            "properties": [
                {
                    "id": str(prop.id),
                    "event_id": str(prop.event_id),
                    "name": prop.name,
                    "description": prop.description,
                    "type": prop.type.value if hasattr(prop.type, "value") else prop.type,
                }
                for prop in property_result.scalars().all()
            ],
        }
