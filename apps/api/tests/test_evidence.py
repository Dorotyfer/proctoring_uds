import asyncio
import base64
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from botocore.exceptions import (
  ClientError, EndpointConnectionError, NoCredentialsError, ParamValidationError, PartialCredentialsError
)

from proctoring_api.services.evidence_crypto import EvidenceCryptoError, EvidenceEncryptionService


# NIST SP 800-38D AES-256-GCM known-answer vector. Node's frozen
# createCipheriv('aes-256-gcm', key, iv) uses this same no-AAD wire format.
NODE_AES_256_GCM_FIXTURE = {
  "key": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  "keyVersion": None,
  "iv": "AAAAAAAAAAAAAAAA",
  "ciphertext": "zqdAPU1ga24HTsXTuvOdGA==",
  "tag": "0NHIp5mZa/AmW5i11Iq5GQ==",
  "plaintext": bytes(16)
}


def test_decrypts_a_fixed_node_compatible_aes_gcm_wire_object() -> None:
  fixture = NODE_AES_256_GCM_FIXTURE
  service = EvidenceEncryptionService(base64.b64decode(fixture["key"]), key_version=fixture["keyVersion"])

  plaintext = service.decrypt({
    "ciphertext": base64.b64decode(fixture["ciphertext"]),
    "iv": base64.b64decode(fixture["iv"]),
    "tag": base64.b64decode(fixture["tag"])
  })

  assert plaintext == fixture["plaintext"]


def test_encrypts_a_separate_iv_ciphertext_and_tag_wire_object() -> None:
  service = EvidenceEncryptionService(bytes(32))

  encrypted = service.encrypt(b"evidence-bytes")

  assert len(encrypted.iv) == 12
  assert len(encrypted.tag) == 16
  assert encrypted.ciphertext != b"evidence-bytes"
  assert service.decrypt(encrypted.wire_object()) == b"evidence-bytes"


@pytest.mark.parametrize("field", ["ciphertext", "tag"])
def test_rejects_corrupted_aes_gcm_data_without_crypto_details(field: str) -> None:
  service = EvidenceEncryptionService(bytes(32))
  encrypted = service.encrypt(b"capture")
  wire = encrypted.wire_object()
  value = bytearray(wire[field])
  value[0] ^= 1
  wire[field] = bytes(value)

  with pytest.raises(EvidenceCryptoError, match="^Evidence decryption failed$") as error:
    service.decrypt(wire)

  assert "tag" not in str(error.value).lower()
  assert "gcm" not in str(error.value).lower()


class AuthorizationFailure(Exception):
  status_code = 403


class StrictS3Client:
  def __init__(self, outcomes: list[object]) -> None:
    self._outcomes = iter(outcomes)
    self.calls: list[tuple[str, dict]] = []

  def put_object(self, **kwargs):
    self.calls.append(("put_object", kwargs))
    outcome = next(self._outcomes)
    if isinstance(outcome, Exception):
      raise outcome
    return outcome


def test_s3_retries_only_retryable_failures_and_keeps_encrypted_content_type() -> None:
  from proctoring_api.services.object_storage import S3ObjectStorage

  failure = EndpointConnectionError(endpoint_url="https://s3.example.edu")
  client = StrictS3Client([failure, failure, {}])
  storage = S3ObjectStorage("evidence", client=client, retry_delay=lambda _: None)

  asyncio.run(storage.put("session-1/alert/item.enc", b"ciphertext", "application/octet-stream"))

  assert len(client.calls) == 3
  assert client.calls[0][1] == {
    "Bucket": "evidence", "Key": "session-1/alert/item.enc", "Body": b"ciphertext",
    "ContentType": "application/octet-stream"
  }


def test_s3_retries_client_503_exactly_three_times() -> None:
  from proctoring_api.services.object_storage import S3ObjectStorage

  failure = ClientError({"Error": {"Code": "ServiceUnavailable"}, "ResponseMetadata": {"HTTPStatusCode": 503}}, "PutObject")
  client = StrictS3Client([failure, failure, {}])
  storage = S3ObjectStorage("evidence", client=client, retry_delay=lambda _: None)

  asyncio.run(storage.put("session-1/alert/item.enc", b"ciphertext", "application/octet-stream"))

  assert len(client.calls) == 3


