"""Bounded encrypted staging and durable analysis queue orchestration."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from io import BytesIO
from typing import Any, Callable, Protocol
from uuid import uuid4

from PIL import Image, UnidentifiedImageError

from proctoring.services.evidence_crypto import EvidenceEncryptionService


MAX_JPEG_BYTES = 200 * 1024
MIN_WIDTH, MIN_HEIGHT = 320, 240
MAX_WIDTH, MAX_HEIGHT = 1280, 720
CHALLENGE_TTL = timedelta(seconds=120)
MAX_JPEG_PIXELS = MAX_WIDTH * MAX_HEIGHT


class ImageValidationError(ValueError):
  """A deliberately generic upload validation failure."""


class ChallengeExpiredError(ValueError):
  """Raised when a challenge cannot be consumed exactly once."""


class ConsentRequiredError(ValueError):
  """Raised before a biometric preparation upload is staged."""


class AnalysisCapacityError(RuntimeError):
  def __init__(self, retry_after_seconds: int) -> None:
    super().__init__("Analysis queue is saturated")
    self.retry_after_seconds = retry_after_seconds


class AmbiguousEnqueueError(RuntimeError):
  """A database outcome whose commit acknowledgement cannot be trusted."""


@dataclass(frozen=True)
class ValidatedJpeg:
  data: bytes
  byte_size: int
  width: int
  height: int
  sha256: str


class AnalysisRepository(Protocol):
  async def get_job(self, session_id: str, analysis_id: str) -> dict[str, Any] | None: ...
  async def create_challenge(self, session_id: str, challenge_id: str, steps: list[str], expires_at: datetime) -> dict[str, Any]: ...
  async def enqueue(self, input_data: dict[str, Any]) -> tuple[dict[str, Any], bool]: ...
  async def consume_challenge_and_enqueue(self, input_data: dict[str, Any]) -> tuple[dict[str, Any], bool]: ...
  async def monitoring_status(self, session_id: str, now: datetime) -> dict[str, Any]: ...
  async def job_frame_keys(self, session_id: str, analysis_id: str) -> set[str]: ...
  async def referenced_staging_keys(self, keys: list[str]) -> set[str]: ...


class EncryptedObjectStorage(Protocol):
  async def put(self, key: str, body: bytes, content_type: str) -> None: ...
  async def delete(self, key: str) -> None: ...
  async def list_prefix(self, prefix: str) -> list[dict[str, Any]]: ...


def validate_jpeg(data: bytes, content_type: str | None) -> ValidatedJpeg:
  """Decode a complete JPEG without preserving EXIF or diagnostic image data."""

  if content_type != "image/jpeg" or not isinstance(data, bytes) or not data or len(data) > MAX_JPEG_BYTES:
    raise ImageValidationError("Invalid JPEG upload")
  if not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
    raise ImageValidationError("Invalid JPEG upload")
  try:
    with Image.open(BytesIO(data)) as image:
      if image.format != "JPEG":
        raise ImageValidationError("Invalid JPEG upload")
      width, height = image.size
      if not MIN_WIDTH <= width <= MAX_WIDTH or not MIN_HEIGHT <= height <= MAX_HEIGHT or width * height > MAX_JPEG_PIXELS:
        raise ImageValidationError("Invalid JPEG upload")
      image.verify()
    with Image.open(BytesIO(data)) as image:
      image.load()
      width, height = image.size
  except (Image.DecompressionBombError, OSError, UnidentifiedImageError, ValueError) as error:
    raise ImageValidationError("Invalid JPEG upload") from error
  if not MIN_WIDTH <= width <= MAX_WIDTH or not MIN_HEIGHT <= height <= MAX_HEIGHT:
    raise ImageValidationError("Invalid JPEG upload")
  return ValidatedJpeg(data, len(data), width, height, sha256(data).hexdigest())


async def read_bounded_upload(upload: Any) -> bytes:
  """Read multipart input in bounded chunks before image validation."""
  chunks: list[bytes] = []
  size = 0
  while True:
    chunk = await upload.read(64 * 1024)
    if not chunk:
      break
    size += len(chunk)
    if size > MAX_JPEG_BYTES:
      raise ImageValidationError("Invalid JPEG upload")
    chunks.append(chunk)
  return b"".join(chunks)


class AnalysisQueueService:
  """Stages encrypted JPEGs before a repository atomically exposes a durable job."""

  def __init__(
    self,
    repository: AnalysisRepository,
    storage: EncryptedObjectStorage,
    encryption_key: bytes,
    *,
    now: Callable[[], datetime] | None = None,
    turn_chooser: Callable[[], str] | None = None
  ) -> None:
    self._repository = repository
    self._storage = storage
    self._crypto = EvidenceEncryptionService(encryption_key)
    self._now = now or (lambda: datetime.now(UTC))
    self._turn_chooser = turn_chooser or _random_turn

  async def issue_challenge(self, session_id: str) -> dict[str, Any]:
    challenge_id = str(uuid4())
    expires_at = self._now() + CHALLENGE_TTL
    steps = ["center", self._turn_chooser(), "center"]
    if steps[1] not in {"turn-left", "turn-right"}:
      raise ValueError("Invalid liveness challenge")
    await self._repository.create_challenge(session_id, challenge_id, steps, expires_at)
    return {"id": challenge_id, "steps": steps, "expiresAt": expires_at}

  async def enqueue_preparation(
    self, session_id: str, analysis_id: str, consent_accepted: bool, challenge_id: str, frames: list[bytes],
    content_types: list[str | None] | None = None
  ) -> dict[str, Any]:
    if not consent_accepted:
      raise ConsentRequiredError("Consent is required")
    if len(frames) != 3:
      raise ImageValidationError("Invalid JPEG upload")
    existing = await self._repository.get_job(session_id, analysis_id)
    if existing:
      return existing
    uploads = await self._stage(session_id, analysis_id, frames, content_types)
    try:
      job, created = await self._repository.consume_challenge_and_enqueue({
        "sessionId": session_id, "analysisId": analysis_id, "type": "preparation", "challengeId": challenge_id,
        "consentAccepted": True, "frames": uploads, "now": self._now()
      })
    except AmbiguousEnqueueError:
      return await self._recover_enqueue(session_id, analysis_id, uploads)
    except Exception:
      await self._delete_uploads(uploads)
      raise
    if not created:
      await self._delete_uploads(uploads)
    return job

  async def enqueue_monitoring(
    self, session_id: str, analysis_id: str, frame: bytes, content_type: str | None = "image/jpeg"
  ) -> dict[str, Any]:
    existing = await self._repository.get_job(session_id, analysis_id)
    if existing:
      return existing
    uploads = await self._stage(session_id, analysis_id, [frame], [content_type])
    try:
      job, created = await self._repository.enqueue({
        "sessionId": session_id, "analysisId": analysis_id, "type": "monitoring", "frames": uploads,
        "now": self._now()
      })
    except AmbiguousEnqueueError:
      return await self._recover_enqueue(session_id, analysis_id, uploads)
    except Exception:
      await self._delete_uploads(uploads)
      raise
    if not created:
      await self._delete_uploads(uploads)
    return job

  async def get(self, session_id: str, analysis_id: str) -> dict[str, Any] | None:
    """Return only the durable, metadata-free job projection owned by this session."""

    return await self._repository.get_job(session_id, analysis_id)

  async def monitoring_status(self, session_id: str) -> dict[str, Any]:
    return await self._repository.monitoring_status(session_id, self._now())

  async def _stage(
    self, session_id: str, analysis_id: str, frames: list[bytes], content_types: list[str | None] | None
  ) -> list[dict[str, Any]]:
    types = content_types or ["image/jpeg"] * len(frames)
    if len(types) != len(frames):
      raise ImageValidationError("Invalid JPEG upload")
    uploads: list[dict[str, Any]] = []
    try:
      for index, (data, content_type) in enumerate(zip(frames, types, strict=True)):
        validated = validate_jpeg(data, content_type)
        encrypted = self._crypto.encrypt(validated.data)
        key = f"staging/{session_id}/{analysis_id}/{index}-{uuid4()}.enc"
        await self._storage.put(key, encrypted.ciphertext, "application/octet-stream")
        uploads.append({
          "objectKey": key, "encryptionIv": encrypted.iv, "encryptionTag": encrypted.tag,
          "sha256": validated.sha256, "byteSize": validated.byte_size,
          "width": validated.width, "height": validated.height
        })
    except Exception:
      await self._delete_uploads(uploads)
      raise
    return uploads

  async def _delete_uploads(self, uploads: list[dict[str, Any]]) -> None:
    for upload in uploads:
      try:
        await self._storage.delete(upload["objectKey"])
      except Exception as error:
        raise StagingCleanupError(upload["objectKey"]) from error

  async def _recover_enqueue(self, session_id: str, analysis_id: str, uploads: list[dict[str, Any]]) -> dict[str, Any]:
    """Resolve acknowledged-late commits without deleting possible canonical frame objects."""
    canonical = await self._repository.get_job(session_id, analysis_id)
    if canonical:
      keys = await self._repository.job_frame_keys(session_id, analysis_id)
      await self._delete_uploads([upload for upload in uploads if upload["objectKey"] not in keys])
      return canonical
    await self._delete_uploads(uploads)
    raise RuntimeError("Analysis enqueue unavailable")

  async def purge_orphan_staging(self, before: datetime) -> int:
    objects = await self._storage.list_prefix("staging/")
    aged = [item for item in objects if item.get("lastModified") and item["lastModified"] < before]
    referenced = await self._repository.referenced_staging_keys([item["key"] for item in aged])
    deleted = 0
    for item in aged:
      if item["key"] not in referenced:
        await self._storage.delete(item["key"])
        deleted += 1
    return deleted


class StagingCleanupError(RuntimeError):
  """Safe staging identifier for retryable cleanup; no image data is exposed."""

  def __init__(self, object_key: str) -> None:
    super().__init__(f"Staging cleanup pending: {object_key}")


def _random_turn() -> str:
  from secrets import choice
  return choice(("turn-left", "turn-right"))
