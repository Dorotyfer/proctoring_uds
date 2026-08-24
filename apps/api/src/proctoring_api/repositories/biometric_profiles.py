"""Biometric reset persistence that never reads encrypted descriptors."""

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


class SqlBiometricProfileRepository:
  def __init__(self, engine: AsyncEngine) -> None:
    self._engine = engine

  async def reset(self, moodle_user_id: str, actor_moodle_user_id: str) -> dict[str, str] | None:
    async with self._engine.begin() as connection:
      profile = await connection.execute(text("""
        SELECT id FROM proctoring_biometric_profiles
        WHERE moodle_user_id = :moodle_user_id AND status = 'active' FOR UPDATE
      """), {"moodle_user_id": moodle_user_id})
      row: Any = profile.mappings().first()
      if not row:
        return None
      await connection.execute(text("""
        UPDATE proctoring_biometric_profiles
        SET status = 'revoked', revoked_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
        WHERE moodle_user_id = :moodle_user_id AND status = 'active'
      """), {"moodle_user_id": moodle_user_id})
      await connection.execute(text("""
        INSERT INTO proctoring_biometric_audit (profile_id, moodle_user_id, action, metadata)
        VALUES (:profile_id, :moodle_user_id, 'reset', JSON_OBJECT('actorMoodleUserId', :actor_moodle_user_id))
      """), {"profile_id": row["id"], "moodle_user_id": moodle_user_id, "actor_moodle_user_id": actor_moodle_user_id})
      return {"moodleUserId": moodle_user_id, "state": "revoked"}
