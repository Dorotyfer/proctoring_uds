"""MariaDB-backed session persistence."""

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from proctoring.db.rows import parse_json, to_iso_datetime, to_mariadb_datetime
from proctoring.models import CreateSessionInput, ProctoringSession


class SqlSessionRepository:
  def __init__(self, engine: AsyncEngine) -> None:
    self._engine = engine

  async def ping(self) -> None:
    async with self._engine.connect() as connection:
      await connection.execute(text("SELECT 1"))

  async def create(self, input_data: CreateSessionInput) -> ProctoringSession:
    async with self._engine.begin() as connection:
      await connection.execute(text("""
        INSERT INTO proctoring_courses (moodle_course_id, name, updated_at)
        VALUES (:moodle_course_id, :course_name, UTC_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = VALUES(updated_at)
      """), {"moodle_course_id": input_data.moodle_course_id, "course_name": input_data.course_name})
      await connection.execute(text("""
        INSERT INTO proctoring_sessions (
          id, moodle_user_id, moodle_course_id, moodle_quiz_id, moodle_attempt_id,
          quiz_name, student_name, student_document, device_mode, issued_at, expires_at, failure_policy
        ) VALUES (
          :id, :moodle_user_id, :moodle_course_id, :moodle_quiz_id, :moodle_attempt_id,
          :quiz_name, :student_name, :student_document, :device_mode, :issued_at, :expires_at, :failure_policy
        ) ON DUPLICATE KEY UPDATE
          quiz_name = VALUES(quiz_name), student_name = VALUES(student_name),
          student_document = VALUES(student_document), failure_policy = VALUES(failure_policy)
      """), _session_parameters(input_data, uuid4()))
      return await self._find_by_attempt(connection, input_data.moodle_attempt_id)

  async def find_by_id(self, session_id: UUID) -> ProctoringSession | None:
    async with self._engine.connect() as connection:
      result = await connection.execute(text(_session_select("sessions.id = :id")), {"id": str(session_id)})
      row = result.mappings().first()
      return map_session(row) if row else None

  async def complete(self, session_id: UUID) -> ProctoringSession | None:
    async with self._engine.begin() as connection:
      result = await connection.execute(text("""
        UPDATE proctoring_sessions SET status = 'completed' WHERE id = :id
      """), {"id": str(session_id)})
      if result.rowcount == 0:
        return None
      result = await connection.execute(text(_session_select("sessions.id = :id")), {"id": str(session_id)})
      row = result.mappings().first()
      return map_session(row) if row else None

  async def _find_by_attempt(self, connection: Any, attempt_id: str) -> ProctoringSession:
    result = await connection.execute(text(_session_select("sessions.moodle_attempt_id = :attempt_id")), {"attempt_id": attempt_id})
    row = result.mappings().first()
    if not row:
      raise RuntimeError("Session upsert did not return a row")
    return map_session(row)


def _session_parameters(input_data: CreateSessionInput, session_id: UUID) -> dict[str, str | None]:
  return {
    "id": str(session_id), "moodle_user_id": input_data.moodle_user_id,
    "moodle_course_id": input_data.moodle_course_id, "moodle_quiz_id": input_data.moodle_quiz_id,
    "moodle_attempt_id": input_data.moodle_attempt_id, "quiz_name": input_data.quiz_name,
    "student_name": input_data.student_name, "student_document": input_data.student_document,
    "device_mode": input_data.device_mode.value, "issued_at": to_mariadb_datetime(input_data.issued_at),
    "expires_at": to_mariadb_datetime(input_data.expires_at), "failure_policy": input_data.failure_policy.value
  }


def _session_select(condition: str) -> str:
  return f"""
    SELECT sessions.id, sessions.moodle_user_id, sessions.moodle_course_id, sessions.moodle_quiz_id,
      sessions.moodle_attempt_id, sessions.device_mode, sessions.status, sessions.issued_at,
      sessions.expires_at, sessions.created_at, sessions.quiz_name, sessions.student_name,
      sessions.student_document, sessions.liveness_challenge, sessions.failure_policy, courses.name AS course_name
    FROM proctoring_sessions sessions
    LEFT JOIN proctoring_courses courses ON courses.moodle_course_id = sessions.moodle_course_id
    WHERE {condition}
  """


def map_session(row: Any) -> ProctoringSession:
  return ProctoringSession.model_validate({
    "id": row["id"], "moodleUserId": row["moodle_user_id"], "moodleCourseId": row["moodle_course_id"],
    "moodleQuizId": row["moodle_quiz_id"], "moodleAttemptId": row["moodle_attempt_id"],
    "courseName": row["course_name"], "quizName": row["quiz_name"], "studentName": row["student_name"],
    "studentDocument": row["student_document"], "deviceMode": row["device_mode"], "status": row["status"],
    "issuedAt": to_iso_datetime(row["issued_at"]), "expiresAt": to_iso_datetime(row["expires_at"]),
    "createdAt": to_iso_datetime(row["created_at"]), "failurePolicy": row.get("failure_policy", "block"),
    "livenessChallenge": parse_json(row.get("liveness_challenge"))
  })
