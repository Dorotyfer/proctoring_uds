import hashlib
from io import BytesIO
import json
from pathlib import Path
import sys

from PIL import Image
import pytest

from proctoring.benchmark import BenchmarkSample, build_benchmark_report, run_verified_benchmark
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
  bundle.preload()

  assert imported == ["cv2", "numpy", "deepface", "torch", "torchvision"]


def test_local_model_bundle_clears_partial_runtime_after_preload_failure(tmp_path: Path) -> None:
  destination = tmp_path / ".deepface" / "weights"
  destination.mkdir(parents=True)
  artifact = destination / "weight.bin"
  artifact.write_bytes(b"approved-weight")
  digest = hashlib.sha256(b"approved-weight").hexdigest()
  manifest_path = manifest(tmp_path / "manifest.json", tmp_path, destination, digest)

  def fail_on_numpy(name: str) -> object:
    if name == "numpy":
      raise RuntimeError("runtime unavailable")
    return object()

  bundle = LocalModelBundle(manifest_path, importer=fail_on_numpy)

  with pytest.raises(RuntimeError, match="runtime unavailable"):
    bundle.preload()

  assert bundle.modules == {}
  assert bundle.manifest is None
  assert bundle.deepface_adapter is None
  assert bundle.ssdlite_adapter is None


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


def test_verified_benchmark_preloads_models_and_runs_mixed_workload(tmp_path: Path) -> None:
  corpus = tmp_path / "corpus"
  corpus.mkdir()
  output = BytesIO()
  Image.new("RGB", (320, 240), "white").save(output, format="JPEG")
  (corpus / "authorized.jpg").write_bytes(output.getvalue())
  calls: list[tuple[str, bytes] | str] = []

  class FaceAdapter:
    def analyze(self, frame: bytes) -> object:
      calls.append(("face", frame))
      return object()

  class ObjectAdapter:
    def detect(self, frame: bytes) -> tuple[object, ...]:
      calls.append(("objects", frame))
      return ()

  class Bundle:
    deepface_adapter = FaceAdapter()
    ssdlite_adapter = ObjectAdapter()

    def preload(self) -> None:
      calls.append("preload")

  clock = iter([0.0, 0.0, 0.1, 0.1, 0.3, 0.3])
  report = run_verified_benchmark(
    tmp_path / "manifest.json",
    corpus,
    sample_count=2,
    bundle_factory=lambda _: Bundle(),
    clock=lambda: next(clock),
    peak_ram_mb=lambda: 640.0,
  )

  assert calls[0] == "preload"
  assert [call[0] for call in calls[1:] if isinstance(call, tuple)] == [
    "face", "objects", "face", "objects"
  ]
  assert report["mixedJobs"] == 2
  assert report["mixedThroughputPerWorker"] == 6.666667
  assert report["p95LatencyMs"] == pytest.approx(200)
  assert report["peakRamMb"] == 640.0
  assert report["workersFor15JobsPerSecond"] == 3
  assert report["slaValid"] is True
  assert report["slaValidity"] == "valid_local_verified_weights"


def test_verified_benchmark_rejects_an_empty_or_invalid_corpus(tmp_path: Path) -> None:
  corpus = tmp_path / "corpus"
  corpus.mkdir()
  (corpus / "invalid.jpg").write_bytes(b"not-a-jpeg")

  with pytest.raises(ValueError, match="^Benchmark corpus is invalid$"):
    run_verified_benchmark(tmp_path / "manifest.json", corpus, sample_count=1)
