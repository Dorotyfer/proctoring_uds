"""SFace enrollment and verification orchestration."""

from dataclasses import dataclass
import time
from typing import Any, Protocol, Sequence

from proctoring.services.vision import (
  DescriptorCipher,
  EncryptedDescriptor,
  SFaceVerifier,
  choose_descriptor_medoid,
)


class ProfileRepository(Protocol):
  async def find_active(self, moodle_user_id: str) -> dict[str, Any] | None: ...
  async def replace_active(self, input_data: dict[str, Any]) -> dict[str, Any]: ...
  async def record_check(self, input_data: dict[str, Any]) -> dict[str, Any]: ...
  async def record_audit(self, input_data: dict[str, Any]) -> None: ...


@dataclass(frozen=True)
class ProfileCheckResult:
  status: str
  profile_id: str
  check_id: str
  enrollment_version: int
  similarity: float | None
  threshold: float


class SFaceProfileService:
  def __init__(self, repository: ProfileRepository, cipher: DescriptorCipher, verifier: SFaceVerifier) -> None:
    self._repository = repository
    self._cipher = cipher
    self._verifier = verifier

  async def enroll_or_verify(
    self,
    *,
    session_id: str,
    job_id: str,
    moodle_user_id: str,
    descriptors: Sequence[Sequence[float]],
    consent_version: str,
    previous_enrollment_version: int = 0,
  ) -> ProfileCheckResult:
    started_ms = int(time.perf_counter() * 1000)
    candidate = choose_descriptor_medoid(descriptors)
    profile = await self._repository.find_active(moodle_user_id)
    if profile is None:
      version = previous_enrollment_version + 1
      encrypted = self._cipher.encrypt(candidate)
      profile = await self._repository.replace_active({
        "moodleUserId": moodle_user_id,
        "algorithm": "SFace",
        "encryptedDescriptor": encrypted,
        "descriptorLength": encrypted.descriptor_length,
        "enrollmentVersion": version,
        "consentVersion": consent_version,
      })
      result_name = "enrolled"
      similarity = None
      action = "enroll"
      latency_ms = max(0, int(time.perf_counter() * 1000) - started_ms)
      version = int(profile["enrollmentVersion"])
    else:
      if profile.get("algorithm") != "SFace":
        raise ValueError("SFace profile unavailable")
      reference = self._cipher.decrypt(_encrypted_descriptor(profile))
      verification = self._verifier.verify(candidate, reference)
      version = int(profile["enrollmentVersion"])
      result_name = "matched" if verification.matched else "mismatch"
      similarity = verification.similarity
      action = "verify"
      latency_ms = verification.latency_ms
    check = await self._repository.record_check({
      "sessionId": session_id,
      "jobId": job_id,
      "profileId": profile["id"],
      "result": result_name,
      "similarity": similarity,
      "threshold": self._verifier.threshold,
      "enrollmentVersion": version,
      "modelName": "SFace",
      "detectorName": "yunet",
      "metricName": "cosine",
      "latencyMs": latency_ms,
    })
    await self._repository.record_audit({
      "sessionId": session_id, "jobId": job_id, "profileId": profile["id"],
      "moodleUserId": moodle_user_id, "action": action,
      "modelName": "SFace", "detectorName": "yunet", "metricName": "cosine",
      "threshold": self._verifier.threshold, "result": result_name,
      "latencyMs": latency_ms,
    })
    return ProfileCheckResult(
      result_name, str(profile["id"]), str(check["id"]), version, similarity, self._verifier.threshold
    )


def _encrypted_descriptor(profile: dict[str, Any]) -> EncryptedDescriptor:
  value = profile.get("encryptedDescriptor")
  if not isinstance(value, EncryptedDescriptor):
    raise ValueError("SFace profile unavailable")
  return value


class MonitoringIdentityService:
  """Single-sample, cadence-controlled SFace monitoring verification."""

  def __init__(self, repository: ProfileRepository, cipher: DescriptorCipher, verifier: SFaceVerifier) -> None:
    self._repository = repository
    self._cipher = cipher
    self._verifier = verifier

  async def verify_monitoring(
    self, *, session_id: str, job_id: str, moodle_user_id: str, descriptor: Sequence[float]
  ) -> bool:
    profile = await self._repository.find_active(moodle_user_id)
    if not profile or profile.get("algorithm") != "SFace":
      raise ValueError("SFace profile unavailable")
    reference = self._cipher.decrypt(_encrypted_descriptor(profile))
    verification = self._verifier.verify(descriptor, reference)
    result = "matched" if verification.matched else "mismatch"
    common = {
      "sessionId": session_id, "jobId": job_id, "profileId": profile["id"],
      "result": result, "similarity": verification.similarity, "threshold": self._verifier.threshold,
      "enrollmentVersion": int(profile["enrollmentVersion"]), "modelName": "SFace",
      "detectorName": "yunet", "metricName": "cosine", "latencyMs": verification.latency_ms,
    }
    await self._repository.record_check(common)
    await self._repository.record_audit({
      **common, "moodleUserId": moodle_user_id, "action": "verify"
    })
    return verification.matched
