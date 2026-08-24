import asyncio
from uuid import UUID

import pytest

from proctoring_api.db.rows import parse_json, to_iso_datetime, to_mariadb_datetime
from proctoring_api.models import CreateSessionInput, FailurePolicy, SessionEventInput
from proctoring_api.repositories.events import EventRateLimitError, SqlEventRepository
from proctoring_api.repositories.evidence import SqlEvidenceRepository
from proctoring_api.repositories.sessions import SqlSessionRepository


def test_row_helpers_normalize_mariadb_wire_values() -> None:
  assert parse_json('{"faceCount":1}') == {"faceCount": 1}
  assert parse_json({"faceCount": 1}) == {"faceCount": 1}
  assert to_iso_datetime("2026-08-20 12:30:00.123") == "2026-08-20T12:30:00.123Z"
  assert to_mariadb_datetime("2026-08-20T12:30:00.123Z") == "2026-08-20 12:30:00.123"


class Result:
  def __init__(self, rows=None, rowcount=1):
    self._rows = rows or []
    self.rowcount = rowcount

  def mappings(self): return self
  def first(self): return self._rows[0] if self._rows else None


class Transaction:
  def __init__(self, connection): self.connection = connection
  async def __aenter__(self): return self.connection
  async def __aexit__(self, *_): return None


class Connection:
  def __init__(self, results):
    self.results = iter(results)
    self.statements = []

  def begin(self): return Transaction(self)

  async def execute(self, statement, parameters=None):
    self.statements.append((str(statement), parameters))
    return next(self.results)


class Engine:
  def __init__(self, connection): self.connection = connection
  def begin(self): return self.connection.begin()


def input_data() -> CreateSessionInput:
  return CreateSessionInput.model_validate({
    "moodleUserId": "student-1", "moodleCourseId": "course-1", "moodleQuizId": "quiz-1", "moodleAttemptId": "attempt-1",
    "courseName": "Course", "quizName": "Quiz", "studentName": "Student", "studentDocument": None, "deviceMode": "browser",
    "issuedAt": "2026-08-24T12:00:00Z", "expiresAt": "2026-08-24T12:30:00Z"
  })


def session_row():
  return {"id": "e3d9cce1-a5b8-4bfe-88e1-68a57475266d", "moodle_user_id": "student-1", "moodle_course_id": "course-1", "moodle_quiz_id": "quiz-1", "moodle_attempt_id": "attempt-1", "course_name": "Course", "quiz_name": "Quiz", "student_name": "Student", "student_document": None, "device_mode": "browser", "status": "pending", "issued_at": "2026-08-24 12:00:00.000", "expires_at": "2026-08-24 12:30:00.000", "created_at": "2026-08-24 12:00:00.000"}


def test_session_repository_upserts_course_and_attempt_then_maps_the_selected_row() -> None:
  connection = Connection([Result(), Result(), Result([session_row()])])
  session = asyncio.run(SqlSessionRepository(Engine(connection)).create(input_data()))

  assert session.id == UUID("e3d9cce1-a5b8-4bfe-88e1-68a57475266d")
  assert session.course_name == "Course"
  assert "INSERT INTO proctoring_courses" in connection.statements[0][0]
  assert "ON DUPLICATE KEY UPDATE" in connection.statements[1][0]
  assert connection.statements[1][1]["moodle_attempt_id"] == "attempt-1"


def test_session_repository_persists_and_rereads_failure_policy() -> None:
  allowed = input_data().model_copy(update={"failure_policy": FailurePolicy.ALLOW_WITH_ALERT})
  connection = Connection([Result(), Result(), Result([session_row() | {"failure_policy": "allow_with_alert"}])])
  session = asyncio.run(SqlSessionRepository(Engine(connection)).create(allowed))

  assert connection.statements[1][1]["failure_policy"] == "allow_with_alert"
  assert session.failure_policy.value == "allow_with_alert"


