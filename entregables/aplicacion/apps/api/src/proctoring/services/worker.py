"""Durable analysis worker primitives with live leases and sanitized failures."""

import asyncio
from hashlib import sha256
import inspect
from typing import Any, Protocol
from uuid import uuid4

from proctoring.services.evidence_crypto import EvidenceCryptoError, EvidenceEncryptionService


class AnalysisUnavailable(RuntimeError):
  def __init__(self, code: str = "analysis_unavailable") -> None:
    self.code = code if _safe_code(code) else "analysis_unavailable"
    super().__init__("Analysis unavailable")


class StagingFrameLoader:
  def __init__(self, storage: Any, crypto: EvidenceEncryptionService) -> None:
    self._storage = storage
    self._crypto = crypto

  async def load(self, frame: dict[str, Any]) -> bytes:
    try:
      ciphertext = await self._storage.get(frame["objectKey"])
    except Exception as error:
      raise AnalysisUnavailable("analysis_unavailable") from error
    try:
      plaintext = self._crypto.decrypt({
        "ciphertext": ciphertext,
        "iv": bytes(frame["encryptionIv"]),
        "tag": bytes(frame["encryptionTag"]),
      })
      expected_size = int(frame["byteSize"])
      expected_hash = str(frame["sha256"])
      if len(plaintext) != expected_size or sha256(plaintext).hexdigest() != expected_hash:
        raise AnalysisUnavailable("frame_integrity")
      return plaintext
    except AnalysisUnavailable:
      raise
    except (EvidenceCryptoError, KeyError, TypeError, ValueError) as error:
      raise AnalysisUnavailable("frame_integrity") from error


class QueueRepository(Protocol):
  async def claim(self, owner_token: str, now=None) -> dict[str, Any] | None: ...
  async def frames_for_job(self, job_id: str) -> list[dict[str, Any]]: ...
  async def renew_lease(self, job_id: str, owner_token: str, now=None) -> bool: ...
  async def complete(self, job_id: str, owner_token: str, result: dict[str, Any], now=None) -> bool: ...
  async def fail(self, job_id: str, owner_token: str, code: str, now=None) -> bool: ...


class AnalysisWorker:
  def __init__(
    self,
    queue: QueueRepository,
    models: Any,
    loader: StagingFrameLoader,
    processor: Any,
    *,
    owner_token: str | None = None,
    lease_renewal_seconds: float = 40,
  ) -> None:
    if lease_renewal_seconds <= 0 or lease_renewal_seconds >= 120:
      raise ValueError("Lease renewal interval must be between zero and 120 seconds")
    self._queue = queue
    self._models = models
    self._loader = loader
    self._processor = processor
    self._owner_token = owner_token or str(uuid4())
    self._lease_renewal_seconds = lease_renewal_seconds
    self._preloaded = False

  async def run_once(self) -> bool:
    await self._preload()
    job = await self._queue.claim(self._owner_token)
    if job is None:
      return False
    frame_metadata: list[dict[str, Any]] = []
    try:
      frame_metadata = await self._queue.frames_for_job(job["id"])
      context_loader = getattr(self._queue, "context_for_job", None)
      if context_loader is not None:
        job = {**job, **await context_loader(job["id"])}
      job["frameMetadata"] = frame_metadata
      frames = [await self._loader.load(frame) for frame in frame_metadata]
      if not await self._queue.renew_lease(job["id"], self._owner_token):
        raise AnalysisUnavailable("lease_lost")
      result = await self._process_with_renewal(job, frames)
      cleanup = getattr(self._processor, "cleanup", None)
      if cleanup is not None:
        await cleanup(job, frame_metadata, result)
      if not await self._queue.complete(job["id"], self._owner_token, result):
        raise AnalysisUnavailable("lease_lost")
    except Exception as error:
      code = error.code if isinstance(error, AnalysisUnavailable) else "analysis_unavailable"
      fallback = getattr(self._processor, "unavailable", None)
      if isinstance(error, AnalysisUnavailable) and int(job.get("attempts", 0)) >= 3 and fallback is not None:
        result = await fallback(job)
        cleanup = getattr(self._processor, "cleanup", None)
        if cleanup is not None:
          await cleanup(job, frame_metadata, result)
        await self._queue.complete(job["id"], self._owner_token, result)
      else:
        await self._queue.fail(job["id"], self._owner_token, code)
    return True

  async def _preload(self) -> None:
    if self._preloaded:
      return
    result = self._models.preload()
    if inspect.isawaitable(result):
      await result
    self._preloaded = True

  async def _process_with_renewal(self, job: dict[str, Any], frames: list[bytes]) -> dict[str, Any]:
    processing = asyncio.create_task(self._processor.process(job, frames))
    try:
      while not processing.done():
        done, _ = await asyncio.wait({processing}, timeout=self._lease_renewal_seconds)
        if done:
          break
        if not await self._queue.renew_lease(job["id"], self._owner_token):
          processing.cancel()
          raise AnalysisUnavailable("lease_lost")
      return await processing
    finally:
      if not processing.done():
        processing.cancel()


def _safe_code(value: str) -> bool:
  return isinstance(value, str) and value.isascii() and len(value) <= 64 and value.replace("_", "").isalnum()
