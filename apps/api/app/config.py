from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings

DEFAULT_DEV_JWT_SECRET = "dev-secret-change-me-in-production"  # nosec B105


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url.removeprefix("postgres://")
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url.removeprefix("postgresql://")
    if url.startswith("postgresql+") and not url.startswith("postgresql+asyncpg://"):
        _, rest = url.split("://", 1)
        return f"postgresql+asyncpg://{rest}"
    return url


def database_connect_args(url: str) -> dict[str, bool]:
    query = dict(parse_qsl(urlsplit(url).query, keep_blank_values=True))
    ssl_mode = query.get("sslmode") or query.get("ssl")
    if ssl_mode in {"require", "verify-ca", "verify-full", "true", "1"}:
        return {"ssl": True}
    return {}


def strip_asyncpg_unsupported_query(url: str) -> str:
    parsed = urlsplit(url)
    query = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key != "sslmode"
    ]
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))


class Settings(BaseSettings):
    # ── Database ──
    database_url: str = "postgresql+asyncpg://trackboard:trackboard_dev@postgres:5432/trackboard"

    # ── Redis ──
    redis_url: str = "memory://"

    # ── Auth / JWT ──
    jwt_secret: str = DEFAULT_DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    secret_encryption_key: str | None = None

    # ── CORS ──
    cors_origins: str = "http://localhost:3000"
    cors_origin_regex: str | None = r"https://.*\.vercel\.app|http://localhost:\d+"

    # ── App ──
    app_name: str = "Trackboard"
    environment: str = "development"
    debug: bool = True

    # ── AI / OpenAI ──
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    allow_private_ai_endpoints: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.environment.lower() not in {"prod", "production"}:
            return self

        if self.debug:
            raise ValueError("DEBUG must be disabled in production")

        if (
            self.jwt_secret == DEFAULT_DEV_JWT_SECRET
            or len(self.jwt_secret) < 32
        ):
            raise ValueError("JWT_SECRET must be a strong production secret")

        key = self.secret_encryption_key or self.jwt_secret
        if len(key) < 32:
            raise ValueError("SECRET_ENCRYPTION_KEY must be at least 32 characters in production")

        return self

    @property
    def sqlalchemy_database_url(self) -> str:
        return strip_asyncpg_unsupported_query(normalize_database_url(self.database_url))

    @property
    def sqlalchemy_connect_args(self) -> dict[str, bool]:
        return database_connect_args(self.database_url)


settings = Settings()
