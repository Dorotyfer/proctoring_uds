"""Deterministic preparation and monitoring analysis orchestration."""

from datetime import UTC, datetime
from typing import Any, Sequence

from proctoring.services.monitoring import ALLOWED_ANOMALIES
from proctoring.services.vision import FaceAnalysisError, validate_liveness


class AnalysisProcessor:
  def __init__(
    self,
    faces: Any,
    objects: Any,
    profiles: Any,
    preparation_effects: Any,
    cadence: Any,
    confirmations: Any,
    monitoring_identity: Any,
    monitoring_effects: Any,
  ) -> None:
    self._faces = faces
    self._objects = objects
    self._profiles = profiles
    self._preparation_effects = preparation_effects
    self._cadence = cadence
    self._confirmations = confirmations
    self._monitoring_identity = monitoring_identity
    self._monitoring_effects = monitoring_effects

  async def process(self, job: dict[str, Any], frames: Sequence[bytes]) -> dict[str, Any]:
    if job.get("type") == "preparation":
      return await self._preparation(job, frames)
    if job.get("type") == "monitoring":
      return await self._monitoring(job, frames)
    raise ValueError("Unsupported analysis job")

  async def unavailable(self, job: dict[str, Any]) -> dict[str, Any]:
    if job.get("type") == "preparation":
      return await self._preparation_effects.unavailable(
        job["sessionId"], job["id"], job["failurePolicy"]
      )
    if job.get("type") != "monitoring":
      raise ValueError("Unsupported analysis job")
    observed_at = job.get("observedAt") or datetime.now(UTC)
    confirmation = await self._confirmations.observe(
      job["sessionId"], {"analysis_unavailable"}, observed_at,
      observation_id=job["id"],
    )
    confirmed = sorted(name for name in confirmation.confirmed if name == "analysis_unavailable")
    for event_type in confirmed:
      await self._monitoring_effects.emit(job, event_type, b"")
    result: dict[str, Any] = {
      "face": "absent", "alert": bool(confirmed), "events": confirmed, "technicalAlert": True
    }
    if confirmation.follow_up_frames:
      result.update({
        "followUpFrames": confirmation.follow_up_frames,
        "followUpIntervalSeconds": confirmation.follow_up_interval_seconds,
      })
    return result

  async def cleanup(
    self, job: dict[str, Any], frame_metadata: Sequence[dict[str, Any]], result: dict[str, Any]
  ) -> None:
    effects = self._preparation_effects if job["type"] == "preparation" else self._monitoring_effects
    cleanup = getattr(effects, "cleanup", None)
    if cleanup is not None:
      await cleanup(job, frame_metadata, result)

  async def _preparation(self, job: dict[str, Any], frames: Sequence[bytes]) -> dict[str, Any]:
    if len(frames) != 3:
      raise ValueError("Preparation requires exactly three frames")
    faces = [self._faces.analyze(frame) for frame in frames]
    liveness = validate_liveness(
      faces,
      job["challengeSteps"],
      center_threshold=float(job.get("centerThreshold", 0.15)),
      turn_threshold=float(job.get("turnThreshold", 0.30)),
    )
    if not liveness.passed:
      return {"liveness": "failed", "identity": "unavailable", "profileVersion": None}
    profile = await self._profiles.enroll_or_verify(
      session_id=job["sessionId"], job_id=job["id"], moodle_user_id=job["moodleUserId"],
      descriptors=tuple(face.descriptor for face in faces),
      consent_version=job["consentVersion"],
      previous_enrollment_version=int(job.get("previousEnrollmentVersion", 0)),
    )
    return await self._preparation_effects.apply(
      session_id=job["sessionId"], job_id=job["id"], identity_frame=frames[0],
      liveness_passed=True, profile=profile, failure_policy=job["failurePolicy"],
    )

  async def _monitoring(self, job: dict[str, Any], frames: Sequence[bytes]) -> dict[str, Any]:
    if len(frames) != 1:
      raise ValueError("Monitoring requires exactly one frame")
    frame = frames[0]
    detections = self._objects.detect(frame)
    object_anomaly = self._objects.anomaly(detections)
    anomalies = {object_anomaly} if object_anomaly else set()
    face = None
    face_state = "present"
    try:
      face = self._faces.analyze(frame)
    except FaceAnalysisError as error:
      if error.code == "face_absent":
        face_state = "absent"
      elif error.code == "multiple_faces":
        face_state = "multiple"
      else:
        raise
    observed_at = job.get("observedAt") or datetime.now(UTC)
    if face is not None and await self._cadence.should_run_sface(job["sessionId"], observed_at):
      matched = await self._monitoring_identity.verify_monitoring(
        session_id=job["sessionId"], job_id=job["id"], moodle_user_id=job.get("moodleUserId", ""),
        descriptor=face.descriptor
      )
      if not matched:
        anomalies.add("biometric_monitor_mismatch")
    confirmation = await self._confirmations.observe(
      job["sessionId"], anomalies, observed_at, observation_id=job["id"]
    )
    confirmed = sorted(name for name in confirmation.confirmed if name in ALLOWED_ANOMALIES)
    for event_type in confirmed:
      await self._monitoring_effects.emit(job, event_type, frame)
    result: dict[str, Any] = {"face": face_state, "alert": bool(confirmed), "events": confirmed}
    if confirmation.follow_up_frames:
      result.update({
        "followUpFrames": confirmation.follow_up_frames,
        "followUpIntervalSeconds": confirmation.follow_up_interval_seconds,
      })
    return result
