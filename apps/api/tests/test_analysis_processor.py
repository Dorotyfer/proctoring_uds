import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime

from proctoring.services.monitoring import ConfirmationResult
from proctoring.services.processor import AnalysisProcessor
from proctoring.services.vision import AnalyzedFace, FaceAnalysisError, FaceLandmarks


def analyzed(nose=(50.0, 55.0)):
  return AnalyzedFace(
    descriptor=(1.0, 0.0), is_real=True,
    landmarks=FaceLandmarks((30.0, 40.0), (70.0, 40.0), nose)
  )


class Faces:
  def __init__(self, faces): self.faces = iter(faces); self.calls = 0
  def analyze(self, frame): self.calls += 1; value = next(self.faces); return value() if callable(value) else value


class Objects:
  def __init__(self, anomaly=None): self.value = anomaly; self.calls = 0
  def detect(self, frame): self.calls += 1; return ()
  def anomaly(self, detections): return self.value


@dataclass
class Profile:
  status: str
  enrollment_version: int = 1


class Profiles:
  def __init__(self, status="matched"): self.status = status; self.calls = []
  async def enroll_or_verify(self, **kwargs): self.calls.append(kwargs); return Profile(self.status)


class Effects:
  def __init__(self): self.calls = []
  async def apply(self, **kwargs): self.calls.append(kwargs); profile = kwargs["profile"]; return {"liveness": "passed", "identity": profile.status, "profileVersion": profile.enrollment_version}


class Cadence:
  def __init__(self, answer): self.answer = answer
  async def should_run_sface(self, session_id, now): return self.answer


class Confirmations:
  def __init__(self, confirmed=()): self.confirmed = frozenset(confirmed); self.observed = []
  async def observe(self, session_id, anomalies, observed_at, *, observation_id=None):
    self.observed.append(anomalies)
    return ConfirmationResult(self.confirmed, 2 if anomalies and not self.confirmed else 0, 2)


class Identity:
  def __init__(self, matched): self.matched = matched; self.calls = 0
  async def verify_monitoring(self, **kwargs): self.calls += 1; return self.matched


class MonitoringEffects:
  def __init__(self): self.events = []
  async def emit(self, job, event_type, frame): self.events.append(event_type)


def preparation_job():
  return {
    "id": "job-1", "type": "preparation", "sessionId": "session-1", "moodleUserId": "student-1",
    "challengeSteps": ["center", "turn-left", "center"], "consentVersion": "biometric-v2",
    "failurePolicy": "block", "observedAt": datetime(2026, 8, 24, 12, 0, tzinfo=UTC)
  }


def monitoring_job():
  return {
    "id": "job-2", "type": "monitoring", "sessionId": "session-1",
    "observedAt": datetime(2026, 8, 24, 12, 1, tzinfo=UTC)
  }


def test_preparation_processor_validates_exact_challenge_and_activates_via_effects() -> None:
  faces = Faces([analyzed(), analyzed((34.0, 55.0)), analyzed()])
  profiles = Profiles("matched")
  effects = Effects()
  processor = AnalysisProcessor(faces, Objects(), profiles, effects, Cadence(False), Confirmations(), Identity(True), MonitoringEffects())

  result = asyncio.run(processor.process(preparation_job(), [b"one", b"two", b"three"]))

  assert result == {"liveness": "passed", "identity": "matched", "profileVersion": 1}
  assert faces.calls == 3
  assert len(profiles.calls[0]["descriptors"]) == 3
  assert effects.calls[0]["identity_frame"] == b"one"


def test_monitoring_runs_yunet_and_ssdlite_every_frame_but_sface_only_when_cadence_allows() -> None:
  faces = Faces([analyzed(), analyzed()])
  objects = Objects()
  identity = Identity(True)
  processor = AnalysisProcessor(faces, objects, Profiles(), Effects(), Cadence(False), Confirmations(), identity, MonitoringEffects())

  first = asyncio.run(processor.process(monitoring_job(), [b"frame"]))
  second = asyncio.run(processor.process(monitoring_job(), [b"frame"]))

  assert faces.calls == 2
  assert objects.calls == 2
  assert identity.calls == 0
  assert first["face"] == second["face"] == "present"


def test_monitoring_confirms_only_same_anomaly_and_emits_allowed_durable_alert() -> None:
  monitoring_effects = MonitoringEffects()
  confirmations = Confirmations({"environment_intrusion"})
  processor = AnalysisProcessor(
    Faces([analyzed()]), Objects("environment_intrusion"), Profiles(), Effects(), Cadence(True),
    confirmations, Identity(False), monitoring_effects
  )

  result = asyncio.run(processor.process(monitoring_job(), [b"frame"]))

  assert confirmations.observed == [{"environment_intrusion", "biometric_monitor_mismatch"}]
  assert monitoring_effects.events == ["environment_intrusion"]
  assert result == {"face": "present", "alert": True, "events": ["environment_intrusion"]}


def test_initial_monitoring_anomaly_recommends_two_followup_frames_two_seconds_apart() -> None:
  processor = AnalysisProcessor(
    Faces([analyzed()]), Objects("environment_intrusion"), Profiles(), Effects(), Cadence(False),
    Confirmations(), Identity(True), MonitoringEffects()
  )

  result = asyncio.run(processor.process(monitoring_job(), [b"frame"]))

  assert result["alert"] is False
  assert result["followUpFrames"] == 2
  assert result["followUpIntervalSeconds"] == 2


def test_face_absence_is_reported_without_raw_frame_or_forbidden_event_type() -> None:
  def absent(): raise FaceAnalysisError("face_absent", "Exactly one face is required")
  confirmations = Confirmations()
  processor = AnalysisProcessor(
    Faces([absent]), Objects(), Profiles(), Effects(), Cadence(True), confirmations,
    Identity(False), MonitoringEffects()
  )

  result = asyncio.run(processor.process(monitoring_job(), [b"private-frame"]))

  assert result == {"face": "absent", "alert": False, "events": []}
  assert confirmations.observed == [set()]
