import asyncio
from datetime import UTC, datetime
from hashlib import sha256

from proctoring.services.evidence_crypto import EvidenceEncryptionService
from proctoring.services.worker import AnalysisUnavailable, AnalysisWorker, StagingFrameLoader
from proctoring.worker_main import LazyRuntimeProcessor


class Storage:
  def __init__(self, values):
    self.values = values

  async def get(self, key):
    return self.values[key]


def test_staging_loader_decrypts_and_validates_plaintext_hash_without_exposing_content() -> None:
  crypto = EvidenceEncryptionService(b"e" * 32)
  encrypted = crypto.encrypt(b"private-jpeg")
  loader = StagingFrameLoader(Storage({"staging/frame.enc": encrypted.ciphertext}), crypto)

  loaded = asyncio.run(loader.load({
    "objectKey": "staging/frame.enc", "encryptionIv": encrypted.iv, "encryptionTag": encrypted.tag,
    "sha256": sha256(b"private-jpeg").hexdigest(), "byteSize": len(b"private-jpeg")
  }))

  assert loaded == b"private-jpeg"


def test_staging_loader_rejects_hash_mismatch_with_sanitized_error() -> None:
  crypto = EvidenceEncryptionService(b"e" * 32)
  encrypted = crypto.encrypt(b"private-jpeg")
  loader = StagingFrameLoader(Storage({"staging/frame.enc": encrypted.ciphertext}), crypto)

  try:
    asyncio.run(loader.load({
      "objectKey": "staging/frame.enc", "encryptionIv": encrypted.iv, "encryptionTag": encrypted.tag,
      "sha256": "0" * 64, "byteSize": len(b"private-jpeg")
    }))
  except AnalysisUnavailable as error:
    assert error.code == "frame_integrity"
    assert "private-jpeg" not in repr(error)
  else:
    raise AssertionError("hash mismatch must fail")


def test_staging_loader_classifies_object_storage_failure_without_leaking_key() -> None:
  class FailingStorage:
    async def get(self, key): raise OSError(f"secret backend path {key}")

  loader = StagingFrameLoader(FailingStorage(), EvidenceEncryptionService(b"e" * 32))

  try:
    asyncio.run(loader.load({
      "objectKey": "staging/private-secret.enc", "encryptionIv": b"i" * 12,
      "encryptionTag": b"t" * 16, "sha256": "0" * 64, "byteSize": 1
    }))
  except AnalysisUnavailable as error:
    assert error.code == "analysis_unavailable"
    assert "private-secret" not in repr(error)
  else:
    raise AssertionError("storage failure must be classified")


class Models:
  def __init__(self, calls): self.calls = calls
  async def preload(self): self.calls.append("models.preload")


class FailingModels:
  def __init__(self, calls): self.calls = calls
  async def preload(self):
    self.calls.append("models.preload")
    raise RuntimeError("private preload failure")


class Queue:
  def __init__(self, calls, job, frames):
    self.calls = calls
    self.job = job
    self.frames = frames

  async def claim(self, owner, now=None): self.calls.append("queue.claim"); return self.job
  async def frames_for_job(self, job_id): return self.frames
  async def renew_lease(self, job_id, owner, now=None): self.calls.append("queue.renew"); return True
  async def complete(self, job_id, owner, result, now=None): self.calls.append(("queue.complete", result)); return True
  async def fail(self, job_id, owner, code, now=None): self.calls.append(("queue.fail", code)); return True


class Loader:
  async def load(self, frame): return b"frame"


class Processor:
  def __init__(self, calls, *, fail=False, unexpected=False, delay=0): self.calls = calls; self.fail = fail; self.unexpected = unexpected; self.delay = delay
  async def process(self, job, frames):
    self.calls.append("processor.process")
    if self.delay: await asyncio.sleep(self.delay)
    if self.unexpected: raise RuntimeError("programmer error")
    if self.fail: raise AnalysisUnavailable("model_unavailable")
    return {"face": "present", "alert": False, "events": []}
  async def unavailable(self, job):
    self.calls.append("processor.unavailable")
    return {"liveness": "unavailable", "identity": "unavailable", "profileVersion": None, "technicalAlert": True, "reasonCode": "model"}
  async def cleanup(self, job, frames, result): self.calls.append(("processor.cleanup", len(frames)))


def job(attempts=1):
  return {"id": "job-1", "sessionId": "session-1", "type": "monitoring", "attempts": attempts}


