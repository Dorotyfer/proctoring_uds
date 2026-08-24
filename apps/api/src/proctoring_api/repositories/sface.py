"""Transactional SFace history, checks, and audit persistence."""

import json
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from proctoring_api.services.vision import EncryptedDescriptor


class SqlSFaceProfileRepository:
  def __init__(self, engine: AsyncEngine) -> None:
    self._engine = engine

  async def find_active(self, moodle_user_id: str) -> dict[str, Any] | None:
    async with self._engine.connect() as connection:
      result = await connection.execute(text("""
        SELECT * FROM proctoring_sface_profiles
        WHERE moodle_user_id = :moodle_user_id AND status = 'active' AND algorithm = 'SFace'
      """), {"moodle_user_id": moodle_user_id})
      row = result.mappings().first()
      return _profile(row) if row else None

  async def replace_active(self, input_data: dict[str, Any]) -> dict[str, Any]:
    if input_data.get("algorithm") != "SFace" or not isinstance(input_data.get("encryptedDescriptor"), EncryptedDescriptor):
      raise ValueError("Invalid SFace enrollment")
    identifier = str(uuid4())
    encrypted: EncryptedDescriptor = input_data["encryptedDescriptor"]
    async with self._engine.begin() as connection:
      highest = await connection.execute(text("""
        SELECT COALESCE(MAX(enrollment_version), 0) AS highest_version
        FROM proctoring_sface_profiles WHERE moodle_user_id = :moodle_user_id FOR UPDATE
      """), {"moodle_user_id": input_data["moodleUserId"]})
      version = int(highest.mappings().first()["highest_version"]) + 1
      await connection.execute(text("""
        UPDATE proctoring_sface_profiles
        SET status = 'revoked', revoked_at = UTC_TIMESTAMP(3)
        WHERE moodle_user_id = :moodle_user_id AND status = 'active'
      """), {"moodle_user_id": input_data["moodleUserId"]})
      await connection.execute(text("""
        INSERT INTO proctoring_sface_profiles (
          id, moodle_user_id, algorithm, descriptor_ciphertext, descriptor_length,
          encryption_iv, encryption_tag, enrollment_version, status, consent_version,
          consented_at, enrolled_at
        ) VALUES (
          :id, :moodle_user_id, 'SFace', :ciphertext, :descriptor_length,
          :iv, :tag, :version, 'active', :consent_version, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
        )
      """), {
        "id": identifier, "moodle_user_id": input_data["moodleUserId"],
        "ciphertext": encrypted.ciphertext, "descriptor_length": encrypted.descriptor_length,
        "iv": encrypted.iv, "tag": encrypted.tag, "version": version,
        "consent_version": input_data["consentVersion"],
      })
      result = await connection.execute(text("SELECT * FROM proctoring_sface_profiles WHERE id = :id"), {"id": identifier})
      row = result.mappings().first()
      if not row:
        raise RuntimeError("SFace enrollment unavailable")
      return _profile(row)

  async def record_check(self, input_data: dict[str, Any]) -> dict[str, Any]:
    identifier = str(uuid4())
    async with self._engine.begin() as connection:
      await connection.execute(text("""
        INSERT INTO proctoring_sface_checks (
          id, session_id, profile_id, job_id, result, similarity, threshold, enrollment_version
        ) VALUES (
          :id, :session_id, :profile_id, :job_id, :result, :similarity, :threshold, :enrollment_version
        )
      """), {
        "id": identifier, "session_id": input_data["sessionId"], "profile_id": input_data["profileId"],
        "job_id": input_data["jobId"], "result": input_data["result"], "similarity": input_data["similarity"],
        "threshold": input_data["threshold"], "enrollment_version": input_data["enrollmentVersion"],
      })
    return {"id": identifier, **input_data}

  async def record_audit(self, input_data: dict[str, Any]) -> None:
    metadata = {
      "jobId": input_data["jobId"], "model": input_data["modelName"],
      "detector": input_data["detectorName"], "metric": input_data["metricName"],
      "threshold": input_data["threshold"], "latencyMs": input_data["latencyMs"],
      "result": input_data["result"],
    }
    async with self._engine.begin() as connection:
      await connection.execute(text("""
        INSERT INTO proctoring_sface_audit (
          profile_id, session_id, job_id, moodle_user_id, action, metadata
        ) VALUES (:profile_id, :session_id, :job_id, :moodle_user_id, :action, :metadata)
      """), {
        "profile_id": input_data["profileId"], "session_id": input_data["sessionId"],
        "job_id": input_data["jobId"],
        "moodle_user_id": input_data["moodleUserId"], "action": input_data["action"],
        "metadata": json.dumps(metadata),
      })
      await connection.execute(text("""
        INSERT INTO proctoring_model_audit (
          job_id, model_name, model_version, action, detector_name, detector_version,
          metric_name, threshold, latency_ms, outcome
        ) VALUES (
          :job_id, 'SFace', '2021dec', :action, 'yunet', '2023mar',
          'cosine', :threshold, :latency_ms, :outcome
        )
      """), {
        "job_id": input_data["jobId"],
        "action": "profile_enrolled" if input_data["action"] == "enroll" else "profile_checked",
        "threshold": input_data["threshold"], "latency_ms": input_data["latencyMs"],
        "outcome": input_data["result"],
      })


def _profile(row: Any) -> dict[str, Any]:
  encrypted = EncryptedDescriptor(
    ciphertext=bytes(row["descriptor_ciphertext"]), iv=bytes(row["encryption_iv"]),
    tag=bytes(row["encryption_tag"]), descriptor_length=int(row["descriptor_length"]),
    algorithm=row["algorithm"],
  )
  return {
    "id": str(row["id"]), "moodleUserId": row["moodle_user_id"], "algorithm": row["algorithm"],
    "encryptedDescriptor": encrypted, "descriptorLength": int(row["descriptor_length"]),
    "enrollmentVersion": int(row["enrollment_version"]), "status": row["status"],
    "consentVersion": row["consent_version"],
  }
