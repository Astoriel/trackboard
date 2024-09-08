from __future__ import annotations

from typing import Any


class TrackboardError(Exception):
    """Base application exception with a stable API error shape."""

    def __init__(
        self,
        message: str = "An error occurred",
        *,
        status_code: int = 500,
        code: str = "internal_error",
        extra: dict[str, Any] | None = None,
    ):
        self.message = message
        self.status_code = status_code
        self.code = code
        self.extra = extra or {}
        super().__init__(self.message)

    def to_response(self) -> dict[str, Any]:
        payload = {"code": self.code, "message": self.message}
        payload.update(self.extra)
        return payload


class NotFoundError(TrackboardError):
    def __init__(self, resource: str = "Resource", *, code: str = "not_found"):
        super().__init__(f"{resource} not found", status_code=404, code=code)


class ConflictError(TrackboardError):
    def __init__(
        self,
        message: str = "Resource already exists",
        *,
        code: str = "conflict",
        extra: dict[str, Any] | None = None,
    ):
        super().__init__(message, status_code=409, code=code, extra=extra)


class StaleRevisionError(ConflictError):
    def __init__(self, current_revision: int):
        super().__init__(
            "Draft revision is stale. Refresh and retry your change.",
            code="stale_revision",
            extra={"current_revision": current_revision},
        )


class AuthenticationError(TrackboardError):
    def __init__(self, message: str = "Invalid credentials", *, code: str = "unauthorized"):
        super().__init__(message, status_code=401, code=code)


class ForbiddenError(TrackboardError):
    def __init__(self, message: str = "Insufficient permissions", *, code: str = "forbidden"):
        super().__init__(message, status_code=403, code=code)


class ValidationError(TrackboardError):
    def __init__(
        self,
        message: str = "Validation failed",
        *,
        code: str = "validation_error",
        extra: dict[str, Any] | None = None,
    ):
        super().__init__(message, status_code=422, code=code, extra=extra)


class BadRequestError(TrackboardError):
    def __init__(
        self,
        message: str,
        *,
        code: str = "bad_request",
        extra: dict[str, Any] | None = None,
    ):
        super().__init__(message, status_code=400, code=code, extra=extra)
