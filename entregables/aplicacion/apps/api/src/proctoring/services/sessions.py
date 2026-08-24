"""Session business rules independent of HTTP and SQLAlchemy."""

from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID

from proctoring.models import CreateSessionInput, ProctoringSession, SessionStatus


class SessionRepository(Protocol):
  async def create(self, input_data: CreateSessionInput) -> ProctoringSession: ...
  async def find_by_id(self, session_id: UUID) -> ProctoringSession | None: ...
  async def complete(self, session_id: UUID) -> ProctoringSession | None: ...


class SessionService:
  """Coordinates idempotent session writes and active-session rules."""

  def __init__(self, repository: SessionRepository) -> None:
    self._repository = repository

  async def create(self, input_data: CreateSessionInput) -> ProctoringSession:
    return await self._repository.create(input_data)

  async def get(self, session_id: UUID) -> ProctoringSession | None:
    return await self._repository.find_by_id(session_id)

  async def get_active(self, session_id: UUID) -> ProctoringSession | None:
    session = await self.get(session_id)
    if not session or session.status not in {SessionStatus.PENDING, SessionStatus.ACTIVE}:
      return None
    if session.expires_at <= datetime.now(UTC):
      return None
    return session

  async def complete(self, session_id: UUID) -> ProctoringSession | None:
    return await self._repository.complete(session_id)
