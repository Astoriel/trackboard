from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class AIProviderResponse(BaseModel):
    enabled: bool = False
    provider: str = "openai-compatible"
    base_url: str | None = None
    model: str = "gpt-4o-mini"
    has_api_key: bool = False


class AIProviderUpdate(BaseModel):
    enabled: bool | None = None
    provider: str | None = Field(None, min_length=1, max_length=80)
    base_url: str | None = Field(None, max_length=500)
    model: str | None = Field(None, min_length=1, max_length=120)
    api_key: str | None = Field(None, max_length=1000)
    clear_api_key: bool = False

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        if not (trimmed.startswith("http://") or trimmed.startswith("https://")):
            raise ValueError("AI endpoint must start with http:// or https://")
        return trimmed.rstrip("/")

    @field_validator("api_key")
    @classmethod
    def normalize_api_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None
