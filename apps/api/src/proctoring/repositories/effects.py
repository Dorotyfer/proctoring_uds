"""Session activation and inference-generated event/alert transactions."""

import json
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


SEVERITY = {
  "biometric_mismatch": "high",
  "biometric_monitor_mismatch": "high",
  "environment_intrusion": "high",
  "analysis_unavailable": "medium",
}


class SqlAnalysisEffectsRepository:
  def __init__(self, engine: AsyncEngine, evidence_service: Any) -> None:
    self._engine = engine
    self._evidence_service = evidence_service

  async def activate(self, session_id: str, job_id: str, identity: bytes, profile: Any) -> None:
    await self._evidence_service.store_identity(session_id, identity)
    async with self._engine.begin() as connection:
      result = await connection.execute(text("""
        UPDATE proctoring_sessions SET status = 'active', prepared_at = UTC_TIMESTAMP(3)
        WHERE id = :session_id AND status = 'pending'
      """), {"session_id": session_id})
      if result.rowcount != 1:
        raise RuntimeError("Pending session activation unavailable")

  async def biometric_mismatch(self, session_id: str, job_id: str) -> None:
    await self.create_event_alert(session_id, job_id, "biometric_mismatch")

  async def analysis_unavailable(self, session_id: str, job_id: str, activate: bool) -> None:
    async with self._engine.begin() as connection:
      if activate:
        await connection.execute(text("""
          UPDATE proctoring_sessions SET status = 'active', prepared_at = UTC_TIMESTAMP(3)
          WHERE id = :session_id AND status = 'pending'
        """), {"session_id": session_id})
      await self._insert_event_alert(connection, session_id, job_id, "analysis_unavailable")

  async def create_event_alert(self, session_id: str, job_id: str, event_type: str) -> str:
    async with self._engine.begin() as connection:
      return await self._insert_event_alert(connection, session_id, job_id, event_type)

  async def _insert_event_alert(self, connection: Any, session_id: str, job_id: str, event_type: str) -> str:
    if event_type not in SEVERITY:
      raise ValueError("Unsupported inference event")
    event_id = str(uuid4())
    await connection.execute(text("""
      INSERT INTO proctoring_events (id, session_id, client_event_id, type, occurred_at, metadata)
      VALUES (:id, :session_id, :client_event_id, :type, UTC_TIMESTAMP(3), :metadata)
    """), {
      "id": event_id, "session_id": session_id, "client_event_id": str(uuid4()),
      "type": event_type, "metadata": json.dumps({"analysisJobId": job_id}),
    })
    await connection.execute(text("""
      INSERT INTO proctoring_alerts (id, session_id, event_id, type, severity)
      VALUES (:id, :session_id, :event_id, :type, :severity)
    """), {
      "id": str(uuid4()), "session_id": session_id, "event_id": event_id,
      "type": event_type, "severity": SEVERITY[event_type],
    })
    return event_id
