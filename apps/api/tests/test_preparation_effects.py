import asyncio

from proctoring_api.services.effects import PreparationEffects


class Repository:
  def __init__(self): self.calls = []
  async def activate(self, session_id, job_id, identity, profile): self.calls.append(("activate", session_id, identity, profile.status))
  async def biometric_mismatch(self, session_id, job_id): self.calls.append(("biometric_mismatch", session_id))
  async def analysis_unavailable(self, session_id, job_id, activate): self.calls.append(("analysis_unavailable", session_id, activate))


class Profile:
  def __init__(self, status): self.status = status; self.enrollment_version = 2


def test_successful_liveness_and_identity_activates_pending_session_automatically() -> None:
  repository = Repository()
  effects = PreparationEffects(repository)

  result = asyncio.run(effects.apply(
    session_id="session-1", job_id="job-1", identity_frame=b"private", liveness_passed=True,
    profile=Profile("matched"), failure_policy="block"
  ))

  assert result == {"liveness": "passed", "identity": "matched", "profileVersion": 2}
  assert repository.calls == [("activate", "session-1", b"private", "matched")]


def test_biometric_mismatch_keeps_preparation_blocked_and_emits_only_mismatch_alert() -> None:
  repository = Repository()
  effects = PreparationEffects(repository)

  result = asyncio.run(effects.apply(
    session_id="session-1", job_id="job-1", identity_frame=b"private", liveness_passed=True,
    profile=Profile("mismatch"), failure_policy="allow_with_alert"
  ))

  assert result["identity"] == "mismatch"
  assert repository.calls == [("biometric_mismatch", "session-1")]


def test_analysis_unavailable_obeys_block_or_allow_with_alert_without_touching_attempt() -> None:
  blocked_repository = Repository()
  allowed_repository = Repository()

  blocked = asyncio.run(PreparationEffects(blocked_repository).unavailable("session-1", "job-1", "block"))
  allowed = asyncio.run(PreparationEffects(allowed_repository).unavailable("session-2", "job-2", "allow_with_alert"))

  assert blocked == {"liveness": "unavailable", "identity": "unavailable", "profileVersion": None, "technicalAlert": True, "reasonCode": "model"}
  assert allowed == blocked
  assert blocked_repository.calls == [("analysis_unavailable", "session-1", False)]
  assert allowed_repository.calls == [("analysis_unavailable", "session-2", True)]
