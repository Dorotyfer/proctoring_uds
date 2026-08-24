import json
from pathlib import Path

import pytest

from proctoring_api.manifest import ManifestValidationError, main, validate_inventory


def artifact(name: str, sha256: str | None) -> dict[str, str | None]:
  return {
    "name": name,
    "version": "1.2.3",
    "source": "https://artifacts.example.edu/release.tar.gz",
    "license": "MIT",
    "status": "approved",
    "sha256": sha256
  }


def write_inventory(path: Path, sha256: str | None, release_ready: bool = False) -> None:
  path.write_text(json.dumps({
    "version": 1,
    "releaseReady": release_ready,
    "packages": [artifact("fastapi", sha256)],
    "models": [artifact("YuNet", sha256)]
  }), encoding="utf-8")


def test_release_inventory_rejects_unacquired_or_invalid_hashes(tmp_path: Path) -> None:
  inventory_path = tmp_path / "inventory.json"
  write_inventory(inventory_path, None)

  with pytest.raises(ManifestValidationError, match="sha256"):
    validate_inventory(inventory_path, release_mode=True)

  write_inventory(inventory_path, "not-a-sha256")
  with pytest.raises(ManifestValidationError, match="sha256"):
    validate_inventory(inventory_path, release_mode=True)


def test_release_inventory_check_command_is_deterministic(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
  inventory_path = tmp_path / "inventory.json"
  write_inventory(inventory_path, None)

  exit_code = main(["--inventory", str(inventory_path), "--release"])

  assert exit_code == 1
  assert "sha256" in capsys.readouterr().err


def test_release_inventory_accepts_complete_approved_artifacts(tmp_path: Path) -> None:
  inventory_path = tmp_path / "inventory.json"
  write_inventory(inventory_path, "a" * 64, release_ready=True)

  inventory = validate_inventory(inventory_path, release_mode=True)

  assert inventory["releaseReady"] is True


@pytest.mark.parametrize("field, value, message", [
  ("name", "", "name"),
  ("version", ">=1.2", "version"),
  ("source", "not-a-url", "source"),
  ("license", "", "license"),
  ("status", "unacquired-release-blocking", "approved"),
  ("sha256", "not-a-sha256", "sha256")
])
def test_release_inventory_rejects_missing_or_invalid_artifact_identity(
  tmp_path: Path,
  field: str,
  value: str,
  message: str
) -> None:
  inventory_path = tmp_path / "inventory.json"
  entry = artifact("fastapi", "a" * 64)
  entry[field] = value
  inventory_path.write_text(json.dumps({
    "version": 1,
    "releaseReady": True,
    "packages": [entry],
    "models": [artifact("YuNet", "a" * 64)]
  }), encoding="utf-8")

  with pytest.raises(ManifestValidationError, match=message):
    validate_inventory(inventory_path)
