from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

SECRET_PREFIX = "fernet:"  # nosec B105


def _build_fernet(secret: str) -> Fernet:
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _fernet() -> Fernet:
    return _build_fernet(settings.secret_encryption_key or settings.jwt_secret)


def _fallback_fernets() -> list[Fernet]:
    if not settings.secret_encryption_key:
        return []
    return [_build_fernet(settings.jwt_secret)]


def encrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    token = _fernet().encrypt(value.encode("utf-8")).decode("utf-8")
    return f"{SECRET_PREFIX}{token}"


def decrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    if not value.startswith(SECRET_PREFIX):
        return value
    token = value.removeprefix(SECRET_PREFIX)
    for candidate in [_fernet(), *_fallback_fernets()]:
        try:
            return candidate.decrypt(token.encode("utf-8")).decode("utf-8")
        except InvalidToken:
            continue
    return None
