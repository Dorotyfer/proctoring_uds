"""Mixed-workload worker capacity reporting."""

import argparse
from dataclasses import dataclass
import json
import math
import os
from pathlib import Path
import sys
import time
from typing import Callable, Protocol, Sequence

from proctoring.model_runtime import LocalModelBundle, REQUIRED_WORKER_MODEL_IDS
from proctoring.services.analysis import ImageValidationError, validate_jpeg
from proctoring.services.vision import FaceAnalysisError


@dataclass(frozen=True)
class BenchmarkSample:
  latency_ms: float
  peak_ram_mb: float


class BenchmarkBundle(Protocol):
  deepface_adapter: object | None
  ssdlite_adapter: object | None

  def preload(self) -> None: ...


def build_benchmark_report(
  samples: Sequence[BenchmarkSample], *, elapsed_seconds: float, real_weights: bool
) -> dict[str, int | float | bool | str]:
  if not samples or elapsed_seconds <= 0:
    raise ValueError("Benchmark requires samples and positive elapsed time")
  latencies = sorted(float(sample.latency_ms) for sample in samples)
  throughput = len(samples) / elapsed_seconds
  return {
    "mixedJobs": len(samples),
    "mixedThroughputPerWorker": round(throughput, 6),
    "p50LatencyMs": _nearest_rank(latencies, 0.50),
    "p95LatencyMs": _nearest_rank(latencies, 0.95),
    "peakRamMb": max(sample.peak_ram_mb for sample in samples),
    "ramReservePercent": 30,
    "workersFor15JobsPerSecond": math.ceil(15 / throughput),
    "slaValid": bool(real_weights),
    "slaValidity": "valid_local_verified_weights" if real_weights else "invalid_fake_or_missing_weights",
  }


def _nearest_rank(values: Sequence[float], percentile: float) -> float:
  return values[max(0, math.ceil(percentile * len(values)) - 1)]


def run_verified_benchmark(
  manifest_path: Path,
  corpus_directory: Path,
  *,
  sample_count: int,
  bundle_factory: Callable[[Path], BenchmarkBundle] | None = None,
  clock: Callable[[], float] = time.perf_counter,
  peak_ram_mb: Callable[[], float] | None = None,
) -> dict[str, int | float | bool | str]:
  """Measure a conservative mixed job with both face and object inference."""

  if sample_count <= 0:
    raise ValueError("Benchmark sample count is invalid")
  frames = _load_corpus(corpus_directory, sample_count)
  create_bundle = bundle_factory or _create_verified_bundle
  models = create_bundle(Path(manifest_path))
  models.preload()
  face = models.deepface_adapter
  objects = models.ssdlite_adapter
  if face is None or objects is None:
    raise ValueError("Required benchmark models are unavailable")
  read_peak_ram = peak_ram_mb or _peak_rss_mb
  samples: list[BenchmarkSample] = []
  benchmark_started = clock()
  for index in range(sample_count):
    frame = frames[index % len(frames)]
    sample_started = clock()
    try:
      face.analyze(frame)
    except FaceAnalysisError:
      pass
    objects.detect(frame)
    latency_ms = max(0.0, (clock() - sample_started) * 1000)
    measured_ram = read_peak_ram()
    if measured_ram <= 0:
      raise ValueError("Benchmark RAM measurement is unavailable")
    samples.append(BenchmarkSample(latency_ms, measured_ram))
  elapsed_seconds = clock() - benchmark_started
  return build_benchmark_report(samples, elapsed_seconds=elapsed_seconds, real_weights=True)


def _create_verified_bundle(manifest_path: Path) -> LocalModelBundle:
  return LocalModelBundle(manifest_path, required_model_ids=REQUIRED_WORKER_MODEL_IDS)


def _load_corpus(corpus_directory: Path, sample_count: int) -> tuple[bytes, ...]:
  directory = Path(corpus_directory)
  if not directory.is_dir():
    raise ValueError("Benchmark corpus is invalid")
  candidates = sorted(
    path for path in directory.iterdir()
    if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg"}
  )
  if not candidates:
    raise ValueError("Benchmark corpus is invalid")
  try:
    return tuple(
      validate_jpeg(path.read_bytes(), "image/jpeg").data
      for path in candidates[:sample_count]
    )
  except (ImageValidationError, OSError) as error:
    raise ValueError("Benchmark corpus is invalid") from error


def _peak_rss_mb() -> float:
  status_path = Path("/proc/self/status")
  if status_path.is_file():
    for line in status_path.read_text(encoding="utf-8").splitlines():
      if line.startswith("VmHWM:"):
        return float(line.split()[1]) / 1024
  try:
    import resource

    maximum_rss = float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    divisor = 1024 * 1024 if sys.platform == "darwin" else 1024
    return maximum_rss / divisor
  except (ImportError, OSError, ValueError):
    return 0.0


def main(arguments: list[str] | None = None) -> int:
  parser = argparse.ArgumentParser(description="Report a mixed proctoring worker benchmark")
  parser.add_argument("--samples", type=int, default=15)
  parser.add_argument("--fake", action="store_true", help="Use deterministic no-weight sample data")
  parser.add_argument("--manifest", type=Path)
  parser.add_argument("--corpus-dir", type=Path)
  options = parser.parse_args(arguments)
  if options.fake:
    if options.samples <= 0:
      print("Benchmark unavailable", file=sys.stderr, flush=True)
      return 1
    samples = [BenchmarkSample(100 + index % 4 * 25, 256) for index in range(options.samples)]
    report = build_benchmark_report(
      samples, elapsed_seconds=max(1, options.samples), real_weights=False
    )
    print(json.dumps(report, sort_keys=True))
    return 0
  manifest = options.manifest or (
    Path(os.environ["MODEL_MANIFEST_PATH"]) if os.environ.get("MODEL_MANIFEST_PATH") else None
  )
  if manifest is None or options.corpus_dir is None:
    print("Benchmark requires a verified manifest and authorized corpus", file=sys.stderr, flush=True)
    return 1
  try:
    report = run_verified_benchmark(
      manifest,
      options.corpus_dir,
      sample_count=options.samples,
    )
  except Exception:
    print("Benchmark unavailable", file=sys.stderr, flush=True)
    return 1
  print(json.dumps(report, sort_keys=True))
  return 0
