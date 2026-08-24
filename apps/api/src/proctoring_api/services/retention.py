"""Retention decisions that reuse encrypted staging objects when safe."""

from datetime import datetime, timedelta
from typing import Any


class FrameRetentionService:
  def __init__(self, repository: Any, storage: Any, *, retention_days: int) -> None:
    if not 1 <= retention_days <= 3650:
      raise ValueError("Evidence retention days must be between 1 and 3650")
    self._repository = repository
    self._storage = storage
    self._retention = timedelta(days=retention_days)

  async def discard(self, frame: dict[str, Any]) -> None:
    await self._storage.delete(frame["objectKey"])
    await self._repository.mark_cleanup(frame["id"], "deleted")

  async def retain_interval(self, session_id: str, frame: dict[str, Any], now: datetime) -> bool:
    if not await self._repository.reserve_interval(session_id, now, timedelta(seconds=60)):
      await self.discard(frame)
      return False
    await self._retain(frame, "interval", None, now)
    return True

  async def retain_alert(self, frame: dict[str, Any], event_id: str, now: datetime) -> None:
    await self._retain(frame, "alert", event_id, now)

  async def _retain(self, frame: dict[str, Any], kind: str, event_id: str | None, now: datetime) -> None:
    await self._repository.retain_staging(frame, kind, event_id, now + self._retention)
    await self._repository.mark_cleanup(frame["id"], "retained")
