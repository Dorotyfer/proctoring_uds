"""Operational commands that do not connect until explicitly executed."""

import asyncio

from proctoring_api.config import Settings
from proctoring_api.main import DatabaseHealthService, create_runtime_dependencies
from proctoring_api.services.readiness import QueueReadiness, ReadinessService


async def check_infrastructure() -> bool:
  settings = Settings.from_process_environment()
  dependencies = create_runtime_dependencies(settings)
  try:
    result = await ReadinessService(
      DatabaseHealthService(dependencies.sessions), dependencies.object_storage, QueueReadiness()
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