def test_worker_preloads_all_models_before_claim_and_completes_through_live_owner() -> None:
  calls = []
  worker = AnalysisWorker(Queue(calls, job(), [{"id": "frame-1"}]), Models(calls), Loader(), Processor(calls))

  assert asyncio.run(worker.run_once()) is True

  assert calls[0:2] == ["models.preload", "queue.claim"]
  assert "queue.renew" in calls
  assert ("processor.cleanup", 1) in calls
  assert calls[-1][0] == "queue.complete"


def test_worker_renews_lease_during_long_inference() -> None:
  calls = []
  worker = AnalysisWorker(
    Queue(calls, job(), [{"id": "frame-1"}]), Models(calls), Loader(), Processor(calls, delay=0.03),
    lease_renewal_seconds=0.01
  )

  asyncio.run(worker.run_once())

  assert calls.count("queue.renew") >= 2


def test_worker_reports_one_failure_and_leaves_three_attempt_policy_to_repository() -> None:
  calls = []
  worker = AnalysisWorker(Queue(calls, job(attempts=1), [{"id": "frame-1"}]), Models(calls), Loader(), Processor(calls, fail=True))

  assert asyncio.run(worker.run_once()) is True

  assert [item for item in calls if isinstance(item, tuple) and item[0] == "queue.fail"] == [
    ("queue.fail", "model_unavailable")
  ]
  assert not any(isinstance(item, tuple) and item[0] == "queue.complete" for item in calls)


def test_worker_applies_failure_policy_on_repository_owned_final_attempt() -> None:
  calls = []
  worker = AnalysisWorker(Queue(calls, job(attempts=3) | {"type": "preparation"}, [{"id": "frame-1"}]), Models(calls), Loader(), Processor(calls, fail=True))

  asyncio.run(worker.run_once())

  assert "processor.unavailable" in calls
  assert ("processor.cleanup", 1) in calls
  assert any(isinstance(item, tuple) and item[0] == "queue.complete" for item in calls)
  assert not any(isinstance(item, tuple) and item[0] == "queue.fail" for item in calls)


def test_worker_never_applies_allow_policy_to_unclassified_programmer_errors() -> None:
  calls = []
  worker = AnalysisWorker(Queue(calls, job(attempts=3) | {"type": "preparation"}, [{"id": "frame-1"}]), Models(calls), Loader(), Processor(calls, unexpected=True))

  asyncio.run(worker.run_once())

  assert "processor.unavailable" not in calls
  assert ("queue.fail", "analysis_unavailable") in calls


def test_worker_turns_preload_failure_into_a_durable_model_retry() -> None:
  calls = []
  worker = AnalysisWorker(
    Queue(calls, job(attempts=1), [{"id": "frame-1"}]),
    FailingModels(calls), Loader(), Processor(calls),
  )

  assert asyncio.run(worker.run_once()) is True

  assert calls[:2] == ["models.preload", "queue.claim"]
  assert ("queue.fail", "model_unavailable") in calls
  assert "processor.process" not in calls


def test_worker_applies_failure_policy_on_final_attempt_when_preload_is_down() -> None:
  calls = []
  worker = AnalysisWorker(
    Queue(calls, job(attempts=3) | {"type": "preparation"}, [{"id": "frame-1"}]),
    FailingModels(calls), Loader(), Processor(calls),
  )

  assert asyncio.run(worker.run_once()) is True

  assert "processor.unavailable" in calls
  assert ("processor.cleanup", 1) in calls
  assert any(isinstance(item, tuple) and item[0] == "queue.complete" for item in calls)
  assert not any(isinstance(item, tuple) and item[0] == "queue.fail" for item in calls)


def test_lazy_runtime_fallback_does_not_require_preloaded_model_adapters() -> None:
  calls = []

  class ModelsWithoutAdapters:
    deepface_adapter = None
    ssdlite_adapter = None

  class PreparationFallback:
    async def unavailable(self, session_id, job_id, policy):
      calls.append((session_id, job_id, policy))
      return {"technicalAlert": True, "policy": policy}

  processor = LazyRuntimeProcessor(
    ModelsWithoutAdapters(), object(), object(), PreparationFallback(),
    object(), object(), object(), object(),
  )

  result = asyncio.run(processor.unavailable({
    "id": "job-1", "sessionId": "session-1", "type": "preparation",
    "failurePolicy": "allow_with_alert",
  }))

  assert result == {"technicalAlert": True, "policy": "allow_with_alert"}
  assert calls == [("session-1", "job-1", "allow_with_alert")]
