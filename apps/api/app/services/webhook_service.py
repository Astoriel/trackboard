import httpx
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Webhook, WebhookDelivery

class WebhookService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def dispatch_event(self, plan_id: UUID, event_type: str, payload: dict):
        """
        Finds active webhooks for the plan subscribed to the given event_type
        and queues delivery. For simplicity, we dispatch synchronously here, 
        but normally this would use BackgroundTasks or Celery.
        """
        stmt = select(Webhook).where(
            Webhook.plan_id == plan_id,
            Webhook.is_active == True
        )
        result = await self.db.execute(stmt)
        webhooks = result.scalars().all()
        
        # Filter by event
        active_hooks = [wh for wh in webhooks if event_type in wh.events or "*" in wh.events]
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            for hook in active_hooks:
                delivery = WebhookDelivery(
                    webhook_id=hook.id,
                    payload=payload,
                    status_code=None,
                    success=False
                )
                self.db.add(delivery)
                await self.db.flush()
                
                try:
                    headers = {"Content-Type": "application/json"}
                    if hook.secret:
                        headers["X-Webhook-Secret"] = hook.secret
                        
                    response = await client.post(hook.url, json=payload, headers=headers)
                    delivery.status_code = response.status_code
                    delivery.response_body = response.text[:2000] # truncate
                    delivery.success = 200 <= response.status_code < 300
                except Exception as e:
                    delivery.success = False
                    delivery.response_body = str(e)[:2000]
                    
                await self.db.commit()
