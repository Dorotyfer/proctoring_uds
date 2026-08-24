"""MariaDB evidence metadata and audit persistence."""

from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from proctoring_api.db.rows import to_iso_datetime, to_mariadb_datetime


class SqlEvidenceRepository:
  def __init__(self, engine: AsyncEngine) -> None:
    self._engine = engine

  async def create(self, input_data: dict[str, Any]) -> dict[str, Any]:
    identifier = str(uuid4())
    async with self._engine.begin() as connection:
      await connection.execute(text("""
        INSERT INTO proctoring_evidence (
          id, session_id, event_id, kind, object_key, content_type, byte_size, sha256,
          encryption_iv, encryption_tag, expires_at
        ) VALUES (
          :id, :session_id, :event_id, :kind, :object_key, :content_type, :byte_size, :sha256,
          :encryption_iv, :encryption_tag, :expires_at
        ) ON DUPLICATE KEY UPDATE event_id = VALUES(event_id)
      """), {
        "id": identifier, "session_id": input_data["sessionId"], "event_id": input_data["eventId"],
        "kind": input_data["kind"], "object_key": input_data["objectKey"],
        "content_type": input_data["contentType"], "byte_size": input_data["byteSize"],
        "sha256": input_data["sha256"], "encryption_iv": input_data["encryptionIv"],
        "encryption_tag": input_data["encryptionTag"], "expires_at": to_mariadb_datetime(input_data["expiresAt"])
      })
      condition = "event_id = :value" if input_data["eventId"] else "id = :value"
      value = input_data["eventId"] or identifier
      result = await connection.execute(text(_select_evidence(condition)), {"value": value})
      row = result.mappings().first()
      if not row:
        raise RuntimeError("Evidence metadata write did not return a row")
      return map_evidence(row)

  async def find_by_id(self, evidence_id: str) -> dict[str, Any] | None:
    async with self._engine.connect() as connection:
      result = await connection.execute(text(_select_evidence("evidence.id = :value")), {"value": evidence_id})
      row = result.mappings().first()
      return map_evidence(row) if row else None

  async def find_authorized(
    self, evidence_id: str, course_ids: set[str], institutional: bool
  ) -> dict[str, Any] | None:
    if not institutional and not course_ids:
      return None
    condition = "evidence.id = :value"
    parameters: dict[str, Any] = {"value": evidence_id}
    if not institutional:
      placeholders = []
      for index, course_id in enumerate(sorted(course_ids)):
        name = f"course_id_{index}"
        placeholders.append(f":{name}")
        parameters[name] = course_id
      condition += f" AND sessions.moodle_course_id IN ({', '.join(placeholders)})"
    async with self._engine.connect() as connection:
      result = await connection.execute(text(_select_evidence(condition)), parameters)
      row = result.mappings().first()
      return map_evidence(row) if row else None

  async def audit(self, input_data: dict[str, Any]) -> None:
    async with self._engine.begin() as connection:
      await connection.execute(text("""
        INSERT INTO proctoring_evidence_audit (
          evidence_id, actor_moodle_user_id, action, ip_address, user_agent
        ) VALUES (:evidence_id, :actor_id, :action, :ip_address, :user_agent)
      """), {"evidence_id": input_data["evidenceId"], "actor_id": input_data["actorId"],
        "action": input_data["action"], "ip_address": input_data["ipAddress"],
        "user_agent": input_data["userAgent"]})

  async def find_expired(self, limit: int) -> list[dict[str, Any]]:
    async with self._engine.connect() as connection:
      result = await connection.execute(text("""
        SELECT * FROM proctoring_evidence
        WHERE expires_at <= UTC_TIMESTAMP(3) AND deleted_at IS NULL
        ORDER BY expires_at LIMIT :limit
      """), {"limit": limit})
      return [map_evidence(row) for row in result.mappings()]

  async def mark_deleted(self, evidence_id: str) -> None:
    async with self._engine.begin() as connection:
      await connection.execute(text("""
        UPDATE proctoring_evidence SET deleted_at = UTC_TIMESTAMP(3)
        WHERE id = :id AND deleted_at IS NULL
      """), {"id": evidence_id})


def _select_evidence(condition: str) -> str:
  return f"""
    SELECT evidence.*, sessions.moodle_course_id
    FROM proctoring_evidence evidence
    JOIN proctoring_sessions sessions ON sessions.id = evidence.session_id
    WHERE {condition} AND evidence.deleted_at IS NULL
  """


def map_evidence(row: Any) -> dict[str, Any]:
  return {
    "id": str(row["id"]), "sessionId": str(row["session_id"]), "eventId": row.get("event_id"),
    "courseId": row.get("moodle_course_id"), "kind": row["kind"], "objectKey": row["object_key"],
    "contentType": row["content_type"], "byteSize": int(row["byte_size"]), "sha256": row["sha256"],
    "encryptionIv": bytes(row["encryption_iv"]), "encryptionTag": bytes(row["encryption_tag"]),
    "createdAt": to_iso_datetime(row["created_at"]), "expiresAt": to_iso_datetime(row["expires_at"]),
    "deletedAt": to_iso_datetime(row["deleted_at"]) if row.get("deleted_at") else None
  }