def test_s3_does_not_retry_authorization_or_invalid_keys() -> None:
  from proctoring_api.services.object_storage import ObjectStorageError, S3ObjectStorage, StorageValidationError

  client = StrictS3Client([AuthorizationFailure()])
  storage = S3ObjectStorage("evidence", client=client, retry_delay=lambda _: None)

  with pytest.raises(ObjectStorageError, match="^Evidence storage unavailable$"):
    asyncio.run(storage.put("session-1/alert/item.enc", b"ciphertext", "application/octet-stream"))
  assert len(client.calls) == 1
  with pytest.raises(StorageValidationError, match="^Invalid evidence object key$"):
    asyncio.run(storage.put("../escape.enc", b"ciphertext", "application/octet-stream"))
  assert len(client.calls) == 1


@pytest.mark.parametrize("failure", [
  NoCredentialsError(), PartialCredentialsError(provider="test", cred_var="secret"),
  ParamValidationError(report="invalid request")
])
def test_s3_does_not_retry_credential_or_sdk_validation_failures(failure: Exception) -> None:
  from proctoring_api.services.object_storage import ObjectStorageError, S3ObjectStorage

  client = StrictS3Client([failure])
  storage = S3ObjectStorage("evidence", client=client, retry_delay=lambda _: None)

  with pytest.raises(ObjectStorageError, match="^Evidence storage unavailable$"):
    asyncio.run(storage.put("session-1/alert/item.enc", b"ciphertext", "application/octet-stream"))
  assert len(client.calls) == 1


class StrictStorage:
  def __init__(self, *, put_error: Exception | None = None, delete_error: Exception | None = None) -> None:
    self.put_error = put_error
    self.delete_error = delete_error
    self.actions: list[tuple[str, object]] = []
    self.objects: dict[str, bytes] = {}

  async def put(self, key: str, body: bytes, content_type: str) -> None:
    self.actions.append(("put", key))
    if self.put_error:
      raise self.put_error
    self.objects[key] = body

  async def get(self, key: str) -> bytes:
    self.actions.append(("get", key))
    return self.objects[key]

  async def delete(self, key: str) -> None:
    self.actions.append(("delete", key))
    if self.delete_error:
      raise self.delete_error
    self.objects.pop(key, None)


class ConcurrentStorage(StrictStorage):
  def __init__(self) -> None:
    super().__init__()
    self._puts = 0
    self._both_uploaded = asyncio.Event()

  async def put(self, key: str, body: bytes, content_type: str) -> None:
    await super().put(key, body, content_type)
    self._puts += 1
    if self._puts == 2:
      self._both_uploaded.set()
      return
    await self._both_uploaded.wait()


class StrictEvidenceRepository:
  def __init__(self, *, create_error: Exception | None = None) -> None:
    self.create_error = create_error
    self.created: list[dict] = []
    self.audits: list[dict] = []
    self.deleted: list[str] = []
    self.expired: list[dict] = []
    self.evidence: dict[str, dict] = {}
    self.event_evidence: dict[str, str] = {}

  async def create(self, input_data: dict) -> dict:
    self.created.append(input_data)
    if self.create_error:
      raise self.create_error
    event_id = input_data["eventId"]
    if event_id and event_id in self.event_evidence:
      return self.evidence[self.event_evidence[event_id]]
    record = {"id": "evidence-1", "courseId": "course-1", **input_data}
    self.evidence[record["id"]] = record
    if event_id:
      self.event_evidence[event_id] = record["id"]
    return record

  async def find_by_id(self, evidence_id: str) -> dict | None:
    return self.evidence.get(evidence_id)

  async def audit(self, input_data: dict) -> None:
    self.audits.append(input_data)

  async def find_expired(self, limit: int) -> list[dict]:
    return self.expired[:limit]

  async def mark_deleted(self, evidence_id: str) -> None:
    self.deleted.append(evidence_id)


