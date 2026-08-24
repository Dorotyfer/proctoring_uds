"""Deterministic synthetic fixtures and bounded API load command."""

import argparse
import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
import json
import math
import os
import time
from typing import Any, Awaitable, Callable, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID


@dataclass(frozen=True)
class LoadResponse:
  status_code: int
  byte_count: int


class RejectRedirects(HTTPRedirectHandler):
  def redirect_request(self, request, file_pointer, code, message, headers, new_url):
    return None


_URL_OPENER = build_opener(RejectRedirects)


def create_pilot_fixtures(
  count: int, *, issued_at: datetime, seed: str = "acceptance"
) -> list[dict[str, Any]]:
  if isinstance(count, bool) or not 1 <= count <= 1000:
    raise ValueError("Pilot fixture count must be between 1 and 1000")
  if issued_at.tzinfo is None:
    raise ValueError("Pilot fixture issued_at must include a timezone")
  normalized_seed = _normalize_seed(seed)
  issued = issued_at.astimezone(UTC)
  expires = issued + timedelta(hours=1)
  fixtures = []
  for index in range(1, count + 1):
    suffix = f"{index:04d}"
    course = "a" if index % 2 else "b"
    fixtures.append({
      "moodleUserId": f"pilot-student-{suffix}",
      "moodleCourseId": f"pilot-course-{course}",
      "moodleQuizId": f"pilot-quiz-{course}",
      "moodleAttemptId": f"pilot-{normalized_seed}-attempt-{suffix}",
      "courseName": f"Curso piloto {course.upper()}",
      "quizName": f"Evaluación piloto {course.upper()}",
      "studentName": f"Estudiante piloto {suffix}",
      "studentDocument": f"PILOT-{suffix}",
      "deviceMode": "browser" if course == "a" else "seb",
      "issuedAt": _wire_datetime(issued),
      "expiresAt": _wire_datetime(expires),
      "failurePolicy": "block",
    })
  return fixtures


async def run_load_scenario(
  items: Sequence[dict[str, Any]],
  operation: Callable[[dict[str, Any]], Awaitable[LoadResponse]],
  *,
  concurrency: int,
  max_retries: int,
) -> dict[str, Any]:
  if not items or not 1 <= concurrency <= 200 or not 0 <= max_retries <= 5:
    raise ValueError("Invalid load scenario settings")
  queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
  for item in items:
    queue.put_nowait(item)
  latencies: list[float] = []
  result: dict[str, Any] = {
    "completed": 0, "failed": 0, "retries": 0, "responseBytes": 0,
    "statusCodes": {}, "errors": {},
  }

  async def worker() -> None:
    while not queue.empty():
      try:
        item = queue.get_nowait()
      except asyncio.QueueEmpty:
        return
      started = time.perf_counter()
      for attempt in range(max_retries + 1):
        try:
          response = await operation(item)
          result["completed"] += 1
          result["responseBytes"] += response.byte_count
          status = str(response.status_code)
          result["statusCodes"][status] = result["statusCodes"].get(status, 0) + 1
          break
        except Exception as error:
          if attempt < max_retries:
            result["retries"] += 1
            continue
          code = _safe_load_error(error)
          result["failed"] += 1
          result["errors"][code] = result["errors"].get(code, 0) + 1
      latencies.append((time.perf_counter() - started) * 1000)
      queue.task_done()

  await asyncio.gather(*(worker() for _ in range(min(concurrency, len(items)))))
  result["latencyMs"] = {
    "p50": _percentile(latencies, 50), "p95": _percentile(latencies, 95),
    "p99": _percentile(latencies, 99),
  }
  return result


def create_api_operation(api_url: str, integration_key: str) -> Callable[[dict[str, Any]], Awaitable[LoadResponse]]:
  base_url = _validate_api_url(api_url)
  if len(integration_key) < 32:
    raise ValueError("PILOT integration key must contain at least 32 characters")

  async def operation(fixture: dict[str, Any]) -> LoadResponse:
    created, created_bytes, created_status = await asyncio.to_thread(
      _json_request, f"{base_url}/v1/internal/sessions", fixture,
      {"X-Moodle-Integration-Key": integration_key}
    )
    session_id = str(created["session"]["id"])
    token, token_bytes, _ = await asyncio.to_thread(
      _json_request, f"{base_url}/v1/internal/sessions/{session_id}/browser-token", {},
      {"X-Moodle-Integration-Key": integration_key}
    )
    event = {
      "clientEventId": str(_deterministic_uuid(fixture["moodleAttemptId"])),
      "type": "camera_interrupted", "occurredAt": fixture["issuedAt"],
      "metadata": {"source": "pilot-load"},
    }
    _, event_bytes, event_status = await asyncio.to_thread(
      _json_request, f"{base_url}/v1/sessions/{session_id}/events", event,
      {"Authorization": f"Bearer {token['browserToken']}"}
    )
    return LoadResponse(event_status or created_status, created_bytes + token_bytes + event_bytes)

  return operation


