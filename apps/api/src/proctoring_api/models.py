"""Shared request and domain contracts."""

import json
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class DeviceMode(StrEnum):
  BROWSER = "browser"
  SEB = "seb"


class FailurePolicy(StrEnum):
  BLOCK = "block"
  ALLOW_WITH_ALERT = "allow_with_alert"


class SessionStatus(StrEnum):
  PENDING = "pending"
  ACTIVE = "active"
  COMPLETED = "completed"
  EXPIRED = "expired"


class EventType(StrEnum):
  CAMERA_INTERRUPTED = "camera_interrupted"
  FACE_ABSENT = "face_absent"
  MULTIPLE_FACES = "multiple_faces"
  FACE_OUT_OF_FRAME = "face_out_of_frame"
  IDENTITY_CHECK_FAILED = "identity_check_failed"
  BIOMETRIC_MISMATCH = "biometric_mismatch"
  LIVENESS_CHECK_FAILED = "liveness_check_failed"
  PAGE_VISIBILITY_CHANGED = "page_visibility_changed"
  NETWORK_DISCONNECTED = "network_disconnected"
  NETWORK_RECONNECTED = "network_reconnected"
  SEB_EVENT = "seb_event"


class CreateSessionInput(BaseModel):
  """Session creation payload received from Moodle."""

  model_config = ConfigDict(populate_by_name=True)

  moodle_user_id: str = Field(
    min_length=1,
    validation_alias="moodleUserId",
    serialization_alias="moodleUserId"
  )
  moodle_course_id: str = Field(
    min_length=1,
    validation_alias="moodleCourseId",
    serialization_alias="moodleCourseId"
  )
  moodle_quiz_id: str = Field(
    min_length=1,
    validation_alias="moodleQuizId",
    serialization_alias="moodleQuizId"
  )
  moodle_attempt_id: str = Field(
    min_length=1,
    validation_alias="moodleAttemptId",
    serialization_alias="moodleAttemptId"
  )
  course_name: str = Field(
    min_length=1,
    max_length=255,
    validation_alias="courseName",
    serialization_alias="courseName"
  )
  quiz_name: str = Field(
    min_length=1,
    max_length=255,
    validation_alias="quizName",
    serialization_alias="quizName"
  )
  student_name: str = Field(
    min_length=1,
    max_length=255,
    validation_alias="studentName",
    serialization_alias="studentName"
  )
  student_document: str | None = Field(
    default=None,
    min_length=1,
    max_length=100,
    validation_alias="studentDocument",
    serialization_alias="studentDocument"
  )
  device_mode: DeviceMode = Field(
    validation_alias="deviceMode",
    serialization_alias="deviceMode"
  )
  issued_at: datetime = Field(validation_alias="issuedAt", serialization_alias="issuedAt")
  expires_at: datetime = Field(validation_alias="expiresAt", serialization_alias="expiresAt")
  failure_policy: FailurePolicy = Field(
    default=FailurePolicy.BLOCK,
    validation_alias="failurePolicy",
    serialization_alias="failurePolicy"
  )

  @model_validator(mode="after")
  def validate_expiration(self) -> "CreateSessionInput":
    if self.expires_at <= self.issued_at:
      raise ValueError("expiresAt must be later than issuedAt")
    return self


class ProctoringSession(CreateSessionInput):
  """Persisted session contract."""

  id: UUID
  status: SessionStatus
  created_at: datetime = Field(validation_alias="createdAt", serialization_alias="createdAt")


class SessionEventInput(BaseModel):
  """A non-visual event reported by a browser or SEB client."""

  model_config = ConfigDict(populate_by_name=True)

  client_event_id: UUID = Field(
    validation_alias="clientEventId",
    serialization_alias="clientEventId"
  )
  type: EventType
  occurred_at: datetime = Field(validation_alias="occurredAt", serialization_alias="occurredAt")
  metadata: dict[str, Any] = Field(default_factory=dict)

  @field_validator("metadata")
  @classmethod
  def validate_metadata_size(cls, value: dict[str, Any]) -> dict[str, Any]:
    try:
      size = len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())
    except (TypeError, ValueError) as error:
      raise ValueError("metadata must be JSON serializable") from error

    if size > 8192:
      raise ValueError("metadata must not exceed 8 KB")
    return value
