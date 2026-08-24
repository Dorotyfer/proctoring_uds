"""Transactional cadence, confirmation, and staging cleanup persistence."""

import json
from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


class SqlMonitoringRepository:
  def __init__(self, engine: AsyncEngine) -> None:
    self._engine = engine

  async def reserve_sface(self, session_id: str, now: datetime, minimum_interval: timedelta) -> bool:
    async with self._engine.begin() as connection:
      await self._ensure_state(connection, session_id)
      result = await connection.execute(text("""
        UPDATE proctoring_monitoring_state
        SET last_sface_check_at = :now, updated_at = :now
        WHERE session_id = :session_id
          AND (last_sface_check_at IS NULL OR last_sface_check_at <= :cutoff)
      """), {"session_id": session_id, "now": now, "cutoff": now - minimum_interval})
      return result.rowcount == 1

  async def reserve_interval(self, session_id: str, now: datetime, interval: timedelta) -> bool:
    async with self._engine.begin() as connection:
      await self._ensure_state(connection, session_id)
      result = await connection.execute(text("""
        UPDATE proctoring_monitoring_state
        SET last_interval_evidence_at = :now, updated_at = :now
        WHERE session_id = :session_id
          AND (last_interval_evidence_at IS NULL OR last_interval_evidence_at <= :cutoff)
      """), {"session_id": session_id, "now": now, "cutoff": now - interval})
      return result.rowcount == 1

  async def observe(
    self, session_id: str, anomalies: set[str], observed_at: datetime,
    observation_id: str | None = None,
  ) -> set[str]:
    async with self._engine.begin() as connection:
      await connection.execute(text("""
        INSERT INTO proctoring_monitoring_observations (
          id, session_id, job_id, anomalies, observed_at
        ) VALUES (:id, :session_id, :job_id, :anomalies, :observed_at)
        ON DUPLICATE KEY UPDATE
          anomalies = VALUES(anomalies), observed_at = VALUES(observed_at)
      """), {
        "id": str(uuid4()), "session_id": session_id, "job_id": observation_id,
        "anomalies": json.dumps(sorted(anomalies)), "observed_at": observed_at,
      })
      result = await connection.execute(text("""
        SELECT anomalies FROM proctoring_monitoring_observations
        WHERE session_id = :session_id ORDER BY observed_at DESC, id DESC LIMIT 3
      """), {"session_id": session_id})
      rows = result.mappings().all()
      await connection.execute(text("""
        DELETE FROM proctoring_monitoring_observations
        WHERE session_id = :session_id AND id NOT IN (
          SELECT id FROM (
            SELECT id FROM proctoring_monitoring_observations
            WHERE session_id = :session_id ORDER BY observed_at DESC, id DESC LIMIT 3
          ) latest
        )
      """), {"session_id": session_id})
    observations = [_anomalies(row["anomalies"]) for row in rows]
    if len(observations) < 3:
      return set()
    universe = set().union(*observations) if observations else set()
    return {name for name in universe if sum(name in observation for observation in observations) >= 2}

  async def mark_cleanup(self, frame_id: str, state: str) -> None:
    if state not in {"retained", "deleted"}:
      raise ValueError("Invalid staging cleanup state")
    async with self._engine.begin() as connection:
      await connection.execute(text("""
        UPDATE proctoring_analysis_frames SET cleanup_state = :state
        WHERE id = :frame_id AND cleanup_state = 'pending'
      """), {"frame_id": frame_id, "state": state})

  async def retain_staging(
    self, frame: dict[str, Any], kind: str, event_id: str | None, expires_at: datetime
  ) -> None:
    if kind not in {"identity", "interval", "alert"}:
      raise ValueError("Invalid evidence kind")
    async with self._engine.begin() as connection:
      await connection.execute(text("""
        INSERT INTO proctoring_evidence (
          id, session_id, event_id, kind, object_key, content_type, byte_size, sha256,
          encryption_iv, encryption_tag, expires_at
        )
        SELECT :id, jobs.session_id, :event_id, :kind, frames.object_key, 'image/jpeg',
          frames.byte_size, frames.sha256, frames.encryption_iv, frames.encryption_tag, :expires_at
        FROM proctoring_analysis_frames frames
        JOIN proctoring_analysis_jobs jobs ON jobs.id = frames.job_id
        WHERE frames.id = :frame_id AND frames.cleanup_state = 'pending'
        ON DUPLICATE KEY UPDATE event_id = VALUES(event_id)
      """), {
        "id": str(uuid4()), "event_id": event_id, "kind": kind,
        "expires_at": expires_at, "frame_id": frame["id"],
      })

  async def _ensure_state(self, connection: Any, session_id: str) -> None:
    await connection.execute(text("""
      INSERT INTO proctoring_monitoring_state (session_id) VALUES (:session_id)
      ON DUPLICATE KEY UPDATE session_id = VALUES(session_id)
    """), {"session_id": session_id})


def _anomalies(value: object) -> set[str]:
  parsed = json.loads(value) if isinstance(value, str) else value
  if not isinstance(parsed, list) or any(not isinstance(item, str) for item in parsed):
    return set()
  return set(parsed)
