"""Offline weight and release inventory validation."""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


SHA256 = re.compile(r"^[a-fA-F0-9]{64}$")


class ManifestValidationError(ValueError):
  """Raised when an inventory or offline weight manifest is not release-safe."""


def validate_inventory(path: Path, release_mode: bool = False) -> dict[str, Any]:
  """Validate inventory structure and release hashes without fetching artifacts."""

  inventory = _load_object(path, "inventory")
  if inventory.get("version") != 1:
    raise ManifestValidationError("inventory.version must be 1")

  for collection in ("packages", "models"):
    entries = inventory.get(collection)
    if not isinstance(entries, list) or not entries:
      raise ManifestValidationError(f"inventory.{collection} must be a non-empty list")
    for index, entry in enumerate(entries):
      if not isinstance(entry, dict) or not isinstance(entry.get("name"), str):
        raise ManifestValidationError(f"inventory.{collection}[{index}] must name an artifact")
      if release_mode and not _is_sha256(entry.get("sha256")):
        raise ManifestValidationError(
          f"inventory.{collection}[{index}].sha256 must be a 64-character SHA-256"
        )

  if release_mode and inventory.get("releaseReady") is not True:
    raise ManifestValidationError("inventory.releaseReady must be true for release mode")
  return inventory


def validate_model_manifest(path: Path, require_artifacts: bool) -> dict[str, Any]:
  """Validate offline-only weights and optionally verify local approved artifacts."""

  manifest = _load_object(path, "model manifest")
  if manifest.get("version") != 1:
    raise ManifestValidationError("model manifest version must be 1")
  if manifest.get("offlineOnly") is not True:
    raise ManifestValidationError("model manifest must set offlineOnly to true")
  weights_directory = manifest.get("weightsDirectory")
  models = manifest.get("models")
  if not isinstance(weights_directory, str) or not weights_directory:
    raise ManifestValidationError("model manifest must provide weightsDirectory")
  if not isinstance(models, list) or not models:
    raise ManifestValidationError("model manifest must provide models")

  weights_root = Path(weights_directory).resolve()
  for index, model in enumerate(models):
    _validate_model_entry(model, index)
    if require_artifacts:
      _validate_model_artifact(weights_root, model, index)
  return manifest


def main(arguments: list[str] | None = None) -> int:
  """Run a deterministic, offline validation check for a release inventory."""

  parser = argparse.ArgumentParser(description="Validate proctoring artifact inventory")
  parser.add_argument("--inventory", type=Path, required=True)
  parser.add_argument("--release", action="store_true")
  options = parser.parse_args(arguments)
  try:
    validate_inventory(options.inventory, release_mode=options.release)
  except ManifestValidationError as error:
    print(f"manifest validation failed: {error}", file=sys.stderr)
    return 1
  return 0


def _load_object(path: Path, label: str) -> dict[str, Any]:
  try:
    data = json.loads(path.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError) as error:
    raise ManifestValidationError(f"{label} cannot be read") from error
  if not isinstance(data, dict):
    raise ManifestValidationError(f"{label} must be a JSON object")
  return data


def _validate_model_entry(model: object, index: int) -> None:
  if not isinstance(model, dict):
    raise ManifestValidationError(f"model manifest models[{index}] must be an object")
  if model.get("status") != "approved":
    raise ManifestValidationError(f"model manifest models[{index}] is not approved")
  if not isinstance(model.get("id"), str) or not isinstance(model.get("destination"), str):
    raise ManifestValidationError(f"model manifest models[{index}] must name an artifact")
  if not _is_sha256(model.get("sha256")):
    raise ManifestValidationError(
      f"model manifest models[{index}].sha256 must be a 64-character SHA-256"
    )


def _validate_model_artifact(weights_root: Path, model: dict[str, Any], index: int) -> None:
  destination = Path(model["destination"])
  artifact = (weights_root / destination).resolve()
  if weights_root not in artifact.parents or not artifact.is_file():
    raise ManifestValidationError(f"model manifest models[{index}] artifact is unavailable")
  if _file_sha256(artifact) != model["sha256"].lower():
    raise ManifestValidationError(f"model manifest models[{index}] checksum does not match")


def _file_sha256(path: Path) -> str:
  digest = hashlib.sha256()
  with path.open("rb") as artifact:
    for block in iter(lambda: artifact.read(1024 * 1024), b""):
      digest.update(block)
  return digest.hexdigest()


def _is_sha256(value: object) -> bool:
  return isinstance(value, str) and bool(SHA256.fullmatch(value))


if __name__ == "__main__":
  raise SystemExit(main())
