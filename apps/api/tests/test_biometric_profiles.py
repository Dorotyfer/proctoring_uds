import asyncio
import math

from proctoring.services.profiles import MonitoringIdentityService, SFaceProfileService
from proctoring.services.vision import DescriptorCipher, SFaceVerifier


class ProfileRepository:
  def __init__(self, active=None) -> None:
    self.active = active
    self.history = []
    self.checks = []
    self.audits = []

  async def find_active(self, moodle_user_id):
    return self.active

  async def replace_active(self, input_data):
    if self.active:
      self.history.append(self.active | {"status": "revoked"})
    self.active = {"id": f"profile-{input_data['enrollmentVersion']}", "status": "active", **input_data}
    return self.active

  async def record_check(self, input_data):
    self.checks.append(input_data)
    return {"id": f"check-{len(self.checks)}", **input_data}

  async def record_audit(self, input_data):
    self.audits.append(input_data)


def test_profile_service_enrolls_medoid_and_records_check_and_audit() -> None:
  repository = ProfileRepository()
  cipher = DescriptorCipher(b"b" * 32)
  service = SFaceProfileService(repository, cipher, SFaceVerifier())

  result = asyncio.run(service.enroll_or_verify(
    session_id="session-1", job_id="job-1", moodle_user_id="student-1",
    descriptors=((1.0, 0.0), (4.0, 1.0), (0.0, 1.0)),
    consent_version="biometric-v2"
  ))

  assert result.status == "enrolled"
  assert result.enrollment_version == 1
  assert cipher.decrypt(repository.active["encryptedDescriptor"]) == pytest.approx((0.9701425, 0.2425356))
  assert repository.checks[0]["result"] == "enrolled"
  assert repository.checks[0]["modelName"] == "SFace"
  assert repository.checks[0]["detectorName"] == "yunet"
  assert repository.checks[0]["metricName"] == "cosine"
  assert isinstance(repository.checks[0]["latencyMs"], int)
  assert repository.audits[0]["action"] == "enroll"


def test_profile_service_matches_or_rejects_sface_and_records_every_check() -> None:
  cipher = DescriptorCipher(b"b" * 32)
  profile = {
    "id": "profile-1", "algorithm": "SFace", "enrollmentVersion": 1,
    "encryptedDescriptor": cipher.encrypt((1.0, 0.0)), "status": "active"
  }
  repository = ProfileRepository(profile)
  service = SFaceProfileService(repository, cipher, SFaceVerifier(threshold=0.593))

  matched = asyncio.run(service.enroll_or_verify(
    session_id="session-1", job_id="job-1", moodle_user_id="student-1",
    descriptors=((1.0, 0.0), (1.0, 0.0), (1.0, 0.0)), consent_version="biometric-v2"
  ))
  mismatch = asyncio.run(service.enroll_or_verify(
    session_id="session-2", job_id="job-2", moodle_user_id="student-1",
    descriptors=((0.0, 1.0), (0.0, 1.0), (0.0, 1.0)), consent_version="biometric-v2"
  ))

  assert matched.status == "matched"
  assert mismatch.status == "mismatch"
  assert [check["result"] for check in repository.checks] == ["matched", "mismatch"]
  assert all(check["threshold"] == 0.593 for check in repository.checks)
  assert [audit["action"] for audit in repository.audits] == ["verify", "verify"]


def test_profile_service_replaces_revoked_history_with_one_new_active_version() -> None:
  cipher = DescriptorCipher(b"b" * 32)
  legacy = {
    "id": "legacy", "algorithm": "Human", "enrollmentVersion": 3,
    "encryptedDescriptor": cipher.encrypt((1.0, 0.0)), "status": "revoked"
  }
  repository = ProfileRepository()
  repository.history.append(legacy)
  repository.active = None
  service = SFaceProfileService(repository, cipher, SFaceVerifier())

  result = asyncio.run(service.enroll_or_verify(
    session_id="session-1", job_id="job-1", moodle_user_id="student-1",
    descriptors=((1.0, 0.0), (1.0, 0.0), (1.0, 0.0)), consent_version="biometric-v2",
    previous_enrollment_version=3
  ))

  assert result.enrollment_version == 4
  assert repository.active["algorithm"] == "SFace"
  assert repository.history[0]["algorithm"] == "Human"


# Imported late so the test body above remains focused on the service contract.
import pytest


def test_monitoring_identity_decrypts_only_active_sface_and_records_check() -> None:
  cipher = DescriptorCipher(b"b" * 32)
  repository = ProfileRepository({
    "id": "profile-1", "algorithm": "SFace", "enrollmentVersion": 1,
    "encryptedDescriptor": cipher.encrypt((1.0, 0.0)), "status": "active"
  })
  service = MonitoringIdentityService(repository, cipher, SFaceVerifier())

  matched = asyncio.run(service.verify_monitoring(
    session_id="session-1", job_id="job-1", moodle_user_id="student-1", descriptor=(1.0, 0.0)
  ))

  assert matched is True
  assert repository.checks[0]["result"] == "matched"
  assert repository.checks[0]["modelName"] == "SFace"
