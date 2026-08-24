"""Validation and persistence orchestration for browser events."""

from datetime import UTC, datetime, timedelta
from typing import Any, Protocol
from uuid import UUID

from proctoring.models import SessionEventInput
from proctoring.services.sessions import SessionService


class EventRepository(Protocol):
  async def create(self, session_id: UUID, event: SessionEventInput) -> dict[str, Any]: ...


class SessionUnavailableError(ValueError):
  """Raised when an event belongs to an unavailable session."""


class EventTimestampError(ValueError):
  """Raised when an event is outside its server-accepted time window."""


class EventRateLimitError(RuntimeError):
  """Raised by persistence when one session exceeds its event rate."""


class EventService:
  """Reject invalid events before a repository transaction starts."""

  def __init__(self, session_service: SessionService, repository: EventRepository) -> None:
    self._session_service = session_service
    self._repository = repository

  async def record(self, session_id: UUID, input_data: dict[str, Any]) -> dict[str, Any]:
    event = SessionEventInput.model_validate(input_data)
    session = await self._session_service.get_active(session_id)
    if not session:
      raise SessionUnavailableError("Active session not found")

    if event.occurred_at < session.issued_at - timedelta(minutes=5):
      raise EventTimestampError("Event timestamp is outside the accepted range")
    if event.occurred_at > datetime.now(UTC) + timedelta(minutes=5):
      raise EventTimestampError("Event timestamp is outside the accepted range")
    return {"alert": None, "event": await self._repository.create(session_id, event)}
