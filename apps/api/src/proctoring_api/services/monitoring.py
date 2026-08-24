"""Durable monitoring cadence and two-of-three anomaly confirmation."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Protocol, Set


ALLOWED_ANOMALIES = frozenset({
  "biometric_monitor_mismatch", "environment_intrusion", "analysis_unavailable"
})


class ConfirmationRepository(Protocol):
  async def observe(self, session_id: str, anomalies: set[str], observed_at: datetime) -> set[str]: ...


@dataclass(frozen=True)
class ConfirmationResult:
  confirmed: frozenset[str]
  follow_up_frames: int
  follow_up_interval_seconds: int


class ConfirmationService:
  def __init__(self, repository: ConfirmationRepository) -> None:
    self._repository = repository

  async def observe(self, session_id: str, anomalies: Set[str], observed_at: datetime) -> ConfirmationResult:
    if not anomalies <= ALLOWED_ANOMALIES:
      raise ValueError("Unsupported monitoring anomaly")
    confirmed = await self._repository.observe(session_id, set(anomalies), observed_at)
    return ConfirmationResult(
      frozenset(confirmed), 2 if anomalies and not confirmed else 0, 2
    )


class CadenceRepository(Protocol):
  async def reserve_sface(self, session_id: str, now: datetime, minimum_interval: timedelta) -> bool: ...


class MonitoringCadence:
  def __init__(self, repository: CadenceRepository, *, sface_interval_seconds: int = 60) -> None:
    if sface_interval_seconds < 60:
      raise ValueError("SFace interval must be at least 60 seconds")
    self._repository = repository
    self._interval = timedelta(seconds=sface_interval_seconds)

  async def should_run_sface(self, session_id: str, now: datetime) -> bool:
    return await self._repository.reserve_sface(session_id, now, self._interval)