def evidence_service(storage: StrictStorage | None = None, repository: StrictEvidenceRepository | None = None):
  from proctoring_api.services.evidence import EvidenceService
  return EvidenceService(
    EvidenceEncryptionService(bytes([7]) * 32), storage or StrictStorage(), repository or StrictEvidenceRepository(),
    retention_days=30, content_token_secret="evidence-content-token-secret-at-least-32", now=lambda: datetime.now(UTC)
  )


def test_evidence_uploads_encrypted_bytes_before_metadata() -> None:
  storage = StrictStorage()
  repository = StrictEvidenceRepository()
  service = evidence_service(storage, repository)

  evidence = asyncio.run(service.store_capture("session-1", "alert", b"jpeg-plaintext", event_id="event-1"))

  assert storage.actions[0][0] == "put"
  assert repository.created[0]["objectKey"].startswith("session-1/alert/")
  assert repository.created[0]["objectKey"].endswith(".enc")
  assert repository.created[0]["contentType"] == "image/jpeg"
  assert repository.created[0]["encryptionIv"] and repository.created[0]["encryptionTag"]
  assert b"jpeg-plaintext" not in storage.objects.values()
  assert evidence["id"] == "evidence-1"


def test_evidence_does_not_write_metadata_after_storage_failure() -> None:
  storage = StrictStorage(put_error=RuntimeError("network password=not-for-log"))
  repository = StrictEvidenceRepository()

  with pytest.raises(RuntimeError):
    asyncio.run(evidence_service(storage, repository).store_capture("session-1", "alert", b"capture"))

  assert repository.created == []


def test_evidence_compensates_with_delete_when_metadata_transaction_fails() -> None:
  storage = StrictStorage()
  repository = StrictEvidenceRepository(create_error=RuntimeError("database failure"))

  with pytest.raises(RuntimeError, match="database failure"):
    asyncio.run(evidence_service(storage, repository).store_capture("session-1", "alert", b"capture"))

  assert [action for action, _ in storage.actions] == ["put", "delete"]
  assert storage.objects == {}


def test_repeated_event_capture_keeps_the_first_metadata_and_deletes_the_losing_upload() -> None:
  storage = StrictStorage()
  repository = StrictEvidenceRepository()
  service = evidence_service(storage, repository)
  first = asyncio.run(service.store_capture("session-1", "alert", b"first-jpeg", event_id="event-1"))
  first_ciphertext = storage.objects[first["objectKey"]]

  second = asyncio.run(service.store_capture("session-1", "alert", b"second-jpeg", event_id="event-1"))

  assert repository.created[0]["objectKey"] != repository.created[1]["objectKey"]
  assert first["objectKey"] == second["objectKey"]
  assert second["id"] == first["id"]
  assert storage.objects == {first["objectKey"]: first_ciphertext}
  assert asyncio.run(service.read_authorized(first)) == b"first-jpeg"
  assert asyncio.run(service.read_authorized(second)) == b"first-jpeg"


def test_concurrent_event_capture_deletes_only_its_losing_upload_after_upsert() -> None:
  storage = ConcurrentStorage()
  repository = StrictEvidenceRepository()
  service = evidence_service(storage, repository)

  async def store_twice():
    return await asyncio.gather(
      service.store_capture("session-1", "alert", b"first-jpeg", event_id="event-1"),
      service.store_capture("session-1", "alert", b"second-jpeg", event_id="event-1")
    )
  first, second = asyncio.run(store_twice())

  canonical = first if first["objectKey"] in storage.objects else second
  assert first["id"] == second["id"] == "evidence-1"
  assert list(storage.objects) == [canonical["objectKey"]]
  assert asyncio.run(service.read_authorized(canonical)) in {b"first-jpeg", b"second-jpeg"}
  assert asyncio.run(service.read_authorized(first)) == asyncio.run(service.read_authorized(second))