def fixtures_main(arguments: list[str] | None = None) -> None:
  parser = argparse.ArgumentParser(description="Print deterministic synthetic pilot sessions")
  parser.add_argument("--sessions", type=int, default=int(os.environ.get("PILOT_SESSIONS", "20")))
  parser.add_argument("--seed", default=os.environ.get("PILOT_SEED", "acceptance"))
  parser.add_argument("--issued-at", default=os.environ.get("PILOT_ISSUED_AT"))
  options = parser.parse_args(arguments)
  try:
    issued_at = datetime.fromisoformat(options.issued_at.replace("Z", "+00:00")) if options.issued_at else datetime.now(UTC)
    fixtures = create_pilot_fixtures(options.sessions, issued_at=issued_at, seed=options.seed)
  except Exception:
    print("Pilot fixtures unavailable")
    raise SystemExit(1)
  print(json.dumps(fixtures, ensure_ascii=False, indent=2))


def load_main(arguments: list[str] | None = None) -> None:
  parser = argparse.ArgumentParser(description="Run a bounded synthetic API load scenario")
  parser.add_argument("--sessions", type=int, default=int(os.environ.get("PILOT_SESSIONS", "20")))
  parser.add_argument("--concurrency", type=int, default=int(os.environ.get("PILOT_CONCURRENCY", "10")))
  parser.add_argument("--max-retries", type=int, default=int(os.environ.get("PILOT_MAX_RETRIES", "2")))
  parser.add_argument("--seed", default=os.environ.get("PILOT_SEED", "acceptance"))
  options = parser.parse_args(arguments)
  api_url = os.environ.get("PILOT_API_URL", "")
  integration_key = os.environ.get("MOODLE_INTEGRATION_KEY", "")
  issued_at = datetime.now(UTC) - timedelta(minutes=1)
  started = time.perf_counter()
  try:
    fixtures = create_pilot_fixtures(options.sessions, issued_at=issued_at, seed=options.seed)
    report = asyncio.run(run_load_scenario(
      fixtures, create_api_operation(api_url, integration_key),
      concurrency=options.concurrency, max_retries=options.max_retries,
    ))
  except Exception:
    print("Pilot load unavailable")
    raise SystemExit(1)
  elapsed = time.perf_counter() - started
  report.update({
    "requestedSessions": options.sessions, "concurrency": options.concurrency,
    "elapsedMs": round(elapsed * 1000, 2),
    "sessionsPerSecond": round(report["completed"] / elapsed, 2) if elapsed else 0,
    "responseMegabytes": round(report["responseBytes"] / 1024 / 1024, 2),
  })
  print(json.dumps(report, sort_keys=True, indent=2))
  if report["failed"]:
    raise SystemExit(1)


def _json_request(url: str, payload: dict[str, Any], headers: dict[str, str]) -> tuple[dict[str, Any], int, int]:
  body = json.dumps(payload, separators=(",", ":")).encode()
  request = Request(url, data=body, method="POST", headers={"Content-Type": "application/json", **headers})
  try:
    with _URL_OPENER.open(request, timeout=15) as response:
      response_body = response.read(1024 * 1024)
      if response.read(1):
        raise RuntimeError("api_response_too_large")
      parsed = json.loads(response_body)
      if not isinstance(parsed, dict):
        raise RuntimeError("api_invalid_json")
      return parsed, len(body) + len(response_body), int(response.status)
  except HTTPError as error:
    raise RuntimeError(f"api_{error.code}") from error
  except (URLError, TimeoutError) as error:
    raise RuntimeError("api_network") from error


def _safe_load_error(error: Exception) -> str:
  message = str(error)
  if message.startswith("api_") and message.replace("_", "").isalnum() and len(message) <= 32:
    return message
  return "api_unavailable"


def _validate_api_url(value: str) -> str:
  parsed = urlsplit(value)
  if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
    raise ValueError("PILOT_API_URL must be an absolute HTTP(S) URL without credentials")
  return value.rstrip("/")


def _normalize_seed(value: str) -> str:
  normalized = "".join(character if character.isascii() and character.isalnum() else "-" for character in str(value).lower())
  return "-".join(part for part in normalized.split("-") if part) or "default"


def _wire_datetime(value: datetime) -> str:
  return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _deterministic_uuid(value: str) -> UUID:
  raw = bytearray(sha256(str(value).encode()).digest()[:16])
  raw[6] = (raw[6] & 0x0F) | 0x40
  raw[8] = (raw[8] & 0x3F) | 0x80
  return UUID(bytes=bytes(raw))


def _percentile(values: Sequence[float], percentage: int) -> float:
  if not values:
    return 0
  sorted_values = sorted(values)
  index = max(0, math.ceil((percentage / 100) * len(sorted_values)) - 1)
  return round(sorted_values[index], 2)
