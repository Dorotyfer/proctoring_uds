"""Production FastAPI composition and Uvicorn entrypoint."""

from contextlib import asynccontextmanager
from typing import Callable

import uvicorn
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncEngine

from proctoring_api.app import create_app
from proctoring_api.config import Settings
from proctoring_api.db.engine import create_mariadb_engine
from proctoring_api.repositories.events import SqlEventRepository
from proctoring_api.repositories.sessions import SqlSessionRepository
from proctoring_api.services.events import EventService
from proctoring_api.services.object_storage import S3ObjectStorage
from proctoring_api.services.readiness import QueueReadiness, ReadinessService
from proctoring_api.services.sessions import SessionService


class DatabaseHealthService:
  """Health check adapter that opens a connection only on the health request."""

  def __init__(self, repository: SqlSessionRepository) -> None:
    self._repository = repository

  async def check(self) -> None:
    await self._repository.ping()


def create_runtime_app(
  settings: Settings,
  engine_factory: Callable[[str], AsyncEngine] = create_mariadb_engine
) -> FastAPI:
  """Compose runtime dependencies without opening a database at import time."""

  engine = engine_factory(settings.database_url)
  sessions = SqlSessionRepository(engine)
  storage = S3ObjectStorage(
    settings.s3_bucket, endpoint_url=settings.s3_endpoint, region_name=settings.s3_region,
    access_key_id=settings.s3_access_key_id, secret_access_key=settings.s3_secret_access_key,
    force_path_style=settings.s3_force_path_style, server_side_encryption=settings.s3_server_side_encryption
  )
  app = create_app(
    DatabaseHealthService(sessions),
    readiness_service=ReadinessService(DatabaseHealthService(sessions), storage, QueueReadiness()),
    session_service=SessionService(sessions),
    event_service=EventService(SessionService(sessions), SqlEventRepository(engine)),
    jwt_secret=settings.jwt_secret,
    moodle_integration_key=settings.moodle_integration_key,
    web_origin=settings.web_origin
  )

  @asynccontextmanager
  async def lifespan(_: FastAPI):
    try:
      yield
    finally:
      await engine.dispose()

  app.router.lifespan_context = lifespan
  return app


def load_runtime_app() -> FastAPI:
  """Load complete environment configuration when production starts."""

  return create_runtime_app(Settings.from_process_environment())


def main() -> None:
  settings = Settings.from_process_environment()
  uvicorn.run(create_runtime_app(settings), host="0.0.0.0", port=8000)


if __name__ == "__main__":
  main()
