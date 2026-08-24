"""Async MariaDB engine construction."""

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine


def create_mariadb_engine(database_url: str) -> AsyncEngine:
  """Adapt the persisted mysql URL to SQLAlchemy's asyncmy dialect."""

  url = database_url.replace("mysql://", "mysql+asyncmy://", 1)
  return create_async_engine(url, pool_pre_ping=True, connect_args={
    "init_command": "SET time_zone = '+00:00'"
  })
