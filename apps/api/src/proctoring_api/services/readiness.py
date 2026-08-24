"""Readiness protocol for database, object storage, and the future durable queue."""

from typing import Protocol


class ReadinessDependency(Protocol):
  async def check(self) -> None: ...


class QueueReadiness:
  """Temporary queue seam. Task 5 replaces this with its durable queue checker."""

  async def check(self) -> None:
    return None


class ReadinessService:
  def __init__(
    self, database: ReadinessDependency, storage: ReadinessDependency, queue: ReadinessDependency
  ) -> None:
    self._dependencies = {"database": database, "storage": storage, "queue": queue}

  async def check(self) -> dict[str, str]:
    result: dict[str, str] = {}
    for name, dependency in self._dependencies.items():
      try:
        await dependency.check()
        result[name] = "available"
      except Exception:
        result[name] = "unavailable"
    return result
