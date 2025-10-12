from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.core.exceptions import BadRequestError
from app.core.url_safety import validate_external_http_url


@pytest.mark.parametrize(
    "url",
    [
        "http://api.example.com/v1",
        "https://localhost:11434/v1",
        "https://127.0.0.1:11434/v1",
        "https://10.0.0.4/v1",
        "https://192.168.1.2/v1",
        "https://[::1]/v1",
        "https://metadata.google.internal/v1",
    ],
)
def test_external_ai_endpoint_rejects_unsafe_targets(url: str):
    with pytest.raises(BadRequestError):
        validate_external_http_url(url, field_name="AI endpoint")


def test_external_ai_endpoint_allows_public_https_url():
    assert (
        validate_external_http_url("https://api.openai.com/v1/", field_name="AI endpoint")
        == "https://api.openai.com/v1"
    )


def test_external_ai_endpoint_can_explicitly_allow_private_dev_targets():
    assert (
        validate_external_http_url(
            "http://localhost:11434/v1",
            allow_private=True,
            field_name="AI endpoint",
        )
        == "http://localhost:11434/v1"
    )


def test_production_settings_reject_dev_secrets():
    with pytest.raises(ValidationError):
        Settings(environment="production", debug=False)


def test_production_settings_reject_debug_mode():
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            debug=True,
            jwt_secret="x" * 40,
            secret_encryption_key="y" * 40,
        )


def test_production_settings_accept_strong_secrets():
    settings = Settings(
        environment="production",
        debug=False,
        jwt_secret="x" * 40,
        secret_encryption_key="y" * 40,
    )

    assert settings.environment == "production"
