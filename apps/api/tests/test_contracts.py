from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError

from proctoring_api.models import CreateSessionInput, FailurePolicy, SessionEventInput


def test_session_contract_accepts_a_valid_pending_browser_session() -> None:
  issued_at = datetime(2026, 8, 24, 12, 0, tzinfo=UTC)
  session = CreateSessionInput(
    moodleUserId="student-1",
    moodleCourseId="course-1",
    moodleQuizId="quiz-1",
    moodleAttemptId="attempt-1",
    courseName="Applied Security",
    quizName="Final quiz",
    studentName="Student One",
    studentDocument=None,
    deviceMode="browser",
    issuedAt=issued_at,
    expiresAt=issued_at + timedelta(minutes=30)
  )

  assert session.device_mode.value == "browser"
  assert session.expires_at > session.issued_at
  assert session.failure_policy == FailurePolicy.BLOCK
  assert session.model_dump(by_alias=True)["failurePolicy"] == "block"


def test_session_contract_rejects_an_expiration_before_issue_time() -> None:
  issued_at = datetime(2026, 8, 24, 12, 0, tzinfo=UTC)

  with pytest.raises(ValidationError, match="expiresAt must be later than issuedAt"):
    CreateSessionInput(
      moodleUserId="student-1",
      moodleCourseId="course-1",
      moodleQuizId="quiz-1",
      moodleAttemptId="attempt-1",
      courseName="Applied Security",
      quizName="Final quiz",
      studentName="Student One",
      studentDocument=None,
      deviceMode="seb",
      issuedAt=issued_at,
      expiresAt=issued_at
    )


def test_event_contract_defaults_empty_metadata_and_rejects_large_metadata() -> None:
  event = SessionEventInput(
    clientEventId=uuid4(),
    type="face_absent",
    occurredAt=datetime(2026, 8, 24, 12, 0, tzinfo=UTC)
  )

  assert event.metadata == {}

  with pytest.raises(ValidationError, match="metadata must not exceed 8 KB"):
    SessionEventInput(
      clientEventId=uuid4(),
      type="face_absent",
      occurredAt=datetime(2026, 8, 24, 12, 0, tzinfo=UTC),
      metadata={"detail": "x" * 8192}
    )


def test_failure_policy_defaults_to_block() -> None:
  assert FailurePolicy.BLOCK.value == "block"
