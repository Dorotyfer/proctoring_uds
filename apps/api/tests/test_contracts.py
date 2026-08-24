import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError

from proctoring_api.models import CreateSessionInput, FailurePolicy, SessionEventInput


def valid_session_payload() -> dict[str, str | None]:
  return {
    "moodleUserId": "student-1",
    "moodleCourseId": "course-1",
    "moodleQuizId": "quiz-1",
    "moodleAttemptId": "attempt-1",
    "courseName": "Applied Security",
    "quizName": "Final quiz",
    "studentName": "Student One",
    "studentDocument": None,
    "deviceMode": "browser",
    "issuedAt": "2026-08-24T12:00:00Z",
    "expiresAt": "2026-08-24T12:30:00Z"
  }


def test_session_contract_accepts_a_valid_pending_browser_session() -> None:
  session = CreateSessionInput(
    **valid_session_payload()
  )

  assert session.device_mode.value == "browser"
  assert session.expires_at > session.issued_at
  assert session.failure_policy == FailurePolicy.BLOCK
  assert session.model_dump(by_alias=True)["failurePolicy"] == "block"


def test_session_contract_rejects_an_expiration_before_issue_time() -> None:
  payload = valid_session_payload()
  payload["expiresAt"] = "2026-08-24T12:00:00Z"

  with pytest.raises(ValidationError, match="expiresAt must be later than issuedAt"):
    CreateSessionInput(**payload)


def test_session_contract_accepts_rfc3339_json_and_round_trips_camel_case_utc() -> None:
  payload = valid_session_payload()
  payload["issuedAt"] = "2026-08-24T15:00:00+03:00"
  payload["expiresAt"] = "2026-08-24T15:30:00+03:00"

  session = CreateSessionInput.model_validate_json(json.dumps(payload))
  wire = json.loads(session.model_dump_json(by_alias=True))

  assert session.issued_at == datetime(2026, 8, 24, 12, 0, tzinfo=UTC)
  assert wire["issuedAt"] == "2026-08-24T12:00:00Z"
  assert wire["expiresAt"] == "2026-08-24T12:30:00Z"
  assert wire["moodleUserId"] == "student-1"
  assert "moodle_user_id" not in wire


@pytest.mark.parametrize("issued_at", [
  "2026-08-24T12:00:00",
  "2026-08-24 12:00:00Z",
  datetime(2026, 8, 24, 12, 0),
  datetime(2026, 8, 24, 12, 0, tzinfo=UTC)
])
def test_session_contract_rejects_non_wire_or_timezone_less_timestamps(
  issued_at: str | datetime
) -> None:
  payload = valid_session_payload()
  payload["issuedAt"] = issued_at

  with pytest.raises(ValidationError, match="RFC3339"):
    CreateSessionInput(**payload)


def test_session_contract_trims_legacy_strings_and_rejects_whitespace_only_values() -> None:
  payload = valid_session_payload()
  payload.update({
    "moodleUserId": " student-1 ",
    "moodleCourseId": " course-1 ",
    "moodleQuizId": " quiz-1 ",
    "moodleAttemptId": " attempt-1 ",
    "courseName": " Applied Security ",
    "quizName": " Final quiz ",
    "studentName": " Student One ",
    "studentDocument": " 12345 "
  })

  session = CreateSessionInput(**payload)

  assert session.student_document == "12345"
  assert session.course_name == "Applied Security"

  payload["studentName"] = " \t "
  with pytest.raises(ValidationError):
    CreateSessionInput(**payload)


def test_event_contract_defaults_empty_metadata_and_rejects_large_metadata() -> None:
  event = SessionEventInput(
    clientEventId=uuid4(),
    type="face_absent",
    occurredAt="2026-08-24T12:00:00Z"
  )

  assert event.metadata == {}

  with pytest.raises(ValidationError, match="metadata must not exceed 8 KB"):
    SessionEventInput(
      clientEventId=uuid4(),
      type="face_absent",
      occurredAt="2026-08-24T12:00:00Z",
      metadata={"detail": "x" * 8192}
    )


def test_event_contract_rejects_a_timezone_less_json_timestamp() -> None:
  with pytest.raises(ValidationError, match="RFC3339"):
    SessionEventInput(
      clientEventId=uuid4(),
      type="face_absent",
      occurredAt="2026-08-24T12:00:00"
    )


def test_failure_policy_defaults_to_block() -> None:
  assert FailurePolicy.BLOCK.value == "block"
