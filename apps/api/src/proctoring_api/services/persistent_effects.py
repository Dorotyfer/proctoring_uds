"""Evidence-aware preparation and monitoring effects."""

from datetime import UTC, datetime
from typing import Any, Sequence

from proctoring_api.services.effects import PreparationEffects


class PersistentPreparationEffects(PreparationEffects):
  def __init__(self, repository: Any, retention: Any) -> None:
    super().__init__(repository)
    self._retention = retention

  async def cleanup(self, job: dict[str, Any], frames: Sequence[dict[str, Any]], result: dict[str, Any]) -> None:
    for frame in frames:
      if frame.get("cleanupState") == "pending":
        await self._retention.discard(frame)


class PersistentMonitoringEffects:
  def __init__(self, repository: Any, retention: Any) -> None:
    self._repository = repository
    self._retention = retention

  async def emit(self, job: dict[str, Any], event_type: str, frame: bytes) -> None:
    event_id = await self._repository.create_event_alert(job["sessionId"], job["id"], event_type)
    metadata = job.get("frameMetadata") or []
    if metadata:
      await self._retention.retain_alert(metadata[0], event_id, job.get("observedAt") or datetime.now(UTC))

  async def cleanup(self, job: dict[str, Any], frames: Sequence[dict[str, Any]], result: dict[str, Any]) -> None:
    if not frames:
      return
    now = job.get("observedAt") or datetime.now(UTC)
    if result.get("alert"):
      for frame in frames[1:]:
        await self._retention.discard(frame)
      return
    await self._retention.retain_interval(job["sessionId"], frames[0], now)
    for frame in frames[1:]:
      await self._retention.discard(frame)
