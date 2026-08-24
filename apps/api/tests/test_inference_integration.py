import os
from pathlib import Path

import pytest

from proctoring.manifest import ManifestValidationError, validate_model_manifest
from proctoring.model_runtime import LocalModelBundle


@pytest.mark.inference
def test_release_ready_local_models_preload_without_download() -> None:
  configured = os.environ.get("MODEL_MANIFEST_PATH")
  if not configured:
    pytest.skip("MODEL_MANIFEST_PATH is not configured with approved local weights")
  path = Path(configured)
  try:
    manifest = validate_model_manifest(path, require_artifacts=True)
  except ManifestValidationError as error:
    pytest.skip(f"approved local model artifacts unavailable: {error}")
  if manifest.get("releaseReady") is not True:
    pytest.skip("model manifest is explicitly release-blocking")

  bundle = LocalModelBundle(path, required_model_ids=frozenset({
    "opencv-face-detection-yunet-2023mar", "deepface-sface", "deepface-fasnet-v2",
    "deepface-fasnet-v1se", "torchvision-ssdlite320-mobilenet-v3-large",
  }))
  bundle.preload()

  assert bundle.deepface_adapter is not None
  assert bundle.ssdlite_adapter is not None
