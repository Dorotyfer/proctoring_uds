"""Operational commands that do not connect until explicitly executed."""

import asyncio

from proctoring_api.config import Settings
from proctoring_api.db.engine import create_mariadb_engine
from proctoring_api.main import DatabaseHealthService
from proctoring_api.repositories.evidence import SqlEvidenceRepository
from proctoring_api.repositories.sessions import SqlSessionRepository
from proctoring_api.services.evidence import EvidenceService
from proctoring_api.services.evidence_crypto import EvidenceEncryptionService
from proctoring_api.services.object_storage import S3ObjectStorage
from proctoring_api.services.readiness import QueueReadiness, ReadinessService


def _storage(settings: Settings) -> S3ObjectStorage:
  return S3ObjectStorage(
    settings.s3_bucket, endpoint_url=settings.s3_endpoint, region_name=settings.s3_region,
    access_key_id=settings.s3_access_key_id, secret_access_key=settings.s3_secret_access_key,
    force_path_style=settings.s3_force_path_style, server_side_encryption=settings.s3_server_side_encryption
  )


async def check_infrastructure() -> bool:
  settings = Settings.from_process_environment()
  engine = create_mariadb_engine(settings.database_url)
  try:
    result = await ReadinessService(DatabaseHealthService(SqlSessionRepository(engine)), _storage(settings), QueueReadiness()).check()
    if all(status == "available" for status in result.values()):
      print("Infrastructure ready")
      return True
    print("Infrastructure unavailable")
    return False
  finally:
    await engine.dispose()


async def purge() -> int:
  settings = Settings.from_process_environment()
  engine = create_mariadb_engine(settings.database_url)
  try:
    service = EvidenceService(
      EvidenceEncryptionService(settings.evidence_encryption_key_bytes), _storage(settings), SqlEvidenceRepository(engine),
      retention_days=settings.evidence_retention_days, content_token_secret=settings.jwt_secret
    )
    deleted = await service.purge_expired()
    print(f"Purged evidence: {deleted}")
    return deleted
  finally:
    await engine.dispose()


def check_infrastructure_main() -> None:
  try:
    ready = asyncio.run(check_infrastructure())
  except Exception:
    ready = False
  if not ready:
    print("Infrastructure unavailable")
    raise SystemExit(1)


def purge_main() -> None:
  try:
    asyncio.run(purge())
  except Exception:
    print("Evidence purge unavailable")
    raise SystemExit(1)
