from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class IntegrationBase(BaseModel):
    provider: str = Field(..., description="Provider name, e.g., 'github' or 'gitlab'")
    config: dict = Field(default_factory=dict, description="Integration configuration details such as repo, branch, paths, and token.")
    status: str = Field("active", description="Status of the integration")

class IntegrationCreate(IntegrationBase):
    pass

class IntegrationUpdate(BaseModel):
    config: dict | None = None
    status: str | None = None

class IntegrationResponse(IntegrationBase):
    id: UUID
    plan_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
