import json
from pathlib import Path

import pytest

from proctoring_api.manifest import ManifestValidationError, main, validate_inventory


def write_inventory(path: Path, sha256: str | None) -> None:
  path.write_text(json.dumps({
    "version": 1,
    "releaseReady": False,
    "packages": [{"name": "fastapi", "sha256": sha256}],
    "models": [{"name": "YuNet", "sha256": sha256}]
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
