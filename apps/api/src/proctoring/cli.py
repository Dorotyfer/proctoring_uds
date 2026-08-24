"""Operational commands that do not connect until explicitly executed."""

import asyncio
from datetime import UTC, datetime, timedelta

from proctoring.config import Settings
from proctoring.main import DatabaseHealthService, create_runtime_dependencies
from proctoring.services.analysis import AnalysisQueueService
from proctoring.services.readiness import QueueReadiness, ReadinessService


async def check_infrastructure() -> bool:
  settings = Settings.from_process_environment()
  dependencies = create_runtime_dependencies(settings)
  try:
    result = await ReadinessService(
      DatabaseHealthService(dependencies.sessions), dependencies.object_storage, QueueReadiness(dependencies.analyses)
    ).check()
    if all(status == "available" for status in result.values()):
      print("Infrastructure ready")
      return True
    print("Infrastructure unavailable")
    return False
  finally:
    await dependencies.close()


async def purge() -> int:
  settings = Settings.from_process_environment()
  dependencies = create_runtime_dependencies(settings)
  try:
    deleted = await dependencies.evidence_service.purge_expired()
    print(f"Purged evidence: {deleted}")
    return deleted
  finally:
    await dependencies.close()


async def purge_staging() -> int:
  settings = Settings.from_process_environment()
  dependencies = create_runtime_dependencies(settings)
  try:
    if dependencies.analyses is None:
      raise RuntimeError("Analysis repository unavailable")
    service = AnalysisQueueService(
      dependencies.analyses, dependencies.object_storage, settings.evidence_encryption_key_bytes
    )
    cutoff = datetime.now(UTC) - timedelta(minutes=settings.staging_retention_minutes)
    deleted = await service.purge_orphan_staging(cutoff)
    print(f"Purged orphan staging objects: {deleted}")
    return deleted
  finally:
    await dependencies.close()


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


def purge_staging_main() -> None:
  try:
    asyncio.run(purge_staging())
  except Exception:
    print("Staging purge unavailable")
    raise SystemExit(1)
