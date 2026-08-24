"""MariaDB-backed idempotent event persistence."""

import json
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from proctoring_api.db.rows import parse_json, to_iso_datetime, to_mariadb_datetime
from proctoring_api.models import SessionEventInput
from proctoring_api.services.events import EventRateLimitError, SessionUnavailableError


class SqlEventRepository:
  def __init__(self, engine: AsyncEngine) -> None:
    self._engine = engine

  async def create(self, session_id: UUID, event: SessionEventInput) -> dict[str, Any]:
    async with self._engine.begin() as connection:
      locked = await connection.execute(text("""
        SELECT id, status FROM proctoring_sessions
        WHERE id = :session_id AND status IN ('pending', 'active') AND expires_at > UTC_TIMESTAMP(3)
        FOR UPDATE
      """), {"session_id": str(session_id)})
      if not locked.mappings().first():
        raise SessionUnavailableError("Active session not found")
      existing = await connection.execute(text(_event_select("session_id = :session_id AND client_event_id = :client_event_id")), {"session_id": str(session_id), "client_event_id": str(event.client_event_id)})
      row = existing.mappings().first()
      if row:
        return map_event(row)
      recent = await connection.execute(text("""
        SELECT COUNT(*) AS total FROM proctoring_events
        WHERE session_id = :session_id AND received_at >= UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE
      """), {"session_id": str(session_id)})
      if int(recent.mappings().first()["total"]) >= 120:
        raise EventRateLimitError("Session event rate limit exceeded")
      event_id = uuid4()
      await connection.execute(text("""
        INSERT INTO proctoring_events (id, session_id, client_event_id, type, occurred_at, metadata)
        VALUES (:id, :session_id, :client_event_id, :type, :occurred_at, :metadata)
      """), {"id": str(event_id), "session_id": str(session_id), "client_event_id": str(event.client_event_id),
        "type": event.type.value, "occurred_at": to_mariadb_datetime(event.occurred_at), "metadata": json.dumps(event.metadata)})
      result = await connection.execute(text(_event_select("id = :id")), {"id": str(event_id)})
      return map_event(result.mappings().first())


def _event_select(condition: str) -> str:
  return f"SELECT id, session_id, client_event_id, type, occurred_at, metadata, received_at FROM proctoring_events WHERE {condition}"


def map_event(row: Any) -> dict[str, Any]:
  return {"id": UUID(str(row["id"])), "sessionId": UUID(str(row["session_id"])), "clientEventId": UUID(str(row["client_event_id"])),
    "type": row["type"], "occurredAt": to_iso_datetime(row["occurred_at"]), "metadata": parse_json(row["metadata"]),
    "receivedAt": to_iso_datetime(row["received_at"])}
