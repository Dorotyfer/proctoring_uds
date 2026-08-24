import asyncio
from datetime import UTC, datetime, timedelta
from io import BytesIO

import pytest
from PIL import Image

from proctoring.services.analysis import (
  AnalysisCapacityError,
  AnalysisQueueService,
  ChallengeExpiredError,
  ImageValidationError,
  validate_jpeg,
  read_bounded_upload,
)


def jpeg(width: int = 320, height: int = 240) -> bytes:
  output = BytesIO()
  Image.new("RGB", (width, height), "white").save(output, format="JPEG")
  return output.getvalue()


def test_validate_jpeg_rejects_non_jpeg_mime_and_trailing_polyglot_data() -> None:
  with pytest.raises(ImageValidationError, match="^Invalid JPEG upload$"):
    validate_jpeg(jpeg(), "image/png")
  with pytest.raises(ImageValidationError, match="^Invalid JPEG upload$"):
    validate_jpeg(jpeg() + b"<script>not an image</script>", "image/jpeg")


def test_validate_jpeg_returns_bounded_decoded_dimensions_and_hash() -> None:
  validated = validate_jpeg(jpeg(640, 480), "image/jpeg")

  assert validated.width == 640
  assert validated.height == 480
  assert validated.byte_size > 0
  assert len(validated.sha256) == 64


class ChunkedUpload:
  def __init__(self, payload): self.payload, self.offset = payload, 0
  async def read(self, size):
    value = self.payload[self.offset:self.offset + size]
    self.offset += len(value)
    return value


def test_streaming_upload_stops_after_jpeg_limit_without_unbounded_read() -> None:
  with pytest.raises(ImageValidationError):
    asyncio.run(read_bounded_upload(ChunkedUpload(b"x" * (200 * 1024 + 1))))


def test_challenge_uses_cryptographically_selected_turn_direction() -> None:
  service = AnalysisQueueService(MemoryRepository(), MemoryStorage(), bytes(32), turn_chooser=lambda: "turn-left")
  challenge = asyncio.run(service.issue_challenge("session-1"))
  assert challenge["steps"] == ["center", "turn-left", "center"]


class MemoryRepository:
  def __init__(self) -> None:
    self.jobs = {}
    self.challenges = {}

  async def create_challenge(self, session_id, challenge_id, steps, expires_at):
    self.challenges[challenge_id] = {"sessionId": session_id, "steps": steps, "expiresAt": expires_at, "usedAt": None}
    return self.challenges[challenge_id]

  async def get_job(self, session_id, analysis_id):
    job = self.jobs.get(analysis_id)
    return job if job and job["sessionId"] == session_id else None

  async def enqueue(self, input_data):
    existing = self.jobs.get(input_data["analysisId"])
    if existing:
      return existing, False
    active = [job for job in self.jobs.values() if job["sessionId"] == input_data["sessionId"] and job["type"] == input_data["type"] and job["state"] in {"queued", "processing"}]
    if len(active) >= (1 if input_data["type"] == "preparation" else 2):
      raise AnalysisCapacityError(10)
    job = {**input_data, "state": "queued", "attempts": 0}
    self.jobs[input_data["analysisId"]] = job
    return job, True

  async def consume_challenge_and_enqueue(self, input_data):
    challenge = self.challenges.get(input_data["challengeId"])
    if not challenge or challenge["sessionId"] != input_data["sessionId"]:
      raise ChallengeExpiredError()
    if challenge["usedAt"] or challenge["expiresAt"] <= input_data["now"]:
      raise ChallengeExpiredError()
    job, created = await self.enqueue(input_data)
    if created:
      challenge["usedAt"] = input_data["now"]
    return job, created


class MemoryStorage:
  def __init__(self): self.objects = {}
  async def put(self, key, body, content_type): self.objects[key] = body
  async def delete(self, key): self.objects.pop(key, None)


def test_preparation_duplicate_returns_canonical_job_without_consuming_capacity() -> None:
  now = datetime.now(UTC)
  repository, storage = MemoryRepository(), MemoryStorage()
  service = AnalysisQueueService(repository, storage, bytes(32), now=lambda: now)
  challenge = asyncio.run(service.issue_challenge("session-1"))

  first = asyncio.run(service.enqueue_preparation("session-1", "analysis-1", True, challenge["id"], [jpeg(), jpeg(), jpeg()]))
  duplicate = asyncio.run(service.enqueue_preparation("session-1", "analysis-1", True, challenge["id"], [jpeg(), jpeg(), jpeg()]))

  assert first == duplicate
  assert len(storage.objects) == 3
  assert repository.challenges[challenge["id"]]["usedAt"] == now


def test_preparation_challenge_is_one_use_and_expires_after_120_seconds() -> None:
  now = datetime.now(UTC)
  repository, storage = MemoryRepository(), MemoryStorage()
  service = AnalysisQueueService(repository, storage, bytes(32), now=lambda: now)
  challenge = asyncio.run(service.issue_challenge("session-1"))
  asyncio.run(service.enqueue_preparation("session-1", "analysis-1", True, challenge["id"], [jpeg(), jpeg(), jpeg()]))

  with pytest.raises(ChallengeExpiredError):
    asyncio.run(service.enqueue_preparation("session-1", "analysis-2", True, challenge["id"], [jpeg(), jpeg(), jpeg()]))

  expired = asyncio.run(service.issue_challenge("session-1"))
  late = AnalysisQueueService(repository, storage, bytes(32), now=lambda: now + timedelta(seconds=121))
  with pytest.raises(ChallengeExpiredError):
    asyncio.run(late.enqueue_preparation("session-1", "analysis-3", True, expired["id"], [jpeg(), jpeg(), jpeg()]))
