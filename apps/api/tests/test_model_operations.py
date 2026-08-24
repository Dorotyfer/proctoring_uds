import hashlib
import json
from pathlib import Path
import sys

from proctoring.benchmark import BenchmarkSample, build_benchmark_report
from proctoring.model_runtime import LocalModelBundle
from proctoring.models_cli import main


def manifest(path: Path, source: Path, destination: Path, digest: str) -> Path:
  value = {
    "version": 1, "offlineOnly": True, "releaseReady": True,
    "weightsDirectory": str(destination),
    "models": [{
      "id": "weight", "destination": "weight.bin", "source": "https://models.example/weight.bin",
      "sha256": digest, "status": "approved"
    }]
  }
  path.write_text(json.dumps(value), encoding="utf-8")
  return path


def test_model_install_from_local_copies_only_manifest_verified_files(tmp_path: Path) -> None:
  source = tmp_path / "source"
  destination = tmp_path / ".deepface" / "weights"
  source.mkdir()
  artifact = source / "weight.bin"
  artifact.write_bytes(b"approved-weight")
  digest = hashlib.sha256(b"approved-weight").hexdigest()
  manifest_path = manifest(tmp_path / "manifest.json", source, destination, digest)

  exit_code = main(["install-from-local", "--manifest", str(manifest_path), "--source", str(source)])

  assert exit_code == 0
  assert (destination / "weight.bin").read_bytes() == b"approved-weight"


def test_model_install_from_local_rejects_checksum_mismatch_without_copying(tmp_path: Path) -> None:
  source = tmp_path / "source"
  destination = tmp_path / ".deepface" / "weights"
  source.mkdir()
  (source / "weight.bin").write_bytes(b"tampered")
  manifest_path = manifest(tmp_path / "manifest.json", source, destination, "a" * 64)

  exit_code = main(["install-from-local", "--manifest", str(manifest_path), "--source", str(source)])

  assert exit_code == 1
  assert not (destination / "weight.bin").exists()


def test_local_model_bundle_imports_heavy_packages_only_during_explicit_preload(tmp_path: Path) -> None:
  destination = tmp_path / ".deepface" / "weights"
  destination.mkdir(parents=True)
  artifact = destination / "weight.bin"
  artifact.write_bytes(b"approved-weight")
  digest = hashlib.sha256(b"approved-weight").hexdigest()
  manifest_path = manifest(tmp_path / "manifest.json", tmp_path, destination, digest)
  imported = []
  bundle = LocalModelBundle(manifest_path, importer=lambda name: imported.append(name) or object())

  assert imported == []
  bundle.preload()

  assert imported == ["cv2", "numpy", "deepface", "torch", "torchvision"]


def test_benchmark_reports_capacity_formula_and_invalidates_fake_runs_for_sla() -> None:
  report = build_benchmark_report([
    BenchmarkSample(latency_ms=100, peak_ram_mb=500),
    BenchmarkSample(latency_ms=200, peak_ram_mb=700),
    BenchmarkSample(latency_ms=400, peak_ram_mb=600),
  ], elapsed_seconds=3, real_weights=False)

  assert report["mixedThroughputPerWorker"] == 1.0
  assert report["p50LatencyMs"] == 200
  assert report["p95LatencyMs"] == 400
  assert report["peakRamMb"] == 700
  assert report["ramReservePercent"] == 30
  assert report["workersFor15JobsPerSecond"] == 15
  assert report["slaValid"] is False
  assert report["slaValidity"] == "invalid_fake_or_missing_weights"
