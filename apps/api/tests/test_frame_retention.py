import asyncio
from datetime import UTC, datetime, timedelta

from proctoring.services.retention import FrameRetentionService


class Repository:
  def __init__(self):
    self.states = []
    self.last_interval = None
    self.retained = []

  async def reserve_interval(self, session_id, now, interval):
    if self.last_interval is not None and now - self.last_interval < interval:
      return False
    self.last_interval = now
    return True

  async def retain_staging(self, frame, kind, event_id, expires_at):
    self.retained.append((frame["objectKey"], kind, event_id))

  async def mark_cleanup(self, frame_id, state):
    self.states.append((frame_id, state))


class Storage:
  def __init__(self): self.deleted = []
  async def delete(self, key): self.deleted.append(key)


def frame(identifier="frame-1"):
  return {"id": identifier, "objectKey": f"staging/{identifier}.enc"}


def test_normal_frame_is_deleted_and_cleanup_state_is_updated() -> None:
  repository = Repository()
  storage = Storage()
  service = FrameRetentionService(repository, storage, retention_days=30)

  asyncio.run(service.discard(frame()))

  assert storage.deleted == ["staging/frame-1.enc"]
  assert repository.states == [("frame-1", "deleted")]


def test_interval_retention_is_limited_to_once_per_sixty_seconds() -> None:
  repository = Repository()
  storage = Storage()
  service = FrameRetentionService(repository, storage, retention_days=30)
  now = datetime(2026, 8, 24, 12, 0, tzinfo=UTC)

  first = asyncio.run(service.retain_interval("session-1", frame("first"), now))
  second = asyncio.run(service.retain_interval("session-1", frame("second"), now + timedelta(seconds=59)))

  assert first is True
  assert second is False
  assert repository.retained == [("staging/first.enc", "interval", None)]
  assert storage.deleted == ["staging/second.enc"]
  assert repository.states == [("first", "retained"), ("second", "deleted")]


def test_alert_evidence_reuses_encrypted_staging_object_and_marks_it_retained() -> None:
  repository = Repository()
  storage = Storage()
  service = FrameRetentionService(repository, storage, retention_days=30)

  asyncio.run(service.retain_alert(frame(), "event-1", datetime(2026, 8, 24, 12, 0, tzinfo=UTC)))

  assert repository.retained == [("staging/frame-1.enc", "alert", "event-1")]
  assert repository.states == [("frame-1", "retained")]
  assert storage.deleted == []
