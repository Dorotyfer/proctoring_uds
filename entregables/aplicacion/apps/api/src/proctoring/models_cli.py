"""Offline-only verified model installation and verification commands."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys

from proctoring.manifest import ManifestValidationError, validate_model_manifest


def main(arguments: list[str] | None = None) -> int:
  parser = argparse.ArgumentParser(description="Manage approved local proctoring model weights")
  commands = parser.add_subparsers(dest="command", required=True)
  verify = commands.add_parser("verify")
  verify.add_argument("--manifest", type=Path, required=True)
  install = commands.add_parser("install-from-local")
  install.add_argument("--manifest", type=Path, required=True)
  install.add_argument("--source", type=Path, required=True)
  options = parser.parse_args(arguments)
  try:
    if options.command == "verify":
      validate_model_manifest(options.manifest, require_artifacts=True)
    else:
      _install(options.manifest, options.source)
  except (ManifestValidationError, OSError, ValueError) as error:
    print(f"model operation failed: {error}", file=sys.stderr)
    return 1
  return 0


def _install(manifest_path: Path, source_directory: Path) -> None:
  data = json.loads(manifest_path.read_text(encoding="utf-8"))
  # Structural approval is checked without requiring destination files yet.
  validate_model_manifest(manifest_path, require_artifacts=False)
  source_root = source_directory.resolve()
  destination_root = Path(data["weightsDirectory"]).resolve()
  approved: list[tuple[Path, Path]] = []
  for model in data["models"]:
    relative = Path(model["destination"])
    source = (source_root / relative).resolve()
    destination = (destination_root / relative).resolve()
    if source_root not in source.parents or destination_root not in destination.parents or not source.is_file():
      raise ValueError("approved model artifact is unavailable")
    if _sha256(source) != model["sha256"].lower():
      raise ValueError("approved model artifact checksum does not match")
    approved.append((source, destination))
  for source, destination in approved:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
  validate_model_manifest(manifest_path, require_artifacts=True)


def _sha256(path: Path) -> str:
  digest = hashlib.sha256()
  with path.open("rb") as stream:
    for block in iter(lambda: stream.read(1024 * 1024), b""):
      digest.update(block)
  return digest.hexdigest()


if __name__ == "__main__":
  raise SystemExit(main())
