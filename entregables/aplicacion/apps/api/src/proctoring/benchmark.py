"""Mixed-workload worker capacity reporting."""

import argparse
from dataclasses import dataclass
import json
import math
from typing import Sequence


@dataclass(frozen=True)
class BenchmarkSample:
  latency_ms: float
  peak_ram_mb: float


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


def main(arguments: list[str] | None = None) -> int:
  parser = argparse.ArgumentParser(description="Report a mixed proctoring worker benchmark")
  parser.add_argument("--samples", type=int, default=15)
  parser.add_argument("--fake", action="store_true", help="Use deterministic no-weight sample data")
  options = parser.parse_args(arguments)
  if not options.fake:
    print("Verified local-weight benchmark runner is not configured", flush=True)
    return 1
  samples = [BenchmarkSample(100 + index % 4 * 25, 256) for index in range(options.samples)]
  print(json.dumps(build_benchmark_report(samples, elapsed_seconds=max(1, options.samples), real_weights=False), sort_keys=True))
  return 0
