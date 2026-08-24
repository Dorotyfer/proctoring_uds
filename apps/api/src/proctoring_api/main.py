"""Production FastAPI composition and Uvicorn entrypoint."""

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Callable

import uvicorn
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncEngine

from proctoring_api.app import create_app
from proctoring_api.config import Settings
from proctoring_api.db.engine import create_mariadb_engine
from proctoring_api.repositories.events import SqlEventRepository
from proctoring_api.repositories.evidence import SqlEvidenceRepository
from proctoring_api.repositories.sessions import SqlSessionRepository
from proctoring_api.repositories.panel import SqlPanelRepository
from proctoring_api.repositories.biometric_profiles import SqlBiometricProfileRepository
from proctoring_api.repositories.analysis import SqlAnalysisRepository
from proctoring_api.services.events import EventService
from proctoring_api.services.evidence import EvidenceService
from proctoring_api.services.evidence_crypto import EvidenceEncryptionService
from proctoring_api.services.object_storage import S3ObjectStorage
from proctoring_api.services.readiness import QueueReadiness, ReadinessService
from proctoring_api.services.sessions import SessionService
from proctoring_api.services.analysis import AnalysisQueueService


class DatabaseHealthService:
  """Health check adapter that opens a connection only on the health request."""

  def __init__(self, repository: SqlSessionRepository) -> None:
    self._repository = repository

  async def check(self) -> None:
    await self._repository.ping()


@dataclass
class RuntimeDependencies:
  engine: AsyncEngine
  sessions: SqlSessionRepository
  evidence_repository: SqlEvidenceRepository
  object_storage: S3ObjectStorage
  evidence_service: EvidenceService
  panel_repository: SqlPanelRepository | None = None
  biometric_profiles: SqlBiometricProfileRepository | None = None
  analyses: SqlAnalysisRepository | None = None

  async def close(self) -> None:
    try:
      await self.object_storage.close()
    finally:
      await self.engine.dispose()


def create_object_storage(settings: Settings) -> S3ObjectStorage:
  return S3ObjectStorage(
    settings.s3_bucket, endpoint_url=settings.s3_endpoint, region_name=settings.s3_region,
    access_key_id=settings.s3_access_key_id, secret_access_key=settings.s3_secret_access_key,
    force_path_style=settings.s3_force_path_style, server_side_encryption=settings.s3_server_side_encryption
  )


def create_runtime_dependencies(
  settings: Settings,
  engine_factory: Callable[[str], AsyncEngine] = create_mariadb_engine,
  storage_factory: Callable[[Settings], S3ObjectStorage] = create_object_storage
) -> RuntimeDependencies:
  """Construct runtime services without connecting to MariaDB or S3."""

  engine = engine_factory(settings.database_url)
  sessions = SqlSessionRepository(engine)
  evidence_repository = SqlEvidenceRepository(engine)
  object_storage = storage_factory(settings)
  evidence_service = EvidenceService(
    EvidenceEncryptionService(settings.evidence_encryption_key_bytes), object_storage, evidence_repository,
    retention_days=settings.evidence_retention_days, content_token_secret=settings.jwt_secret
  )
  return RuntimeDependencies(engine, sessions, evidence_repository, object_storage, evidence_service,
    SqlPanelRepository(engine), SqlBiometricProfileRepository(engine), SqlAnalysisRepository(engine))


def create_runtime_app(
  settings: Settings,
  engine_factory: Callable[[str], AsyncEngine] = create_mariadb_engine,
  storage_factory: Callable[[Settings], S3ObjectStorage] = create_object_storage
) -> FastAPI:
  """Compose runtime dependencies without opening a database at import time."""

  dependencies = create_runtime_dependencies(settings, engine_factory, storage_factory)
  sessions = dependencies.sessions
  analyses = dependencies.analyses
  if analyses is None:
    raise RuntimeError("Analysis repository is required")
  analysis_service = AnalysisQueueService(analyses, dependencies.object_storage, settings.evidence_encryption_key_bytes)
  app = create_app(
    DatabaseHealthService(sessions),
    readiness_service=ReadinessService(DatabaseHealthService(sessions), dependencies.object_storage, QueueReadiness(analyses)),
    evidence_service=dependencies.evidence_service,
    evidence_repository=dependencies.evidence_repository,
    object_storage=dependencies.object_storage,
    session_service=SessionService(sessions),
    event_service=EventService(SessionService(sessions), SqlEventRepository(dependencies.engine)),
    jwt_secret=settings.jwt_secret,
    moodle_integration_key=settings.moodle_integration_key,
    web_origin=settings.web_origin,
    panel_repository=dependencies.panel_repository,
    biometric_profile_repository=dependencies.biometric_profiles,
    panel_sso_secret=settings.panel_sso_secret,
    api_public_url=settings.api_base_url,
    analysis_service=analysis_service
  )

  @asynccontextmanager
  async def lifespan(_: FastAPI):
    try:
      yield
    finally:
      await dependencies.close()

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