def event_input() -> SessionEventInput:
  return SessionEventInput.model_validate({"clientEventId": "56cc96a8-2ff1-41ca-9917-dd967c297319", "type": "face_absent", "occurredAt": "2026-08-24T12:00:00Z"})


def test_event_repository_returns_existing_event_before_rate_counting() -> None:
  existing = {"id": "3a60ebc0-c0be-4a2d-a2ce-a49cd9e2f20f", "session_id": "e3d9cce1-a5b8-4bfe-88e1-68a57475266d", "client_event_id": "56cc96a8-2ff1-41ca-9917-dd967c297319", "type": "face_absent", "occurred_at": "2026-08-24 12:00:00.000", "metadata": "{}", "received_at": "2026-08-24 12:00:01.000"}
  connection = Connection([Result([{"id": existing["session_id"], "status": "active"}]), Result([existing])])

  event = asyncio.run(SqlEventRepository(Engine(connection)).create(UUID(existing["session_id"]), event_input()))

  assert event["id"] == UUID(existing["id"])
  assert len(connection.statements) == 2


def test_event_repository_enforces_the_120_per_minute_limit_inside_the_locked_transaction() -> None:
  connection = Connection([Result([{"id": "e3d9cce1-a5b8-4bfe-88e1-68a57475266d", "status": "active"}]), Result(), Result([{"total": 120}])])

  with pytest.raises(EventRateLimitError):
    asyncio.run(SqlEventRepository(Engine(connection)).create(UUID("e3d9cce1-a5b8-4bfe-88e1-68a57475266d"), event_input()))
  assert "FOR UPDATE" in connection.statements[0][0]


def test_event_repository_revalidates_locked_session_state_before_idempotency() -> None:
  connection = Connection([Result()])
  from proctoring_api.services.events import SessionUnavailableError

  with pytest.raises(SessionUnavailableError):
    asyncio.run(SqlEventRepository(Engine(connection)).create(UUID("e3d9cce1-a5b8-4bfe-88e1-68a57475266d"), event_input()))
  assert "expires_at > UTC_TIMESTAMP(3)" in connection.statements[0][0]


class EvidenceEngine:
  def __init__(self, connection): self.connection = connection
  def begin(self): return self.connection.begin()


def evidence_row() -> dict:
  return {
    "id": "62d23d73-0d40-4d73-b97d-4443718b602e", "session_id": "e3d9cce1-a5b8-4bfe-88e1-68a57475266d",
    "event_id": "3a60ebc0-c0be-4a2d-a2ce-a49cd9e2f20f", "moodle_course_id": "course-1", "kind": "alert",
    "object_key": "session-1/alert/canonical.enc", "content_type": "image/jpeg", "byte_size": 4,
    "sha256": "a" * 64, "encryption_iv": b"i" * 12, "encryption_tag": b"t" * 16,
    "created_at": "2026-08-24 12:00:00.000", "expires_at": "2026-09-23 12:00:00.000", "deleted_at": None
  }


def test_evidence_repository_upsert_rereads_the_canonical_event_record() -> None:
  connection = Connection([Result(), Result([evidence_row()])])
  repository = SqlEvidenceRepository(EvidenceEngine(connection))

  evidence = asyncio.run(repository.create({
    "sessionId": "e3d9cce1-a5b8-4bfe-88e1-68a57475266d", "eventId": "3a60ebc0-c0be-4a2d-a2ce-a49cd9e2f20f",
    "kind": "alert", "objectKey": "session-1/alert/new-upload.enc", "contentType": "image/jpeg",
    "byteSize": 4, "sha256": "a" * 64, "encryptionIv": b"i" * 12, "encryptionTag": b"t" * 16,
    "expiresAt": "2026-09-23T12:00:00.000Z"
  }))

  assert "ON DUPLICATE KEY UPDATE event_id = VALUES(event_id)" in connection.statements[0][0]
  assert "WHERE event_id = :value" in connection.statements[1][0]
  assert evidence["objectKey"] == "session-1/alert/canonical.enc"
