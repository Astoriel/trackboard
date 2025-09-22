from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import AsyncIterator

import pytest
import pytest_asyncio
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from alembic import command
from app.config import settings
from app.core.database import get_db
from app.main import app

DEFAULT_TEST_DATABASE_URL = (
    "postgresql+asyncpg://trackboard:trackboard_dev@localhost:5432/trackboard_test"
)


def _resolve_test_database_url() -> tuple[str, bool]:
    explicit_database_url = os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
    if explicit_database_url:
        return explicit_database_url, True
    return DEFAULT_TEST_DATABASE_URL, False


async def _probe_database(database_url: str) -> tuple[bool, str | None]:
    engine = create_async_engine(database_url, echo=False, pool_pre_ping=True)
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return True, None
    except Exception as exc:  # pragma: no cover - depends on local environment
        return False, str(exc)
    finally:
        await engine.dispose()


def _build_alembic_config(database_url: str) -> Config:
    project_root = Path(__file__).resolve().parents[1]
    config = Config(str(project_root / "alembic.ini"))
    config.set_main_option("script_location", str(project_root / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def _upgrade_database(database_url: str) -> None:
    previous_database_url = settings.database_url
    settings.database_url = database_url
    try:
        command.upgrade(_build_alembic_config(database_url), "head")
    finally:
        settings.database_url = previous_database_url


async def _reset_database(engine: AsyncEngine, database_url: str) -> None:
    async with engine.begin() as connection:
        await connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        await connection.execute(text("CREATE SCHEMA public"))
    await asyncio.to_thread(_upgrade_database, database_url)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def integration_database_url() -> str:
    database_url, is_explicit = _resolve_test_database_url()
    is_available, error_message = asyncio.run(_probe_database(database_url))
    if is_available:
        return database_url

    if is_explicit:
        pytest.fail(
            f"Test database is configured but unavailable: {database_url}\n{error_message}",
            pytrace=False,
        )

    pytest.skip(
        "Integration database is unavailable. Set TEST_DATABASE_URL or DATABASE_URL to "
        "a PostgreSQL database to run API integration tests.",
        allow_module_level=True,
    )


@pytest_asyncio.fixture(scope="session")
async def db_engine(integration_database_url: str) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(integration_database_url, echo=False, pool_pre_ping=True)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def session_factory(
    db_engine: AsyncEngine,
    integration_database_url: str,
) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    await _reset_database(db_engine, integration_database_url)
    yield async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(scope="function")
async def client(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncClient]:
    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def app_client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client
