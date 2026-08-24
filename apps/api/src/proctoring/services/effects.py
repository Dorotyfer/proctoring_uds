"""Preparation state transitions isolated from Moodle attempts and grades."""

from typing import Any, Protocol


class PreparationEffectsRepository(Protocol):
  async def activate(self, session_id: str, job_id: str, identity: bytes, profile: Any) -> None: ...
  async def biometric_mismatch(self, session_id: str, job_id: str) -> None: ...
  async def analysis_unavailable(self, session_id: str, job_id: str, activate: bool) -> None: ...


class PreparationEffects:
  def __init__(self, repository: PreparationEffectsRepository) -> None:
    self._repository = repository

  async def apply(
    self,
    *,
    session_id: str,
    job_id: str,
    identity_frame: bytes,
    liveness_passed: bool,
    profile: Any,
    failure_policy: str,
  ) -> dict[str, object]:
    if not liveness_passed:
      return {"liveness": "failed", "identity": "unavailable", "profileVersion": None}
    if profile.status == "mismatch":
      await self._repository.biometric_mismatch(session_id, job_id)
      return {"liveness": "passed", "identity": "mismatch", "profileVersion": profile.enrollment_version}
    if profile.status not in {"enrolled", "matched"}:
      raise ValueError("Invalid biometric preparation result")
    await self._repository.activate(session_id, job_id, identity_frame, profile)
    return {
      "liveness": "passed", "identity": profile.status,
      "profileVersion": profile.enrollment_version,
    }

  async def unavailable(self, session_id: str, job_id: str, failure_policy: str) -> dict[str, object]:
    if failure_policy not in {"block", "allow_with_alert"}:
      raise ValueError("Invalid failure policy")
    await self._repository.analysis_unavailable(session_id, job_id, failure_policy == "allow_with_alert")
    return {
      "liveness": "unavailable", "identity": "unavailable", "profileVersion": None,
      "technicalAlert": True, "reasonCode": "model",
    }
