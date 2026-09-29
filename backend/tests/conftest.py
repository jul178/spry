import os
from collections.abc import AsyncIterator
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool


def _test_database_url() -> str:
    if override := os.environ.get("TEST_DATABASE_URL"):
        return override
    base = os.environ.get("DATABASE_URL", "postgresql+asyncpg://peach:peach@db:5432/peach")
    parts = urlsplit(base)
    db_name = parts.path.lstrip("/")
    if not db_name.endswith("_test"):
        db_name = f"{db_name}_test"
    return urlunsplit((parts.scheme, parts.netloc, f"/{db_name}", parts.query, parts.fragment))


os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = _test_database_url()

from app.db import Base, get_session  # noqa: E402
from app.main import create_app  # noqa: E402


async def _ensure_test_database_exists(url: str) -> None:
    parts = urlsplit(url.replace("postgresql+asyncpg://", "postgresql://", 1))
    target_db = parts.path.lstrip("/")
    admin_url = urlunsplit((parts.scheme, parts.netloc, "/postgres", "", ""))
    conn = await asyncpg.connect(admin_url)
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", target_db)
        if not exists:
            await conn.execute(f'CREATE DATABASE "{target_db}"')
    finally:
        await conn.close()


@pytest.fixture(scope="session")
async def engine():
    url = _test_database_url()
    await _ensure_test_database_exists(url)
    test_engine = create_async_engine(url, poolclass=NullPool)
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield test_engine
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest.fixture
async def session(engine) -> AsyncIterator[AsyncSession]:
    async with engine.connect() as conn:
        trans = await conn.begin()
        factory = async_sessionmaker(
            bind=conn,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        async with factory() as db_session:
            yield db_session
        await trans.rollback()


@pytest.fixture
async def client(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    app = create_app()

    async def _override() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
