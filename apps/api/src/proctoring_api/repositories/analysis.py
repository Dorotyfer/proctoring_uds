"""MariaDB persistence for staged analysis work; no image bytes enter SQL."""

import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine

from proctoring_api.services.analysis import AnalysisCapacityError, ChallengeExpiredError


LEASE_SECONDS = 120
MAX_ATTEMPTS = 3
MONITORING_EXPIRY = timedelta(minutes=2)


class SqlAnalysisRepository:
  def __init__(self, engine: AsyncEngine) -> None:
    self._engine = engine

  async def ping(self) -> None:
    async with self._engine.connect() as connection:
      await connection.execute(text("SELECT 1 FROM proctoring_analysis_jobs LIMIT 1"))

  async def create_challenge(self, session_id: str, challenge_id: str, steps: list[str], expires_at: datetime) -> dict[str, Any]:
    async with self._engine.begin() as connection:
      await connection.execute(text("""
        INSERT INTO proctoring_liveness_challenges (id, session_id, steps, expires_at)
        VALUES (:id, :session_id, :steps, :expires_at)
      """), {"id": challenge_id, "session_id": session_id, "steps": json.dumps(steps), "expires_at": expires_at})
    return {"id": challenge_id, "sessionId": session_id, "steps": steps, "expiresAt": expires_at}

  async def get_job(self, session_id: str, analysis_id: str) -> dict[str, Any] | None:
    async with self._engine.connect() as connection:
      result = await connection.execute(text(_job_select("session_id = :session_id AND analysis_id = :analysis_id")), {
        "session_id": session_id, "analysis_id": analysis_id
      })
      row = result.mappings().first()
      return _job(row) if row else None

  async def enqueue(self, input_data: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    async with self._engine.begin() as connection:
      await self._lock_session(connection, input_data["sessionId"])
      await self._expire_stale_monitoring(connection, input_data["sessionId"], input_data["now"])
      existing = await self._find_for_update(connection, input_data["sessionId"], input_data["analysisId"])
      if existing:
        return _job(existing), False
      await self._check_capacity(connection, input_data["sessionId"], input_data["type"], input_data["now"])
      return await self._insert_job(connection, input_data)

  async def consume_challenge_and_enqueue(self, input_data: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    async with self._engine.begin() as connection:
      await self._lock_session(connection, input_data["sessionId"])
      await self._expire_stale_monitoring(connection, input_data["sessionId"], input_data["now"])
      existing = await self._find_for_update(connection, input_data["sessionId"], input_data["analysisId"])
      if existing:
        return _job(existing), False
      challenge = await connection.execute(text("""
        SELECT id, session_id, expires_at, used_at FROM proctoring_liveness_challenges
        WHERE id = :id AND session_id = :session_id FOR UPDATE
      """), {"id": input_data["challengeId"], "session_id": input_data["sessionId"]})
      row = challenge.mappings().first()
      if not row or row["used_at"] is not None or row["expires_at"].replace(tzinfo=UTC) <= input_data["now"]:
        raise ChallengeExpiredError("Challenge is used or expired")
      await self._check_capacity(connection, input_data["sessionId"], "preparation", input_data["now"])
      job, created = await self._insert_job(connection, input_data)
      if not created:
        return job, False
      await connection.execute(text("""
        UPDATE proctoring_liveness_challenges SET used_at = :now
        WHERE id = :id AND used_at IS NULL
      """), {"id": input_data["challengeId"], "now": input_data["now"]})
      return job, True

  async def claim(self, owner_token: str, now: datetime | None = None) -> dict[str, Any] | None:
    now = now or datetime.now(UTC)
    async with self._engine.begin() as connection:
      await self._recover_expired(connection, now)
      await connection.execute(text("""
        UPDATE proctoring_analysis_jobs SET state = 'expired', completed_at = :now
        WHERE type = 'monitoring' AND state = 'queued' AND created_at <= :stale_before
      """), {"now": now, "stale_before": now - MONITORING_EXPIRY})
      result = await connection.execute(text("""
        SELECT * FROM proctoring_analysis_jobs
        WHERE state = 'queued' AND available_at <= :now AND attempt_count < :max_attempts
        ORDER BY available_at, created_at LIMIT 1 FOR UPDATE SKIP LOCKED
      """), {"now": now, "max_attempts": MAX_ATTEMPTS})
      row = result.mappings().first()
      if not row:
        return None
      await connection.execute(text("""
        UPDATE proctoring_analysis_jobs
        SET state = 'processing', attempt_count = attempt_count + 1, lease_owner_token = :owner_token,
          lease_expires_at = :lease_expires_at, started_at = COALESCE(started_at, :now)
        WHERE id = :id AND state = 'queued'
      """), {"id": row["id"], "owner_token": owner_token, "lease_expires_at": now + timedelta(seconds=LEASE_SECONDS), "now": now})
      claimed = dict(row)
      claimed.update({"state": "processing", "attempt_count": int(row["attempt_count"]) + 1,
        "lease_owner_token": owner_token, "lease_expires_at": now + timedelta(seconds=LEASE_SECONDS)})
      return _job(claimed)

  async def renew_lease(self, job_id: str, owner_token: str, now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    async with self._engine.begin() as connection:
      result = await connection.execute(text("""
        UPDATE proctoring_analysis_jobs SET lease_expires_at = :lease_expires_at
        WHERE id = :id AND state = 'processing' AND lease_owner_token = :owner_token AND lease_expires_at > :now
          AND lease_expires_at > :now
      """), {"id": job_id, "owner_token": owner_token, "now": now, "lease_expires_at": now + timedelta(seconds=LEASE_SECONDS)})
      return result.rowcount == 1

  async def complete(self, job_id: str, owner_token: str, result_data: dict[str, Any], now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    result_data = _safe_result(result_data)
    async with self._engine.begin() as connection:
      result = await connection.execute(text("""
        UPDATE proctoring_analysis_jobs
        SET state = 'completed', result = :result, completed_at = :now,
          lease_owner_token = NULL, lease_expires_at = NULL
        WHERE id = :id AND state = 'processing' AND lease_owner_token = :owner_token
      """), {"id": job_id, "owner_token": owner_token, "result": json.dumps(result_data), "now": now})
      return result.rowcount == 1

  async def fail(self, job_id: str, owner_token: str, error_code: str, now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    if not error_code.isascii() or not error_code.replace("_", "").isalnum() or len(error_code) > 64:
      raise ValueError("Invalid analysis failure")
    async with self._engine.begin() as connection:
      job = await connection.execute(text("""
        SELECT id, attempt_count FROM proctoring_analysis_jobs
        WHERE id = :id AND state = 'processing' AND lease_owner_token = :owner_token AND lease_expires_at > :now FOR UPDATE
      """), {"id": job_id, "owner_token": owner_token, "now": now})
      row = job.mappings().first()
      if not row:
        return False
      attempts = int(row["attempt_count"])
      state = "failed" if attempts >= MAX_ATTEMPTS else "queued"
      available_at = now + timedelta(seconds=min(60, 5 * (2 ** max(0, attempts - 1))))
      await connection.execute(text("""
        UPDATE proctoring_analysis_jobs
        SET state = :state, available_at = :available_at, last_error_code = :error_code,
          completed_at = IF(:state = 'failed', :now, completed_at), lease_owner_token = NULL, lease_expires_at = NULL
        WHERE id = :id AND state = 'processing' AND lease_owner_token = :owner_token AND lease_expires_at > :now
      """), {"state": state, "available_at": available_at, "error_code": error_code, "now": now,
        "id": job_id, "owner_token": owner_token})
      return True

  async def monitoring_status(self, session_id: str, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    async with self._engine.connect() as connection:
      result = await connection.execute(text("""
        SELECT MAX(completed_at) AS last_processed_at,
          SUM(state IN ('queued', 'processing') AND created_at > :stale_before) AS active_count
        FROM proctoring_analysis_jobs WHERE session_id = :session_id AND type = 'monitoring'
      """), {"session_id": session_id, "stale_before": now - MONITORING_EXPIRY})
      row = result.mappings().first()
      return {"lastProcessedAt": row["last_processed_at"] if row and row["last_processed_at"] else None,
        "availability": "available" if not row or int(row["active_count"] or 0) < 2 else "saturated",
        "nextIntervalSeconds": 10}

  async def _find_for_update(self, connection: Any, session_id: str, analysis_id: str) -> Any:
    result = await connection.execute(text("""
      SELECT * FROM proctoring_analysis_jobs
      WHERE session_id = :session_id AND analysis_id = :analysis_id FOR UPDATE
    """), {"session_id": session_id, "analysis_id": analysis_id})
    return result.mappings().first()

  async def _check_capacity(self, connection: Any, session_id: str, job_type: str, now: datetime) -> None:
    result = await connection.execute(text("""
      SELECT id FROM proctoring_analysis_jobs
      WHERE session_id = :session_id AND type = :type AND state IN ('queued', 'processing')
        AND (type <> 'monitoring' OR created_at > :stale_before) FOR UPDATE
    """), {"session_id": session_id, "type": job_type, "stale_before": now - MONITORING_EXPIRY})
    if len(result.mappings().all()) >= (1 if job_type == "preparation" else 2):
      raise AnalysisCapacityError(10)

  async def _insert_job(self, connection: Any, input_data: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    job_id = str(uuid4())
    try:
      await connection.execute(text("""
        INSERT INTO proctoring_analysis_jobs (id, analysis_id, session_id, type, available_at)
        VALUES (:id, :analysis_id, :session_id, :type, :available_at)
      """), {"id": job_id, "analysis_id": input_data["analysisId"], "session_id": input_data["sessionId"],
        "type": input_data["type"], "available_at": input_data["now"]})
    except IntegrityError:
      duplicate = await self._find_for_update(connection, input_data["sessionId"], input_data["analysisId"])
      if duplicate:
        return _job(duplicate), False
      raise
    for order, frame in enumerate(input_data["frames"]):
      await connection.execute(text("""
        INSERT INTO proctoring_analysis_frames (
          id, job_id, frame_order, object_key, encryption_iv, encryption_tag, sha256, byte_size, width, height
        ) VALUES (:id, :job_id, :frame_order, :object_key, :encryption_iv, :encryption_tag, :sha256, :byte_size, :width, :height)
      """), {"id": str(uuid4()), "job_id": job_id, "frame_order": order, "object_key": frame["objectKey"],
        "encryption_iv": frame["encryptionIv"], "encryption_tag": frame["encryptionTag"], "sha256": frame["sha256"],
        "byte_size": frame["byteSize"], "width": frame["width"], "height": frame["height"]})
    return ({"id": job_id, "analysisId": input_data["analysisId"], "sessionId": input_data["sessionId"],
      "type": input_data["type"], "state": "queued", "attempts": 0}, True)

  async def _recover_expired(self, connection: Any, now: datetime) -> None:
    await connection.execute(text("""
      UPDATE proctoring_analysis_jobs
      SET state = CASE WHEN attempt_count >= :max_attempts THEN 'failed' ELSE 'queued' END,
        available_at = :now, lease_owner_token = NULL, lease_expires_at = NULL,
        last_error_code = 'lease_expired', completed_at = CASE WHEN attempt_count >= :max_attempts THEN :now ELSE completed_at END
      WHERE state = 'processing' AND lease_expires_at <= :now
    """), {"now": now, "max_attempts": MAX_ATTEMPTS})

  async def _lock_session(self, connection: Any, session_id: str) -> None:
    await connection.execute(text("SELECT id FROM proctoring_sessions WHERE id = :session_id FOR UPDATE"), {"session_id": session_id})

  async def _expire_stale_monitoring(self, connection: Any, session_id: str, now: datetime) -> None:
    await connection.execute(text("""
      UPDATE proctoring_analysis_jobs SET state = 'expired', completed_at = :now
      WHERE session_id = :session_id AND type = 'monitoring' AND state = 'queued' AND created_at <= :stale_before
    """), {"session_id": session_id, "now": now, "stale_before": now - MONITORING_EXPIRY})


def _job(row: Any) -> dict[str, Any]:
  result = row.get("result") if hasattr(row, "get") else None
  if isinstance(result, str):
    result = json.loads(result)
  if result is not None:
    result = _safe_result(result)
  return {"id": str(row["id"]), "analysisId": str(row["analysis_id"]), "sessionId": str(row["session_id"]),
    "type": row["type"], "state": row["state"], "attempts": int(row.get("attempt_count", 0)),
    "result": result, "createdAt": row.get("created_at"), "completedAt": row.get("completed_at")}


def _job_select(condition: str) -> str:
  return f"SELECT * FROM proctoring_analysis_jobs WHERE {condition}"


def _safe_result(value: dict[str, Any]) -> dict[str, Any]:
  if not isinstance(value, dict):
    raise ValueError("Invalid analysis result")
  keys = set(value)
  preparation = {"liveness", "identity", "profileVersion"}
  monitoring = {"face", "alert"}
  if keys == preparation and isinstance(value["liveness"], str) and isinstance(value["identity"], str) and isinstance(value["profileVersion"], int):
    return {"liveness": value["liveness"], "identity": value["identity"], "profileVersion": value["profileVersion"]}
  if keys == monitoring and value["face"] in {"present", "absent", "multiple"} and isinstance(value["alert"], bool):
    return {"face": value["face"], "alert": value["alert"]}
  raise ValueError("Invalid analysis result")