def test_evidence_access_requires_alert_course_scope_and_audits_view_and_download() -> None:
  storage = StrictStorage()
  repository = StrictEvidenceRepository()
  service = evidence_service(storage, repository)
  evidence = asyncio.run(service.store_capture("session-1", "alert", b"jpeg", event_id="event-1"))

  token = asyncio.run(service.issue_content_token(
    evidence["id"], actor_id="reviewer-1", can_view_evidence=True,
    course_ids={"course-1"}, institutional=False, ip_address="203.0.113.4", user_agent="reviewer"
  ))
  content = asyncio.run(service.read_content(
    evidence["id"], token, ip_address=" 203.0.113.4 ", user_agent=(" reviewer-agent\r\n" + "x" * 600)
  ))

  assert content.body == b"jpeg"
  assert content.headers == {
    "Cache-Control": "private, no-store", "Content-Disposition": 'inline; filename="evidence.jpg"',
    "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff"
  }
  assert [item["action"] for item in repository.audits] == ["view", "download"]
  assert repository.audits[1]["ipAddress"] == "203.0.113.4"
  assert repository.audits[1]["userAgent"].startswith("reviewer-agent")
  assert len(repository.audits[1]["userAgent"]) == 512
  assert "\r" not in repository.audits[1]["userAgent"]


def test_evidence_content_fails_closed_for_invalid_token_and_unauthorized_scope() -> None:
  from proctoring_api.services.evidence import EvidenceAccessError

  storage = StrictStorage()
  repository = StrictEvidenceRepository()
  service = evidence_service(storage, repository)
  evidence = asyncio.run(service.store_capture("session-1", "alert", b"jpeg"))

  with pytest.raises(EvidenceAccessError, match="^Evidence access unavailable$"):
    asyncio.run(service.issue_content_token(evidence["id"], "reviewer", True, {"other-course"}, False, None, None))
  with pytest.raises(EvidenceAccessError, match="^Evidence content unavailable$"):
    asyncio.run(service.read_content(evidence["id"], "not-a-token"))
  assert repository.audits == []


def test_purge_deletes_object_audits_and_marks_metadata_only_after_delete() -> None:
  storage = StrictStorage()
  repository = StrictEvidenceRepository()
  repository.expired = [{"id": "expired-1", "objectKey": "session-1/alert/expired.enc"}]

  count = asyncio.run(evidence_service(storage, repository).purge_expired())

  assert count == 1
  assert storage.actions == [("delete", "session-1/alert/expired.enc")]
  assert repository.audits[0]["action"] == "retention_delete"
  assert repository.deleted == ["expired-1"]


class Available:
  async def check(self) -> None:
    return None


class Unavailable:
  async def check(self) -> None:
    raise RuntimeError("credential secret must never be exposed")


def test_ready_health_checks_db_storage_and_queue_without_exposing_failures() -> None:
  from fastapi.testclient import TestClient
  from proctoring_api.app import create_app
  from proctoring_api.services.readiness import ReadinessService

  client = TestClient(create_app(Available(), readiness_service=ReadinessService(Available(), Available(), Available())))
  response = client.get("/health/ready")
  assert response.status_code == 200
  assert response.json() == {"status": "ok", "database": "available", "storage": "available", "queue": "available"}

  unavailable = TestClient(create_app(Available(), readiness_service=ReadinessService(Available(), Unavailable(), Available())))
  response = unavailable.get("/health/ready")
  assert response.status_code == 503
  assert response.json() == {"status": "degraded", "database": "available", "storage": "unavailable", "queue": "available"}


def test_infrastructure_command_has_a_sanitized_nonzero_failure_exit(monkeypatch, capsys) -> None:
  from proctoring_api import cli

  async def unavailable() -> bool:
    raise RuntimeError("S3 secret-key must not be printed")
  monkeypatch.setattr(cli, "check_infrastructure", unavailable)

  with pytest.raises(SystemExit, match="1"):
    cli.check_infrastructure_main()

  assert capsys.readouterr().out == "Infrastructure unavailable\n"
