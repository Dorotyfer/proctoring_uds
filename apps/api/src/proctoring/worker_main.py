"""Independent durable inference worker entrypoint."""

import argparse
import asyncio
import sys
from typing import Any

from proctoring.config import Settings
from proctoring.main import create_runtime_dependencies
from proctoring.model_runtime import LocalModelBundle, REQUIRED_WORKER_MODEL_IDS
from proctoring.repositories.effects import SqlAnalysisEffectsRepository
from proctoring.repositories.monitoring import SqlMonitoringRepository
from proctoring.repositories.sface import SqlSFaceProfileRepository
from proctoring.services.effects import PreparationEffects
from proctoring.services.evidence_crypto import EvidenceEncryptionService
from proctoring.services.monitoring import ConfirmationService, MonitoringCadence
from proctoring.services.persistent_effects import PersistentMonitoringEffects, PersistentPreparationEffects
from proctoring.services.processor import AnalysisProcessor
from proctoring.services.profiles import MonitoringIdentityService, SFaceProfileService
from proctoring.services.retention import FrameRetentionService
from proctoring.services.vision import DescriptorCipher, SFaceVerifier
from proctoring.services.worker import AnalysisWorker, StagingFrameLoader


class LazyRuntimeProcessor:
  def __init__(self, models: LocalModelBundle, settings: Settings, *dependencies: Any) -> None:
    self._models = models
    self._settings = settings
    self._dependencies = dependencies
    self._processor: AnalysisProcessor | None = None
    self._fallback_processor: AnalysisProcessor | None = None

  def _get(self) -> AnalysisProcessor:
    if self._processor is None:
      if self._models.deepface_adapter is None or self._models.ssdlite_adapter is None:
        raise RuntimeError("Required local models were not preloaded")
      self._processor = self._build(
        self._models.deepface_adapter, self._models.ssdlite_adapter
      )
    return self._processor

  def _fallback(self) -> AnalysisProcessor:
    if self._fallback_processor is None:
      self._fallback_processor = self._build(None, None)
    return self._fallback_processor

  def _build(self, faces: Any, objects: Any) -> AnalysisProcessor:
    return AnalysisProcessor(faces, objects, *self._dependencies)

  async def process(self, job: dict[str, Any], frames: list[bytes]) -> dict[str, Any]:
    job = {
      **job,
      "centerThreshold": self._settings.liveness_center_threshold,
      "turnThreshold": self._settings.liveness_turn_threshold,
    }
    return await self._get().process(job, frames)

  async def unavailable(self, job: dict[str, Any]) -> dict[str, Any]:
    return await self._fallback().unavailable(job)

  async def cleanup(self, job: dict[str, Any], frames: list[dict[str, Any]], result: dict[str, Any]) -> None:
    processor = self._processor or self._fallback()
    await processor.cleanup(job, frames, result)


async def run_worker(*, once: bool = False) -> None:
  settings = Settings.from_process_environment()
  if not settings.inference_requested:
    raise RuntimeError("Worker inference must be explicitly enabled")
  dependencies = create_runtime_dependencies(settings)
  try:
    queue = dependencies.analyses
    if queue is None:
      raise RuntimeError("Analysis queue unavailable")
    models = LocalModelBundle(
      settings.model_manifest_path,
      required_model_ids=REQUIRED_WORKER_MODEL_IDS,
    )
    monitoring_repository = SqlMonitoringRepository(dependencies.engine)
    sface_repository = SqlSFaceProfileRepository(dependencies.engine)
    cipher = DescriptorCipher(settings.biometric_encryption_key_bytes)
    verifier = SFaceVerifier(settings.sface_cosine_threshold)
    profiles = SFaceProfileService(sface_repository, cipher, verifier)
    monitoring_identity = MonitoringIdentityService(sface_repository, cipher, verifier)
    retention = FrameRetentionService(
      monitoring_repository, dependencies.object_storage, retention_days=settings.evidence_retention_days
    )
    effect_repository = SqlAnalysisEffectsRepository(dependencies.engine, dependencies.evidence_service)
    preparation_effects = PersistentPreparationEffects(effect_repository, retention)
    monitoring_effects = PersistentMonitoringEffects(effect_repository, retention)
    processor = LazyRuntimeProcessor(
      models,
      settings,
      profiles,
      preparation_effects,
      MonitoringCadence(monitoring_repository, sface_interval_seconds=settings.sface_interval_seconds),
      ConfirmationService(monitoring_repository),
      monitoring_identity,
      monitoring_effects,
    )
    worker = AnalysisWorker(
      queue, models,
      StagingFrameLoader(
        dependencies.object_storage, EvidenceEncryptionService(settings.evidence_encryption_key_bytes)
      ),
      processor,
    )
    while True:
      claimed = await worker.run_once()
      if once:
        return
      if not claimed:
        await asyncio.sleep(1)
  finally:
    await dependencies.close()


def main(arguments: list[str] | None = None) -> None:
  parser = argparse.ArgumentParser(description="Run the proctoring inference worker")
  parser.add_argument("--once", action="store_true")
  options = parser.parse_args(arguments)
  try:
    asyncio.run(run_worker(once=options.once))
  except Exception:
    print("Worker unavailable", file=sys.stderr)
    raise SystemExit(1)


if __name__ == "__main__":
  main()
