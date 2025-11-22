from __future__ import annotations

from ipaddress import ip_address
from urllib.parse import urlsplit

from app.core.exceptions import BadRequestError

LOCAL_HOSTNAMES = {"localhost", "localhost.localdomain", "host.docker.internal"}


def validate_external_http_url(
    value: str,
    *,
    allow_private: bool = False,
    field_name: str = "URL",
) -> str:
    trimmed = value.strip().rstrip("/")
    parsed = urlsplit(trimmed)
    hostname = parsed.hostname

    if parsed.scheme not in {"http", "https"} or not hostname:
        raise BadRequestError(f"{field_name} must be an http(s) URL.", code="unsafe_url")

    if parsed.username or parsed.password:
        raise BadRequestError(
            f"{field_name} must not include embedded credentials.",
            code="unsafe_url_credentials",
        )

    normalized_host = hostname.strip("[]").lower()
    if allow_private:
        return trimmed

    if parsed.scheme != "https":
        raise BadRequestError(f"{field_name} must use https.", code="unsafe_url_scheme")

    if normalized_host in LOCAL_HOSTNAMES or normalized_host.endswith(
        (".localhost", ".local", ".internal")
    ):
        raise BadRequestError(
            f"{field_name} cannot target local hosts.",
            code="unsafe_url_private_host",
        )

    try:
        candidate_ip = ip_address(normalized_host)
    except ValueError:
        return trimmed

    if (
        candidate_ip.is_private
        or candidate_ip.is_loopback
        or candidate_ip.is_link_local
        or candidate_ip.is_multicast
        or candidate_ip.is_reserved
        or candidate_ip.is_unspecified
    ):
        raise BadRequestError(
            f"{field_name} cannot target private or local IP ranges.",
            code="unsafe_url_private_host",
        )

    return trimmed
